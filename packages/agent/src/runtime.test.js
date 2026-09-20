"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const shared_1 = require("@hoshi/shared");
const runtime_1 = require("./runtime");
class FakeLlm {
    chunks;
    complete;
    streamUsage;
    lastStreamMessages = null;
    constructor(chunks, complete, streamUsage) {
        this.chunks = chunks;
        this.complete = complete;
        this.streamUsage = streamUsage;
    }
    async completeChat() {
        if (!this.complete) {
            throw new Error("completeChat should not be called");
        }
        return this.complete;
    }
    async *streamChat(messages) {
        this.lastStreamMessages = messages;
        for (const chunk of this.chunks) {
            yield { kind: "delta", text: chunk };
        }
        if (this.streamUsage) {
            yield { kind: "usage", usage: this.streamUsage };
        }
    }
}
function createPersona() {
    const sprites = Object.fromEntries(shared_1.EMOTIONS.map((emotion) => [emotion, `/tmp/${emotion}.png`]));
    return {
        id: "test",
        name: "test",
        systemPrompt: "test",
        defaultEmotion: "normal",
        thinkingEmotion: "expect",
        emotions: [...shared_1.EMOTIONS],
        sprites
    };
}
(0, vitest_1.describe)("AgentRuntime", () => {
    (0, vitest_1.it)("输出 thinking -> sentence -> done", async () => {
        const runtime = new runtime_1.AgentRuntime({
            persona: createPersona(),
            llm: new FakeLlm(["你好。⟦happy⟧"], undefined, {
                promptTokens: 12,
                completionTokens: 3,
                totalTokens: 15,
                cachedTokens: 0
            })
        });
        const events = [];
        for await (const e of runtime.chat({ message: "hi", history: [] })) {
            events.push(e);
        }
        (0, vitest_1.expect)(events[0]).toEqual({ event: "emotion", data: { emotion: "expect" } });
        (0, vitest_1.expect)(events[1]).toEqual({
            event: "sentence",
            data: { text: "你好。", emotion: "happy", index: 0 }
        });
        (0, vitest_1.expect)(events[events.length - 1]).toEqual({
            event: "done",
            data: {
                ok: true,
                usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15, cachedTokens: 0 }
            }
        });
    });
    (0, vitest_1.it)("空消息返回 error 事件", async () => {
        const runtime = new runtime_1.AgentRuntime({
            persona: createPersona(),
            llm: new FakeLlm(["ignored"])
        });
        const events = [];
        for await (const e of runtime.chat({ message: "   ", history: [] })) {
            events.push(e);
        }
        (0, vitest_1.expect)(events).toEqual([{ event: "error", data: { message: "message is required" } }]);
    });
    (0, vitest_1.it)("无显式标记时进行句级情绪回退判定", async () => {
        const runtime = new runtime_1.AgentRuntime({
            persona: createPersona(),
            llm: new FakeLlm(["太好了，谢谢老师。"])
        });
        const events = [];
        for await (const e of runtime.chat({ message: "hi", history: [] })) {
            events.push(e);
        }
        (0, vitest_1.expect)(events[1]).toEqual({
            event: "sentence",
            data: { text: "太好了，谢谢老师。", emotion: "happy", index: 0 }
        });
    });
    (0, vitest_1.it)("有 tool 时执行一轮再流式回复", async () => {
        const executed = [];
        const runtime = new runtime_1.AgentRuntime({
            persona: createPersona(),
            llm: new FakeLlm(["查到了。"], {
                content: "",
                toolCalls: [{ id: "call_1", name: "web_search", argumentsJson: "{\"query\":\"上海天气\"}" }]
            }),
            plugins: {
                tools: () => [
                    {
                        type: "function",
                        function: {
                            name: "web_search",
                            description: "search",
                            parameters: { type: "object", properties: {} }
                        }
                    }
                ],
                execute: async (name, args) => {
                    executed.push(`${name}:${String(args.query)}`);
                    return "晴";
                }
            }
        });
        const events = [];
        for await (const e of runtime.chat({ message: "天气", history: [] })) {
            events.push(e);
        }
        (0, vitest_1.expect)(executed).toEqual(["web_search:上海天气"]);
        (0, vitest_1.expect)(events[1]).toEqual({
            event: "sentence",
            data: { text: "查到了。", emotion: "normal", index: 0 }
        });
    });
    (0, vitest_1.it)("插件超时不挂死", async () => {
        const runtime = new runtime_1.AgentRuntime({
            persona: createPersona(),
            pluginTimeoutMs: 20,
            llm: new FakeLlm(["超时了。"], {
                content: "",
                toolCalls: [{ id: "call_1", name: "slow", argumentsJson: "{}" }]
            }),
            plugins: {
                tools: () => [
                    {
                        type: "function",
                        function: {
                            name: "slow",
                            description: "slow",
                            parameters: { type: "object", properties: {} }
                        }
                    }
                ],
                execute: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    return "late";
                }
            }
        });
        const events = [];
        for await (const e of runtime.chat({ message: "hi", history: [] })) {
            events.push(e);
        }
        (0, vitest_1.expect)(events.some((item) => item.event === "sentence")).toBe(true);
        (0, vitest_1.expect)(events.at(-1)).toEqual({ event: "done", data: { ok: true } });
    });
    (0, vitest_1.it)("无插件 tool 时不 completeChat，有参考站点则注入 system", async () => {
        const llm = new FakeLlm(["你好。"]);
        const runtime = new runtime_1.AgentRuntime({
            persona: createPersona(),
            llm: llm,
            referenceSites: "https://a.com"
        });
        const events = [];
        for await (const e of runtime.chat({ message: "hi", history: [] })) {
            events.push(e);
        }
        (0, vitest_1.expect)(events[1]).toMatchObject({ event: "sentence", data: { text: "你好。" } });
        const systems = llm.lastStreamMessages.filter((item) => item.role === "system");
        (0, vitest_1.expect)(systems[0]?.content).toBe("test");
        (0, vitest_1.expect)(systems[1]?.content).toContain("⟦emotion⟧");
        (0, vitest_1.expect)(systems[1]?.content).toContain("tool_call");
        (0, vitest_1.expect)(systems[1]?.content).toContain("～happy");
        (0, vitest_1.expect)(systems[2]?.content).toContain("https://a.com");
        (0, vitest_1.expect)(systems[2]?.content).toContain("先判断当前问题是否可能在这些站点上找到靠谱答案");
    });
    (0, vitest_1.it)("有长期记忆则注入 system，空表不插", async () => {
        const withMem = new FakeLlm(["你好。"]);
        const runtime = new runtime_1.AgentRuntime({
            persona: createPersona(),
            llm: withMem
        });
        for await (const _ of runtime.chat({ message: "hi", history: [] }, { longTermMemories: ["老师喜欢红茶"] })) {
            void _;
        }
        const systems = withMem.lastStreamMessages.filter((item) => item.role === "system");
        (0, vitest_1.expect)(systems.some((item) => item.content.includes("关于老师的长期记忆"))).toBe(true);
        (0, vitest_1.expect)(systems.some((item) => item.content.includes("老师喜欢红茶"))).toBe(true);
        const empty = new FakeLlm(["你好。"]);
        const emptyRuntime = new runtime_1.AgentRuntime({
            persona: createPersona(),
            llm: empty
        });
        for await (const _ of emptyRuntime.chat({ message: "hi", history: [] })) {
            void _;
        }
        const emptySystems = empty.lastStreamMessages.filter((item) => item.role === "system");
        (0, vitest_1.expect)(emptySystems.some((item) => item.content.includes("关于老师的长期记忆"))).toBe(false);
    });
});
