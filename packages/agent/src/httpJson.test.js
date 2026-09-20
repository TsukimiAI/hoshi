"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_stream_1 = require("node:stream");
const vitest_1 = require("vitest");
const httpJson_1 = require("./httpJson");
function fakeReq(chunks) {
    return node_stream_1.Readable.from(chunks);
}
(0, vitest_1.describe)("readJson", () => {
    (0, vitest_1.it)("解析对象", async () => {
        const req = fakeReq([Buffer.from('{"a":1}')]);
        await (0, vitest_1.expect)((0, httpJson_1.readJson)(req)).resolves.toEqual({ a: 1 });
    });
    (0, vitest_1.it)("超限抛 BodyTooLargeError", async () => {
        const req = fakeReq([Buffer.alloc(httpJson_1.JSON_BODY_LIMIT + 1)]);
        await (0, vitest_1.expect)((0, httpJson_1.readJson)(req)).rejects.toBeInstanceOf(httpJson_1.BodyTooLargeError);
    });
    (0, vitest_1.it)("自定义上限", async () => {
        const req = fakeReq([Buffer.alloc(8)]);
        await (0, vitest_1.expect)((0, httpJson_1.readJson)(req, 4)).rejects.toBeInstanceOf(httpJson_1.BodyTooLargeError);
    });
});
