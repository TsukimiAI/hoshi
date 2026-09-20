import { randomUUID } from "node:crypto";
import type { AgentEvent, ChatRequestBody, ChatSettings, Emotion, LlmUsage } from "@hoshi/shared";
import { addUsage } from "@hoshi/shared";
import { canExtractMemory, extractLongTermOps } from "./memory/extract";
import { planMemoryWrites } from "./memory/apply";
import { selectMemoriesForInject } from "./memory/inject";
import { logMemoryTurn, summarizeWrites } from "./memory/log";
import type { OpenAiCompatClient } from "./llm/openai";
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
}): AsyncGenerator<AgentEvent> {
  const { repo, memoryRepo, runtime, llm, chatSettings, sessionId, message, history, compactUsage, signal } =
    input;
  const turnId = randomUUID();
  const chatStarted = Date.now();
  const runtimeBody: ChatRequestBody = { message, history, sessionId };
  const userMessageId = await repo.appendMessage({
    sessionId,
    role: "user",
    content: message
  });
  await repo.titleFromFirstUserMessage(sessionId, message);

  let assistantFull = "";
  let lastEmotion: Emotion | null = null;
  let chatUsage: LlmUsage | undefined;
  const unacked = await memoryRepo.listUnacked(2);
  const memories = await memoryRepo.listActive();
  const injectTexts = selectMemoriesForInject(memories, message).map((item) => item.text);
  try {
    for await (const event of runtime.chat(runtimeBody, {
      longTermMemories: injectTexts,
      memoryAckTexts: unacked.map((item) => item.text),
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
      if (event.event === "done") {
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
    if (userMessageId && !assistantFull.trim()) {
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
