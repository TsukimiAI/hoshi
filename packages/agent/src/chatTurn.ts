import { randomUUID } from "node:crypto";
import type {
  AgentEvent,
  CanvasItem,
  CanvasTurnActivityStep,
  ChatRequestBody,
  ChatSettings,
  Emotion,
  LlmUsage
} from "@hoshi/shared";
import { addUsage } from "@hoshi/shared";
import { canExtractMemory, extractLongTermOps } from "./memory/extract";
import { planMemoryWrites } from "./memory/apply";
import { selectMemoriesForInject } from "./memory/inject";
import { logMemoryTurn, summarizeWrites } from "./memory/log";
import type { OpenAiCompatClient } from "./llm/openai";
import { sanitizeChatImages } from "./llm/openai";
import type { AgentRuntime } from "./runtime";
import type { MemoryRepo } from "./storage/memoryRepo";
import type { SessionRepo } from "./storage/sessionRepo";

let extractQueue: Promise<void> = Promise.resolve();

export async function* runSessionChat(input: {
  repo: SessionRepo;
  memoryRepo: MemoryRepo;
  runtime: AgentRuntime;
  llm: OpenAiCompatClient;
  chatSettings: ChatSettings;
  sessionId: string;
  message: string;
  history: ChatRequestBody["history"];
  compactUsage?: LlmUsage;
  signal?: AbortSignal;
  canvasPrompt?: string;
  images?: ChatRequestBody["images"];
  workspace?: ChatRequestBody["workspace"];
  commitCanvas?: (input: {
    turnId: string;
    sessionId: string;
    userMessageId: string;
    steps: CanvasTurnActivityStep[];
  }) =>
    | { items: CanvasItem[]; validationError?: string }
    | Promise<{ items: CanvasItem[]; validationError?: string }>;
}): AsyncGenerator<AgentEvent> {
  const { repo, memoryRepo, runtime, llm, chatSettings, sessionId, history, compactUsage, signal } =
    input;
  const images = sanitizeChatImages(input.images);
  const message =
    (input.message ?? "").trim() || (images.length > 0 ? `（老师发来了 ${images.length} 张图片）` : "");
  const turnId = randomUUID();
  const chatStarted = Date.now();
  const runtimeBody: ChatRequestBody = {
    message,
    history,
    sessionId,
    images,
    workspace: input.workspace
  };
  const userMessageId = await repo.appendMessage({
    sessionId,
    role: "user",
    content: message
  });
  await repo.titleFromFirstUserMessage(sessionId, message);
  if (userMessageId) {
    yield { event: "turn", data: { turnId, sessionId, userMessageId } };
  }

  let assistantFull = "";
  let lastEmotion: Emotion | null = null;
  let chatUsage: LlmUsage | undefined;
  const unacked = await memoryRepo.listUnacked(2);
  const memories = await memoryRepo.listActive();
  const injectTexts = selectMemoriesForInject(memories, message).map((item) => item.text);
  const activitySteps: CanvasTurnActivityStep[] = [];
  try {
    for await (const event of runtime.chat(runtimeBody, {
      longTermMemories: injectTexts,
      memoryAckTexts: unacked.map((item) => item.text),
      canvasPrompt: input.canvasPrompt,
      signal,
      sessionId
    })) {
      if (signal?.aborted) {
        break;
      }
      if (event.event === "sentence") {
        assistantFull += event.data.text;
        lastEmotion = event.data.emotion;
      }
      if (event.event === "progress") {
        const data = event.data;
        if (data.phase === "think") {
          activitySteps.push({ kind: "think" });
        } else if (data.phase === "think_done") {
          const thinking = [...activitySteps]
            .reverse()
            .find((step) => step.kind === "think" && step.elapsedMs == null);
          if (thinking) {
            thinking.elapsedMs = data.elapsedMs;
            if (data.detail) thinking.detail = data.detail;
          }
        } else if (data.phase === "tool_start" && data.name) {
          activitySteps.push({ kind: "tool", name: data.name, detail: data.detail });
        } else if (data.phase === "tool_done" && data.name) {
          const pending = [...activitySteps]
            .reverse()
            .find((step) => step.kind === "tool" && step.name === data.name && step.elapsedMs == null);
          if (pending) {
            pending.elapsedMs = data.elapsedMs;
            if (data.detail) pending.detail = data.detail;
            if (data.ok === false) pending.ok = false;
          }
        }
      }
      if (event.event === "done") {
        if (input.commitCanvas && userMessageId) {
          const committed = await input.commitCanvas({
            turnId,
            sessionId,
            userMessageId,
            steps: activitySteps
          });
          yield {
            event: "canvas",
            data: {
              turnId,
              sessionId,
              items: committed.items,
              validationError: committed.validationError
            }
          };
        }
        const usage = addUsage(compactUsage, event.data.usage);
        chatUsage = usage;
        yield usage ? { event: "done", data: { ok: true, usage } } : event;
        continue;
      }
      yield event;
    }
  } catch (error) {
    if (!signal?.aborted) {
      throw error;
    }
  }
  if (signal?.aborted) {
    if (input.workspace === "desk") {
      await repo.appendMessage({
        sessionId,
        role: "assistant",
        content: assistantFull.trim() ? assistantFull : "已停止",
        emotion: lastEmotion
      });
    } else if (userMessageId && !assistantFull.trim()) {
      await repo.deleteMessage(userMessageId);
    } else if (assistantFull.trim()) {
      await repo.appendMessage({
        sessionId,
        role: "assistant",
        content: assistantFull,
        emotion: lastEmotion
      });
    }
    return;
  }
  if (assistantFull.trim() && unacked.length > 0) {
    await memoryRepo.markAcked(unacked.map((item) => item.id));
  }
  const extractPending =
    Boolean(assistantFull.trim()) &&
    canExtractMemory(chatSettings.memoryAutoWrite, message, assistantFull);
  logMemoryTurn({
    phase: "chat",
    sessionId,
    turnId,
    inject: injectTexts.length,
    ack: unacked.length,
    extract: extractPending ? "pending" : "skip",
    ms: Date.now() - chatStarted
  });
  if (!assistantFull.trim()) {
    return;
  }
  await repo.appendMessage({
    sessionId,
    role: "assistant",
    content: assistantFull,
    emotion: lastEmotion
  });
  if (!extractPending) {
    return;
  }
  const extractStarted = Date.now();
  const runExtract = async (): Promise<void> => {
    try {
      const ops = await extractLongTermOps({
        userText: message,
        assistantText: assistantFull,
        existing: (await memoryRepo.listActive()).map((item) => ({
          text: item.text,
          kind: item.kind,
          topic: item.topic
        })),
        completeChat: async (messages) => {
          const result = await llm.completeChat(messages, [], {
            enableSearch: false,
            timeoutMs: 20000,
            purpose: "extract",
            sessionId
          });
          return result.content;
        }
      });
      const latest = await memoryRepo.listActive();
      const writes = planMemoryWrites(ops, latest);
      for (const write of writes) {
        if (write.type === "insert") {
          await memoryRepo.insert(write.text, sessionId, write.kind, write.topic);
        } else if (write.type === "update") {
          await memoryRepo.updateText(write.id, write.text, {
            topic: write.topic,
            acked: false
          });
        } else {
          await memoryRepo.supersede(write.id);
        }
      }
      logMemoryTurn({
        phase: "extract",
        sessionId,
        turnId,
        write: summarizeWrites(writes),
        n: writes.length,
        ms: Date.now() - extractStarted
      });
    } catch {
      logMemoryTurn({
        phase: "extract",
        sessionId,
        turnId,
        write: "error",
        n: 0,
        ms: Date.now() - extractStarted
      });
    }
  };
  extractQueue = extractQueue.then(runExtract);
}
