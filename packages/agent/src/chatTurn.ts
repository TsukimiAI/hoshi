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
import { selectAckedMemoryIds } from "./memory/inject";
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
  const activitySteps: CanvasTurnActivityStep[] = [];
  const extractPending = canExtractMemory(chatSettings.memoryAutoWrite, message);

  const finishIfAborted = async (): Promise<boolean> => {
    if (!signal?.aborted) {
      return false;
    }
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
    return true;
  };

  if (await finishIfAborted()) {
    return;
  }

  if (extractPending) {
    const extractStarted = Date.now();
    yield { event: "progress", data: { phase: "tool_start", name: "记忆" } };
    activitySteps.push({ kind: "tool", name: "记忆" });
    let extractOk = true;
    const runExtract = async (): Promise<void> => {
      try {
        const ops = await extractLongTermOps({
          userText: message,
          existing: (await memoryRepo.neighborsForExtract(message)).map((item) => ({
            id: item.id,
            text: item.text,
            kind: item.kind,
            topic: item.topic
          })),
          completeChat: async (messages) => {
            const result = await llm.completeChat(messages, [], {
              enableSearch: false,
              timeoutMs: 20000,
              purpose: "extract",
              sessionId,
              temperature: 0
            });
            return result.content;
          }
        });
        const latest = await memoryRepo.listActive();
        const similar = await memoryRepo.similarForTexts(ops.map((op) => op.text));
        const writes = planMemoryWrites(ops, latest, similar);
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
        extractOk = false;
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
    const queued = extractQueue.then(runExtract);
    extractQueue = queued.then(
      () => undefined,
      () => undefined
    );
    await queued;
    const elapsedMs = Date.now() - extractStarted;
    const pending = [...activitySteps]
      .reverse()
      .find((step) => step.kind === "tool" && step.name === "记忆" && step.elapsedMs == null);
    if (pending) {
      pending.elapsedMs = elapsedMs;
      if (!extractOk) pending.ok = false;
    }
    yield {
      event: "progress",
      data: { phase: "tool_done", name: "记忆", elapsedMs, ok: extractOk }
    };
  }

  if (await finishIfAborted()) {
    return;
  }

  const unacked = await memoryRepo.listUnacked(2);
  const injectItems = await memoryRepo.retrieveForInject(message);
  const injectTexts = injectItems.map((item) => item.text);
  try {
    for await (const event of runtime.chat(runtimeBody, {
      longTermMemories: injectItems,
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
  if (await finishIfAborted()) {
    return;
  }
  const ackedIds =
    assistantFull.trim() && unacked.length > 0 ? selectAckedMemoryIds(assistantFull, unacked) : [];
  if (ackedIds.length > 0) {
    await memoryRepo.markAcked(ackedIds);
  }
  logMemoryTurn({
    phase: "chat",
    sessionId,
    turnId,
    inject: injectTexts.length,
    ack: ackedIds.length,
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
}
