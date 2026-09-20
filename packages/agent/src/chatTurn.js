"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSessionChat = runSessionChat;
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@hoshi/shared");
const extract_1 = require("./memory/extract");
const apply_1 = require("./memory/apply");
const inject_1 = require("./memory/inject");
const log_1 = require("./memory/log");
let extractQueue = Promise.resolve();
async function* runSessionChat(input) {
    const { repo, memoryRepo, runtime, llm, chatSettings, sessionId, message, history, compactUsage, signal } = input;
    const turnId = (0, node_crypto_1.randomUUID)();
    const chatStarted = Date.now();
    const runtimeBody = { message, history, sessionId };
    const userMessageId = await repo.appendMessage({
        sessionId,
        role: "user",
        content: message
    });
    await repo.titleFromFirstUserMessage(sessionId, message);
    let assistantFull = "";
    let lastEmotion = null;
    let chatUsage;
    const unacked = await memoryRepo.listUnacked(2);
    const memories = await memoryRepo.listActive();
    const injectTexts = (0, inject_1.selectMemoriesForInject)(memories, message).map((item) => item.text);
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
                const usage = (0, shared_1.addUsage)(compactUsage, event.data.usage);
                chatUsage = usage;
                yield usage ? { event: "done", data: { ok: true, usage } } : event;
                continue;
            }
            yield event;
        }
    }
    catch (error) {
        if (!signal?.aborted) {
            throw error;
        }
    }
    if (signal?.aborted) {
        if (userMessageId && !assistantFull.trim()) {
            await repo.deleteMessage(userMessageId);
        }
        else if (assistantFull.trim()) {
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
    const extractPending = Boolean(assistantFull.trim()) &&
        (0, extract_1.canExtractMemory)(chatSettings.memoryAutoWrite, message, assistantFull);
    (0, log_1.logMemoryTurn)({
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
    const runExtract = async () => {
        try {
            const ops = await (0, extract_1.extractLongTermOps)({
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
            const writes = (0, apply_1.planMemoryWrites)(ops, latest);
            for (const write of writes) {
                if (write.type === "insert") {
                    await memoryRepo.insert(write.text, sessionId, write.kind, write.topic);
                }
                else if (write.type === "update") {
                    await memoryRepo.updateText(write.id, write.text, {
                        topic: write.topic,
                        acked: false
                    });
                }
                else {
                    await memoryRepo.supersede(write.id);
                }
            }
            (0, log_1.logMemoryTurn)({
                phase: "extract",
                sessionId,
                turnId,
                write: (0, log_1.summarizeWrites)(writes),
                n: writes.length,
                ms: Date.now() - extractStarted
            });
        }
        catch {
            (0, log_1.logMemoryTurn)({
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
