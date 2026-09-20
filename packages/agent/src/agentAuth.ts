import type { IncomingMessage } from "node:http";

export function httpAuthorized(req: IncomingMessage, token: string): boolean {
  return (req.headers.authorization ?? "") === `Bearer ${token}`;
}

export function wsAuthorized(url: URL, token: string): boolean {
  return url.searchParams.get("token") === token;
}
