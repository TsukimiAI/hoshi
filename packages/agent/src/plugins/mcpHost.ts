import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { PluginHost } from "../runtime";
import type { LlmTool } from "./types";

const INIT_TIMEOUT_MS = 20_000;
const CALL_TIMEOUT_MS = 30_000;
const STDERR_MAX = 4_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}

export type McpServerStatus = {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  connected: boolean;
  toolNames: string[];
  lastError: string;
};

export type McpProbeResult = {
  ok: boolean;
  toolNames: string[];
  error: string;
};

export function parseMcpServer(raw: unknown): McpServerConfig | null {
  if (!isRecord(raw) || typeof raw.name !== "string" || typeof raw.command !== "string") {
    return null;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(raw.name) || !raw.command.trim()) {
    return null;
  }
  const args = Array.isArray(raw.args) ? raw.args.filter((v): v is string => typeof v === "string") : [];
  const env: Record<string, string> = {};
  if (isRecord(raw.env)) {
    for (const [key, value] of Object.entries(raw.env)) {
      if (typeof value === "string") {
        env[key] = value;
      }
    }
  }
  return {
    name: raw.name,
    command: raw.command.trim(),
    args,
    env,
    enabled: raw.enabled !== false
  };
}

export function readMcpServers(configPath: string): McpServerConfig[] {
  if (!existsSync(configPath)) {
    return [];
  }
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  if (!isRecord(raw) || !Array.isArray(raw.servers)) {
    return [];
  }
  const out: McpServerConfig[] = [];
  for (const item of raw.servers) {
    const parsed = parseMcpServer(item);
    if (parsed) {
      out.push(parsed);
    }
  }
  return out;
}

