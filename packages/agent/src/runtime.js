"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRuntime = void 0;
const shared_1 = require("@hoshi/shared");
const openai_1 = require("./llm/openai");
const emotion_1 = require("./emotion");
const parseTool_1 = require("./plugins/parseTool");
const inject_1 = require("./memory/inject");
const searchPrompt_1 = require("./searchPrompt");
const sentence_1 = require("./sentence");
class AgentRuntime {
    config;
    referenceSites;
    constructor(config) {
        this.config = config;
        this.referenceSites = config.referenceSites ?? "";
    }
    pluginTimeoutMs() {
        return this.config.pluginTimeoutMs ?? 15000;
    }
    setReferenceSites(referenceSites) {
        this.referenceSites = referenceSites;
    }
    async *chat(body, extra) {
        const message = body.message?.trim();
        if (!message) {
            yield { event: "error", data: { message: "message is required" } };
            return;
        }
        yield {
            event: "emotion",
            data: { emotion: this.config.persona.thinkingEmotion }
        };
        const promptMessages = [
            { role: "system", content: this.config.persona.systemPrompt },
            { role: "system", content: searchPrompt_1.SEARCH_USAGE_PROMPT }
        ];
        const sitePrompt = (0, searchPrompt_1.buildSearchSitesPrompt)((0, searchPrompt_1.parseSiteLines)(this.referenceSites));
        if (sitePrompt) {
            promptMessages.push({ role: "system", content: sitePrompt });
        }
        const memoryPrompt = (0, inject_1.buildMemoryInjectPrompt)(extra?.longTermMemories ?? []);
        if (memoryPrompt) {
            promptMessages.push({ role: "system", content: memoryPrompt });
        }
        const ackPrompt = (0, inject_1.buildMemoryAckPrompt)(extra?.memoryAckTexts ?? []);
        if (ackPrompt) {
            promptMessages.push({ role: "system", content: ackPrompt });
        }
        promptMessages.push(...(body.history ?? []), { role: "user", content: message });
        const messages = (0, openai_1.toLlmMessages)(promptMessages);
        const sessionId = extra?.sessionId ?? body.sessionId;
        const tools = this.config.plugins?.tools() ?? [];
        let speakMessages = messages;
        let turnUsage;
        if (tools.length > 0) {
            const complete = await this.config.llm.completeChat(messages, tools, {
                timeoutMs: 20000,
                sessionId
            });
            if (complete.usage) {
                this.config.llm.noteUsage?.(complete.toolCalls.length > 0 ? "tool" : "chat", complete.usage, sessionId);
            }
            turnUsage = (0, shared_1.addUsage)(turnUsage, complete.usage);
            if (extra?.signal?.aborted) {
                return;
            }
            if (complete.toolCalls.length > 0) {
                const assistantToolCalls = complete.toolCalls.map((call) => ({
                    id: call.id,
                    type: "function",
                    function: { name: call.name, arguments: call.argumentsJson }
                }));
                speakMessages = [
                    ...messages,
                    { role: "assistant", content: complete.content || null, tool_calls: assistantToolCalls }
                ];
                for (const call of complete.toolCalls) {
                    if (extra?.signal?.aborted) {
                        return;
                    }
                    const result = await withTimeout(this.config.plugins.execute(call.name, (0, parseTool_1.parseToolArgs)(call.argumentsJson)), this.pluginTimeoutMs(), `tool ${call.name} timeout`).catch((error) => (error instanceof Error ? error.message : "tool failed"));
                    speakMessages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: result
                    });
                }
            }
            else {
                yield* this.emitText(complete.content);
                yield doneEvent(turnUsage);
                return;
            }
        }
        try {
            yield* this.streamSentences(speakMessages, extra?.signal, (usage) => {
                turnUsage = (0, shared_1.addUsage)(turnUsage, usage);
            }, sessionId);
            if (extra?.signal?.aborted) {
                return;
            }
            yield doneEvent(turnUsage);
        }
        catch (error) {
            if (extra?.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
                return;
            }
            throw error;
        }
    }
    async *streamSentences(messages, signal, onUsage, sessionId) {
        const splitter = new sentence_1.SentenceSplitter();
        let index = 0;
        for await (const part of this.config.llm.streamChat(messages, signal, {
            purpose: "chat",
            sessionId
        })) {
            if (signal?.aborted) {
                return;
            }
            if (part.kind === "usage") {
                onUsage?.(part.usage);
                continue;
            }
            for (const sentence of splitter.push(part.text)) {
                const event = this.toSentence(sentence, index);
                if (event) {
                    index += 1;
                    yield event;
                }
            }
        }
        for (const sentence of splitter.flush()) {
            const event = this.toSentence(sentence, index);
            if (event) {
                index += 1;
                yield event;
            }
        }
    }
    async *emitText(text) {
        const splitter = new sentence_1.SentenceSplitter();
        let index = 0;
        for (const sentence of splitter.push(text)) {
            const event = this.toSentence(sentence, index);
            if (event) {
                index += 1;
                yield event;
            }
        }
        for (const sentence of splitter.flush()) {
            const event = this.toSentence(sentence, index);
            if (event) {
                index += 1;
                yield event;
            }
        }
    }
    toSentence(sentence, index) {
        const parsed = (0, emotion_1.resolveSentenceEmotion)(sentence, this.config.persona.defaultEmotion);
        if (!parsed.text || !(0, sentence_1.hasSpeechContent)(parsed.text)) {
            return null;
        }
        return {
            event: "sentence",
            data: {
                text: parsed.text,
                emotion: parsed.emotion,
                index
            }
        };
    }
}
exports.AgentRuntime = AgentRuntime;
function doneEvent(usage) {
    return usage
        ? { event: "done", data: { ok: true, usage } }
        : { event: "done", data: { ok: true } };
}
async function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    }
    finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}
