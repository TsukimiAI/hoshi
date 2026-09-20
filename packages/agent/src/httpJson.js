"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BodyTooLargeError = exports.JSON_BODY_LIMIT = void 0;
exports.readJson = readJson;
exports.JSON_BODY_LIMIT = 1024 * 1024;
class BodyTooLargeError extends Error {
    constructor() {
        super("payload too large");
        this.name = "BodyTooLargeError";
    }
}
exports.BodyTooLargeError = BodyTooLargeError;
async function readJson(req, maxBytes = exports.JSON_BODY_LIMIT) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buf = Buffer.from(chunk);
        size += buf.length;
        if (size > maxBytes) {
            throw new BodyTooLargeError();
        }
        chunks.push(buf);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw.trim()) {
        return {};
    }
    return JSON.parse(raw);
}
