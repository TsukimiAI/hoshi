import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  McpPluginHost,
  parseMcpServer,
  probeMcpServer,
  readMcpServers,
  setMcpServerEnabled,
  upsertMcpServer
} from "./mcpHost";

function tmpConfig(): string {
  return join(mkdtempSync(join(tmpdir(), "hoshi-mcp-")), "mcp.json");
}

describe("mcpHost config", () => {
  it("解析 enabled，缺省为开", () => {
    expect(parseMcpServer({ name: "a", command: "npx", enabled: false })?.enabled).toBe(false);
    expect(parseMcpServer({ name: "a", command: "npx" })?.enabled).toBe(true);
    expect(parseMcpServer({ name: "bad name", command: "npx" })).toBeNull();
  });

  it("upsert 与 setMcpServerEnabled 写回 mcp.json", () => {
    const path = tmpConfig();
    try {
      upsertMcpServer(path, { name: "fs", command: "npx", args: ["-y", "x"], env: {} });
      expect(readMcpServers(path)).toEqual([
        expect.objectContaining({ name: "fs", command: "npx", enabled: true })
      ]);
      setMcpServerEnabled(path, "fs", false);
      expect(readMcpServers(path)[0]?.enabled).toBe(false);
    } finally {
      rmSync(join(path, ".."), { recursive: true, force: true });
    }
  });

  it("reload 跳过停用，失败写入 lastError", async () => {
    const path = tmpConfig();
    try {
      writeFileSync(
        path,
        `${JSON.stringify({
          servers: [
            { name: "off", command: "npx", args: ["-y", "x"], env: {}, enabled: false },
            { name: "bad", command: "hoshi-mcp-missing-bin", args: [], env: {}, enabled: true }
          ]
        })}\n`
      );
      const host = new McpPluginHost(path, process.env.PATH ?? "");
      await host.reload();
      const snap = host.snapshot();
      expect(snap.find((s) => s.name === "off")).toEqual(
        expect.objectContaining({ enabled: false, connected: false, lastError: "" })
      );
      const bad = snap.find((s) => s.name === "bad");
      expect(bad?.connected).toBe(false);
      expect(bad?.lastError).toBeTruthy();
      host.stop();
    } finally {
      rmSync(join(path, ".."), { recursive: true, force: true });
    }
  });

  it("probe 失败返回错误字符串", async () => {
    const result = await probeMcpServer(
      { name: "bad", command: "hoshi-mcp-missing-bin", args: [], env: {} },
      process.env.PATH ?? ""
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
