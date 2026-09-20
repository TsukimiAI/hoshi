import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_HOSHI_SETTINGS, type HoshiSettings } from "@hoshi/shared";
import { PluginRegistry } from "./registry";

function settingsWith(enabled: string[]): HoshiSettings {
  return {
    ...DEFAULT_HOSHI_SETTINGS,
    plugins: {
      enabled,
      configs: {}
    }
  };
}

describe("PluginRegistry", () => {
  it("空目录不列出内置搜索", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-plugins-"));
    try {
      const registry = new PluginRegistry(dir);
      registry.reload(settingsWith([]));
      expect(registry.list()).toEqual([]);
      expect(registry.tools()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("未启用时不向模型暴露 tool", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-plugins-"));
    try {
      const good = join(dir, "echo_tool");
      mkdirSync(good);
      writeFileSync(
        join(good, "plugin.json"),
        JSON.stringify({
          id: "echo_tool",
          name: "回声",
          description: "测试",
          version: "1.0.0",
          main: "index.js",
          tool: {
            name: "echo_tool",
            description: "echo",
            parameters: { type: "object", properties: { text: { type: "string" } } }
          }
        })
      );
      writeFileSync(
        join(good, "index.js"),
        "exports.execute = async (args) => String(args.text ?? '');"
      );
      const registry = new PluginRegistry(dir);
      registry.reload(settingsWith([]));
      expect(registry.tools()).toEqual([]);
      expect(registry.list().map((item) => item.id)).toEqual(["echo_tool"]);
      expect(registry.list()[0]?.enabled).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("本地合法包出现在列表，坏包带 error 且 key 不重复", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-plugins-"));
    try {
      const good = join(dir, "echo_tool");
      mkdirSync(good);
      writeFileSync(
        join(good, "plugin.json"),
        JSON.stringify({
          id: "echo_tool",
          name: "回声",
          description: "测试",
          version: "1.0.0",
          main: "index.js",
          tool: {
            name: "echo_tool",
            description: "echo",
            parameters: { type: "object", properties: { text: { type: "string" } } }
          }
        })
      );
      writeFileSync(
        join(good, "index.js"),
        "exports.execute = async (args) => String(args.text ?? '');"
      );
      mkdirSync(join(dir, "broken"));
      const registry = new PluginRegistry(dir);
      registry.reload(settingsWith(["echo_tool"]));
      const ids = registry.list().map((item) => item.id);
      expect(ids).not.toContain("web_search");
      expect(ids).toContain("echo_tool");
      expect(ids).toContain("broken");
      const keys = registry.list().map((item) => item.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(registry.list().find((item) => item.id === "broken")?.error).toBeTruthy();
      expect(registry.tools().map((tool) => tool.function.name)).toEqual(["echo_tool"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
