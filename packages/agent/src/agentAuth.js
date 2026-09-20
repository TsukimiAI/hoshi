"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpAuthorized = httpAuthorized;
exports.wsAuthorized = wsAuthorized;
function httpAuthorized(req, token) {
    return (req.headers.authorization ?? "") === `Bearer ${token}`;
}
function wsAuthorized(url, token) {
    return url.searchParams.get("token") === token;
}
