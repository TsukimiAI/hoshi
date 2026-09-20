"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const dashscopeWs_1 = require("./dashscopeWs");
(0, vitest_1.describe)("inferenceWsUrl", () => {
    (0, vitest_1.it)("北京", () => {
        (0, vitest_1.expect)((0, dashscopeWs_1.inferenceWsUrl)("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe("wss://dashscope.aliyuncs.com/api-ws/v1/inference");
    });
    (0, vitest_1.it)("新加坡", () => {
        (0, vitest_1.expect)((0, dashscopeWs_1.inferenceWsUrl)("https://dashscope-intl.aliyuncs.com/compatible-mode/v1")).toBe("wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference");
    });
});
