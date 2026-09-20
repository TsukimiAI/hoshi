"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const agentAuth_1 = require("./agentAuth");
(0, vitest_1.describe)("agentAuth", () => {
    (0, vitest_1.it)("Bearer 匹配", () => {
        (0, vitest_1.expect)((0, agentAuth_1.httpAuthorized)({ headers: { authorization: "Bearer tok" } }, "tok")).toBe(true);
        (0, vitest_1.expect)((0, agentAuth_1.httpAuthorized)({ headers: { authorization: "Bearer other" } }, "tok")).toBe(false);
    });
    (0, vitest_1.it)("WS query token", () => {
        (0, vitest_1.expect)((0, agentAuth_1.wsAuthorized)(new URL("http://127.0.0.1/v1/voice?token=tok"), "tok")).toBe(true);
        (0, vitest_1.expect)((0, agentAuth_1.wsAuthorized)(new URL("http://127.0.0.1/v1/voice"), "tok")).toBe(false);
    });
});
