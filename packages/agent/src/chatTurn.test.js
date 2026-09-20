"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const chatTurn_1 = require("./chatTurn");
const runtime_1 = require("./runtime");
const shared_1 = require("@hoshi/shared");
function persona() {
    const sprites = Object.fromEntries(shared_1.EMOTIONS.map((emotion) => [emotion, `/tmp/${emotion}.png`]));
    return {
        id: "t",
        name: "t",
        systemPrompt: "t",
        defaultEmotion: "normal",
        thinkingEmotion: "expect",
        emotions: [...shared_1.EMOTIONS],
        sprites
    };
}
class SilentLlm {
    async completeChat() {
        throw new Error("no complete");
    }
    async *streamChat() {
        return;
    }
}
function repoStub(deleted) {
    return {
        appendMessage: vitest_1.vi.fn(async () => "user-1"),
        titleFromFirstUserMessage: vitest_1.vi.fn(async () => undefined),
        deleteMessage: vitest_1.vi.fn(async (id) => {
            deleted.push(id);
        })
    };
}
(0, vitest_1.describe)("runSessionChat abort", () => {
    (0, vitest_1.it)("无助手则删用户消息", async () => {
        const deleted = [];
        const repo = repoStub(deleted);
        const ac = new AbortController();
        ac.abort();
        const runtime = new runtime_1.AgentRuntime({ persona: persona(), llm: new SilentLlm() });
        const events = [];
        for await (const event of (0, chatTurn_1.runSessionChat)({
            repo: repo,
            memoryRepo: {
                listUnacked: async () => [],
                listActive: async () => [],
                markAcked: async () => undefined
            },
            runtime,
            llm: new SilentLlm(),
            chatSettings: {
                contextBudget: 8000,
                compactTriggerToken: 6000,
                compactTriggerMsgCount: 80,
                compactKeepRecent: 24,
                referenceSites: "",
                memoryAutoWrite: false
            },
            sessionId: "s",
            message: "hi",
            history: [],
            signal: ac.signal
        })) {
            events.push(event);
        }
        (0, vitest_1.expect)(deleted).toEqual(["user-1"]);
        (0, vitest_1.expect)(repo.deleteMessage).toHaveBeenCalledTimes(1);
    });
    (0, vitest_1.it)("有助手文本不删", async () => {
        const deleted = [];
        const repo = repoStub(deleted);
        const ac = new AbortController();
        const runtime = {
            async *chat() {
                yield { event: "sentence", data: { text: "答。", emotion: "normal", index: 0 } };
                ac.abort();
            }
        };
        for await (const _event of (0, chatTurn_1.runSessionChat)({
            repo: repo,
            memoryRepo: {
                listUnacked: async () => [],
                listActive: async () => [],
                markAcked: async () => undefined
            },
            runtime: runtime,
            llm: new SilentLlm(),
            chatSettings: {
                contextBudget: 8000,
                compactTriggerToken: 6000,
                compactTriggerMsgCount: 80,
                compactKeepRecent: 24,
                referenceSites: "",
                memoryAutoWrite: false
            },
            sessionId: "s",
            message: "hi",
            history: [],
            signal: ac.signal
        })) {
            // drain
        }
        (0, vitest_1.expect)(deleted).toEqual([]);
    });
});
