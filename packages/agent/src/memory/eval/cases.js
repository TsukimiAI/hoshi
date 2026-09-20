"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVAL_CASES = void 0;
const TEA = {
    id: "tea",
    kind: "preference",
    topic: "drink",
    text: "老师平时喜欢喝红茶"
};
exports.EVAL_CASES = [
    {
        id: "g-weather",
        bucket: "abstain_gate",
        user: "今天上海天气怎么样",
        assistant: "今天上海晴。",
        expectGate: false,
        ops: [],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "g-code",
        bucket: "abstain_gate",
        user: "帮我写一段代码",
        assistant: "好的老师。",
        expectGate: false,
        ops: [],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "g-compile",
        bucket: "abstain_gate",
        user: "这个函数怎么编译",
        assistant: "用 tsc。",
        expectGate: false,
        ops: [],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "g-news",
        bucket: "abstain_gate",
        user: "新闻联播看了吗",
        assistant: "没有看。",
        expectGate: false,
        ops: [],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "g-ok",
        bucket: "abstain_gate",
        user: "嗯好的",
        assistant: "嗯。",
        expectGate: false,
        ops: [],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "g-traceback",
        bucket: "abstain_gate",
        user: "帮我看看这个报错 traceback",
        assistant: "是空指针。",
        expectGate: false,
        ops: [],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "r-weather",
        bucket: "remember_override",
        user: "请记住今天天气",
        assistant: "今天晴。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "other", topic: "", text: "老师请记住今天天气晴朗" }],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "r-news",
        bucket: "remember_override",
        user: "请记住新闻联播要点",
        assistant: "好的。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "other", topic: "", text: "老师请记住新闻联播要点" }],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "w-name",
        bucket: "write_insert",
        user: "我叫韩",
        assistant: "好的韩老师。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "identity", topic: "name", text: "老师希望被叫做韩" }],
        expectWrites: [{ type: "insert", topic: "name", kind: "identity" }],
        live: { kind: "must_hit", keywords: ["韩"] }
    },
    {
        id: "w-tea",
        bucket: "write_insert",
        user: "请记住我喜欢喝红茶",
        assistant: "记下了。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "preference", topic: "drink", text: "老师平时喜欢喝红茶" }],
        expectWrites: [{ type: "insert", topic: "drink", kind: "preference" }],
        live: { kind: "must_hit", keywords: ["红茶"] }
    },
    {
        id: "w-job",
        bucket: "write_insert",
        user: "我是研究生",
        assistant: "明白。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "identity", topic: "job", text: "老师目前是研究生" }],
        expectWrites: [{ type: "insert", topic: "job", kind: "identity" }],
        live: { kind: "must_hit", keywords: ["研究生"] }
    },
    {
        id: "w-call",
        bucket: "write_insert",
        user: "以后叫我老师就行",
        assistant: "好的老师。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "agreement", topic: "name", text: "老师希望被叫做老师" }],
        expectWrites: [{ type: "insert", topic: "name", kind: "agreement" }],
        live: { kind: "skip" }
    },
    {
        id: "w-coffee",
        bucket: "write_insert",
        user: "别忘了老师不喝咖啡",
        assistant: "记下了。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "preference", topic: "drink", text: "老师平时不喝咖啡" }],
        expectWrites: [{ type: "insert", topic: "drink", kind: "preference" }],
        live: { kind: "must_hit", keywords: ["咖啡"] }
    },
    {
        id: "u-tea-stop",
        bucket: "write_update",
        user: "请记住我现在不喝红茶了",
        assistant: "记下了。",
        existing: [TEA],
        expectGate: true,
        ops: [{ action: "upsert", kind: "preference", topic: "", text: "老师现在不喝红茶了" }],
        expectWrites: [{ type: "update", id: "tea", topic: "drink" }],
        live: { kind: "update", keywords: ["红茶"] }
    },
    {
        id: "u-name",
        bucket: "write_update",
        user: "以后叫我韩老师",
        assistant: "好的韩老师。",
        existing: [
            {
                id: "name",
                kind: "identity",
                topic: "name",
                text: "老师希望被叫做小韩"
            }
        ],
        expectGate: true,
        ops: [{ action: "upsert", kind: "identity", topic: "name", text: "老师希望被叫做韩老师" }],
        expectWrites: [{ type: "update", id: "name", topic: "name" }],
        live: { kind: "update", keywords: ["韩"] }
    },
    {
        id: "u-coffee-to-tea",
        bucket: "write_update",
        user: "请记住我不喝咖啡了改喝红茶",
        assistant: "记下了。",
        existing: [
            {
                id: "coffee",
                kind: "preference",
                topic: "drink",
                text: "老师平时不喝咖啡"
            }
        ],
        expectGate: true,
        ops: [{ action: "upsert", kind: "preference", topic: "drink", text: "老师现在喜欢喝红茶" }],
        expectWrites: [{ type: "update", id: "coffee", topic: "drink" }],
        live: { kind: "update", keywords: ["红茶"] }
    },
    {
        id: "i-overtime",
        bucket: "write_insert_other_bucket",
        user: "请记住老师周末经常加班写代码",
        assistant: "辛苦了。",
        existing: [TEA],
        expectGate: true,
        ops: [{ action: "upsert", kind: "habit", topic: "", text: "老师周末经常加班写代码" }],
        expectWrites: [{ type: "insert", topic: "schedule", kind: "habit" }],
        live: { kind: "must_hit", keywords: ["加班"] }
    },
    {
        id: "i-night",
        bucket: "write_insert_other_bucket",
        user: "我习惯晚上写代码",
        assistant: "好。",
        existing: [TEA],
        expectGate: true,
        ops: [{ action: "upsert", kind: "habit", topic: "", text: "老师习惯晚上写代码" }],
        expectWrites: [{ type: "insert", topic: "schedule", kind: "habit" }],
        live: { kind: "must_hit", keywords: ["晚上"] }
    },
    {
        id: "x-retract-tea",
        bucket: "write_retract",
        user: "别忘了不要再记我爱喝红茶",
        assistant: "好。",
        existing: [TEA],
        expectGate: true,
        ops: [{ action: "retract", kind: "preference", topic: "drink", text: "老师平时喜欢喝红茶" }],
        expectWrites: [{ type: "supersede", id: "tea" }],
        live: { kind: "skip" }
    },
    {
        id: "s-address",
        bucket: "reject_secret",
        user: "请记住我住址在浦东新区",
        assistant: "不记这个。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "other", topic: "", text: "老师的住址在浦东新区" }],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "s-apikey",
        bucket: "reject_secret",
        user: "请记住我的 api key 是 sk-demo",
        assistant: "不记密钥。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "other", topic: "", text: "老师的 api key 是 sk-demo12" }],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "s-temp",
        bucket: "reject_secret",
        user: "请记住今天晴气温二十度",
        assistant: "不记这个。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "other", topic: "", text: "老师记下今天晴气温二十度" }],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "s-home",
        bucket: "reject_secret",
        user: "请记住我家在浦东新区某某路",
        assistant: "不记这个。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "other", topic: "", text: "老师家在浦东新区某某路" }],
        expectWrites: [],
        live: { kind: "abstain" }
    },
    {
        id: "w-news-major",
        bucket: "write_insert",
        user: "我是新闻系研究生",
        assistant: "明白。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "identity", topic: "job", text: "老师是新闻系研究生" }],
        expectWrites: [{ type: "insert", topic: "job", kind: "identity" }],
        live: { kind: "must_hit", keywords: ["新闻系"] }
    },
    {
        id: "w-hate-weather",
        bucket: "write_insert",
        user: "请记住老师讨厌每天聊天气",
        assistant: "记下了。",
        expectGate: true,
        ops: [{ action: "upsert", kind: "preference", topic: "", text: "老师讨厌每天聊天气" }],
        expectWrites: [{ type: "insert", kind: "preference" }],
        live: { kind: "must_hit", keywords: ["讨厌"] }
    },
    {
        id: "j-hello-id",
        bucket: "inject_core",
        user: "你好",
        assistant: "老师好。",
        existing: [
            {
                id: "habit",
                kind: "habit",
                text: "老师周末经常加班写代码",
                updatedAt: "2026-06-01T00:00:00.000Z"
            },
            {
                id: "id",
                kind: "identity",
                text: "老师希望被叫做小韩",
                updatedAt: "2026-01-01T00:00:00.000Z"
            },
            { id: "drink", kind: "preference", text: "老师平时喜欢喝绿茶" }
        ],
        expectGate: false,
        injectQuery: "你好",
        expectInjectIds: ["id"],
        expectInjectExcludeIds: ["habit", "drink"],
        live: { kind: "skip" }
    },
    {
        id: "j-tea-overlap",
        bucket: "inject_core",
        user: "喝茶",
        assistant: "请。",
        existing: [{ id: "drink", kind: "preference", text: "老师平时喜欢喝绿茶" }],
        expectGate: false,
        injectQuery: "喝茶",
        expectInjectIds: ["drink"],
        live: { kind: "skip" }
    },
    {
        id: "j-hello-agree",
        bucket: "inject_core",
        user: "你好",
        assistant: "老师好。",
        existing: [
            { id: "id", kind: "identity", text: "老师希望被叫做小韩" },
            { id: "agree", kind: "agreement", text: "老师约定回复尽量简短" },
            { id: "habit", kind: "habit", text: "老师周末经常加班写代码" }
        ],
        expectGate: false,
        injectQuery: "你好",
        expectInjectIds: ["id", "agree"],
        expectInjectExcludeIds: ["habit"],
        live: { kind: "skip" }
    },
    {
        id: "o-tea",
        bucket: "inject_overlap",
        user: "茶",
        assistant: "请。",
        existing: [
            { id: "drink", kind: "preference", text: "老师平时喜欢喝绿茶" },
            { id: "habit", kind: "habit", text: "老师周末经常加班写代码" }
        ],
        expectGate: false,
        injectQuery: "茶",
        expectInjectIds: ["drink"],
        expectInjectExcludeIds: ["habit"],
        live: { kind: "skip" }
    },
    {
        id: "o-overtime",
        bucket: "inject_overlap",
        user: "加班",
        assistant: "辛苦。",
        existing: [
            { id: "drink", kind: "preference", text: "老师平时喜欢喝绿茶" },
            { id: "habit", kind: "habit", text: "老师周末经常加班写代码" }
        ],
        expectGate: false,
        injectQuery: "加班",
        expectInjectIds: ["habit"],
        expectInjectExcludeIds: ["drink"],
        live: { kind: "skip" }
    },
    {
        id: "o-coffee",
        bucket: "inject_overlap",
        user: "咖啡",
        assistant: "好。",
        existing: [
            { id: "coffee", kind: "preference", text: "老师平时不喝咖啡" },
            { id: "habit", kind: "habit", text: "老师周末经常加班写代码" }
        ],
        expectGate: false,
        injectQuery: "咖啡",
        expectInjectIds: ["coffee"],
        live: { kind: "skip" }
    },
    {
        id: "a-off",
        bucket: "auto_off",
        user: "请记住我喜欢喝红茶",
        assistant: "好的老师。",
        autoWrite: false,
        expectGate: true,
        ops: [{ action: "upsert", kind: "preference", topic: "drink", text: "老师平时喜欢喝红茶" }],
        expectWrites: [],
        live: { kind: "skip" }
    }
];
