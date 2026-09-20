"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAiCompatClient = void 0;
exports.buildChatCompletionBody = buildChatCompletionBody;
exports.toLlmMessages = toLlmMessages;
const shared_1 = require("@hoshi/shared");
const parseTool_1 = require("../plugins/parseTool");
function buildChatCompletionBody(model, messages, options) {
    const enableSearch = options.enableSearch !== false;
    const body = {
        model,
        stream: options.stream,
        messages
    };
    if (enableSearch) {
        body.enable_search = true;
        body.extra_body = { enable_search: true };
    }
    if (options.stream) {
        body.stream_options = { include_usage: true };
    }
    if (options.tools && options.tools.length > 0) {
        body.tools = options.tools;
        body.tool_choice = "auto";
    }
    return body;
}
function toLlmMessages(messages) {
    return messages.map((message) => ({
        role: message.role,
        content: message.content
    }));
}
function mergeTimeoutSignal(timeoutMs, signal) {
    const timeout = AbortSignal.timeout(timeoutMs);
    if (!signal) {
        return timeout;
    }
    if (typeof AbortSignal.any === "function") {
        return AbortSignal.any([timeout, signal]);
    }
    const merged = new AbortController();
    const onAbort = () => {
        merged.abort();
    };
    if (signal.aborted || timeout.aborted) {
        merged.abort();
        return merged.signal;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    timeout.addEventListener("abort", onAbort, { once: true });
    return merged.signal;
}
class OpenAiCompatClient {
    config;
    recordUsage;
    constructor(config, recordUsage) {
        this.config = config;
        this.recordUsage = recordUsage;
    }
    updateConfig(config) {
        this.config = config;
    }
    snapshot() {
        return { ...this.config };
    }
    noteUsage(purpose, usage, sessionId, model) {
        try {
            this.recordUsage?.({
                purpose,
                model: model ?? this.config.model,
                sessionId,
                usage
            });
        }
        catch {
            // ignore
        }
    }
    capture(usage, options, model) {
        if (!usage || !options?.purpose) {
            return;
        }
        this.noteUsage(options.purpose, usage, options.sessionId, model ?? options.model);
    }
    async completeChat(messages, tools = [], options) {
        const init = {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(buildChatCompletionBody(this.config.model, messages, {
                stream: false,
                tools,
                enableSearch: options?.enableSearch
            }))
        };
        if (options?.timeoutMs && options.timeoutMs > 0) {
            init.signal = AbortSignal.timeout(options.timeoutMs);
        }
        const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, init);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`LLM request failed: ${response.status} ${text.slice(0, 200)}`);
        }
        const result = (0, parseTool_1.parseCompleteChatResponse)((await response.json()));
        this.capture(result.usage, options);
        return result;
    }
    async transcribeWav(audioWavBase64, options) {
        const raw = audioWavBase64.trim().replace(/^data:audio\/wav;base64,/i, "");
        if (!raw) {
            return "";
        }
        const timeoutMs = options?.timeoutMs ?? 20000;
        const apiKey = options?.apiKey?.trim() || this.config.apiKey;
        const baseUrl = (options?.baseUrl?.trim() || this.config.baseUrl).replace(/\/$/, "");
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "qwen3-asr-flash",
                stream: false,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_audio",
                                input_audio: { data: `data:audio/wav;base64,${raw}` }
                            }
                        ]
                    }
                ],
                asr_options: { language: "zh", enable_itn: true }
            }),
            signal: mergeTimeoutSignal(timeoutMs, options?.signal)
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`ASR request failed: ${response.status} ${text.slice(0, 200)}`);
        }
        const json = (await response.json());
        this.capture((0, shared_1.parseUsage)(json.usage), {
            purpose: "asr",
            sessionId: options?.sessionId,
            model: "qwen3-asr-flash"
        }, "qwen3-asr-flash");
        const content = json.choices?.[0]?.message?.content;
        if (typeof content === "string") {
            return content.trim();
        }
        if (Array.isArray(content)) {
            return content
                .map((part) => {
                if (typeof part === "string") {
                    return part;
                }
                if (part && typeof part === "object" && "text" in part) {
                    return String(part.text ?? "");
                }
                return "";
            })
                .join("")
                .trim();
        }
        return "";
    }
    async *streamChat(messages, signal, options) {
        const response = await fetch(`${this.config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.config.apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(buildChatCompletionBody(this.config.model, messages, { stream: true })),
            signal
        });
        if (!response.ok || !response.body) {
            throw new Error(`LLM request failed: ${response.status}`);
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let lastUsage;
        const consumeBlock = (part) => {
            const dataLine = part.split("\n").find((line) => line.startsWith("data: "));
            if (!dataLine) {
                return [];
            }
            const payload = dataLine.slice(6).trim();
            if (payload === "[DONE]") {
                return "done";
            }
            const out = [];
            try {
                const json = JSON.parse(payload);
                const usage = (0, shared_1.parseUsage)(json.usage);
                if (usage) {
                    lastUsage = usage;
                    out.push({ kind: "usage", usage });
                }
                const content = json.choices?.[0]?.delta?.content;
                if (content) {
                    out.push({ kind: "delta", text: content });
                }
            }
            catch {
                return [];
            }
            return out;
        };
        for await (const chunk of response.body) {
            buffer += decoder.decode(chunk, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
                const result = consumeBlock(part);
                if (result === "done") {
                    this.capture(lastUsage, options);
                    return;
                }
                for (const item of result) {
                    yield item;
                }
            }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
            const result = consumeBlock(buffer);
            if (result !== "done") {
                for (const item of result) {
                    yield item;
                }
            }
        }
        this.capture(lastUsage, options);
    }
}
exports.OpenAiCompatClient = OpenAiCompatClient;