export function writeMcpServers(configPath: string, servers: McpServerConfig[]): void {
  const payload = {
    servers: servers.map((server) => ({
      name: server.name,
      command: server.command,
      args: server.args ?? [],
      env: server.env ?? {},
      enabled: server.enabled !== false
    }))
  };
  writeFileSync(configPath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function upsertMcpServer(configPath: string, server: McpServerConfig): McpServerConfig {
  const parsed = parseMcpServer({ ...server, enabled: server.enabled !== false });
  if (!parsed) {
    throw new Error("连接器无效");
  }
  const servers = readMcpServers(configPath).filter((item) => item.name !== parsed.name);
  servers.push(parsed);
  writeMcpServers(configPath, servers);
  return parsed;
}

export function setMcpServerEnabled(configPath: string, name: string, enabled: boolean): void {
  const servers = readMcpServers(configPath);
  const found = servers.find((item) => item.name === name);
  if (!found) {
    throw new Error("连接器不存在");
  }
  found.enabled = enabled;
  writeMcpServers(configPath, servers);
}

export function removeMcpServer(configPath: string, name: string): void {
  writeMcpServers(
    configPath,
    readMcpServers(configPath).filter((item) => item.name !== name)
  );
}

function sanitizeToolName(server: string, raw: string): string {
  const rest = raw.replace(/[^A-Za-z0-9_-]/g, "_");
  let name = `mcp_${server}_${rest}`;
  if (name.length > 64) {
    name = name.slice(0, 64);
  }
  return name;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class McpSession {
  readonly tools: LlmTool[] = [];
  readonly llmToMcp = new Map<string, string>();
  stderr = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buf = "";
  private child: ChildProcess;

  constructor(
    readonly name: string,
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv
  ) {
    this.child = spawn(command, args, {
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child.on("error", (error) => {
      this.stderr = `${this.stderr}${error.message}\n`.slice(-STDERR_MAX);
      for (const item of this.pending.values()) {
        clearTimeout(item.timer);
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }
      this.pending.clear();
    });
    this.child.stderr?.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString("utf8")}`.slice(-STDERR_MAX);
    });
    this.child.stdout?.on("data", (chunk: Buffer) => {
      this.buf += chunk.toString("utf8");
      const lines = this.buf.split("\n");
      this.buf = lines.pop() ?? "";
      for (const line of lines) {
        this.onLine(line);
      }
    });
    this.child.once("exit", () => {
      for (const item of this.pending.values()) {
        clearTimeout(item.timer);
        item.reject(new Error(`mcp ${this.name} 已退出`));
      }
      this.pending.clear();
    });
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    let msg: unknown;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (!isRecord(msg) || typeof msg.id !== "number") {
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending) {
      return;
    }
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(new Error(typeof msg.error === "object" ? JSON.stringify(msg.error) : String(msg.error)));
      return;
    }
    pending.resolve(msg.result);
  }

  request(method: string, params: Record<string, unknown> | undefined, timeoutMs: number): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`mcp ${method} 超时`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const payload = params === undefined ? { jsonrpc: "2.0", id, method } : { jsonrpc: "2.0", id, method, params };
      this.child.stdin?.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  failDetail(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error);
    const err = this.stderr.trim();
    return err ? `${msg}\n${err}` : msg;
  }

  kill(): void {
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(`mcp ${this.name} 已关闭`));
    }
    this.pending.clear();
    this.child.kill("SIGTERM");
  }
}

function sessionEnv(server: McpServerConfig, pathEnv: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: pathEnv,
    ...server.env
  };
}

async function startSession(server: McpServerConfig, pathEnv: string): Promise<McpSession> {
  const session = new McpSession(server.name, server.command, server.args ?? [], sessionEnv(server, pathEnv));
  try {
    await session.request(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "hoshi", version: "0.0.0" }
      },
      INIT_TIMEOUT_MS
    );
    session.notify("notifications/initialized", {});
    const listed = await session.request("tools/list", {}, INIT_TIMEOUT_MS);
    const tools = isRecord(listed) && Array.isArray(listed.tools) ? listed.tools : [];
    for (const tool of tools) {
      if (!isRecord(tool) || typeof tool.name !== "string") {
        continue;
      }
      const llmName = sanitizeToolName(server.name, tool.name);
      session.llmToMcp.set(llmName, tool.name);
      const description = typeof tool.description === "string" ? tool.description : tool.name;
      const parameters = isRecord(tool.inputSchema) ? tool.inputSchema : { type: "object", properties: {} };
      session.tools.push({
        type: "function",
        function: {
          name: llmName,
          description,
          parameters
        }
      });
    }
    return session;
  } catch (error) {
    const detail = session.failDetail(error);
    session.kill();
    throw new Error(detail);
  }
}

export async function probeMcpServer(server: McpServerConfig, pathEnv: string): Promise<McpProbeResult> {
  const parsed = parseMcpServer(server);
  if (!parsed) {
    return { ok: false, toolNames: [], error: "连接器无效" };
  }
  try {
    const session = await startSession(parsed, pathEnv);
    const toolNames = [...session.llmToMcp.values()];
    session.kill();
    return { ok: true, toolNames, error: "" };
  } catch (error) {
    return { ok: false, toolNames: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export class McpPluginHost implements PluginHost {
  private sessions: McpSession[] = [];
  private failures: { name: string; error: string }[] = [];

  constructor(
    private readonly configPath: string,
    private readonly pathEnv: string
  ) {}

  tools(): LlmTool[] {
    return this.sessions.flatMap((session) => session.tools);
  }

  snapshot(): McpServerStatus[] {
    return readMcpServers(this.configPath).map((server) => {
      const session = this.sessions.find((item) => item.name === server.name);
      const fail = this.failures.find((item) => item.name === server.name);
      return {
        name: server.name,
        command: server.command,
        args: server.args ?? [],
        env: server.env ?? {},
        enabled: server.enabled !== false,
        connected: Boolean(session),
        toolNames: session ? [...session.llmToMcp.values()] : [],
        lastError: session ? "" : (fail?.error ?? "")
      };
    });
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    for (const session of this.sessions) {
      const mcpName = session.llmToMcp.get(name);
      if (!mcpName) {
        continue;
      }
      const result = await session.request("tools/call", { name: mcpName, arguments: args }, CALL_TIMEOUT_MS);
      if (!isRecord(result)) {
        return "";
      }
      if (!Array.isArray(result.content)) {
        return result.isError ? "mcp 调用失败" : "";
      }
      const text = result.content
        .filter((part): part is Record<string, unknown> => isRecord(part))
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("");
      return text || (result.isError ? "mcp 调用失败" : "");
    }
    return `工具不可用：${name}`;
  }

  async reload(): Promise<void> {
    const prev = this.sessions;
    this.sessions = [];
    this.failures = [];
    for (const session of prev) {
      session.kill();
    }
    for (const server of readMcpServers(this.configPath)) {
      if (server.enabled === false) {
        continue;
      }
      try {
        this.sessions.push(await startSession(server, this.pathEnv));
      } catch (error) {
        this.failures.push({
          name: server.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  stop(): void {
    for (const session of this.sessions) {
      session.kill();
    }
    this.sessions = [];
    this.failures = [];
  }
}
