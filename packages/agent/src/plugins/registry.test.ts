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
      expect(registry.tools().map((tool) => tool.function.name)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("仅 contributes 无 index.js 可启用且不暴露 tool", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-plugins-"));
    try {
      const ui = join(dir, "player");
      mkdirSync(ui);
      writeFileSync(
        join(ui, "plugin.json"),
        JSON.stringify({
          id: "player",
          name: "播放器",
          description: "窗",
          version: "1.0.0",
          tool: {
            name: "player",
            description: "noop",
            parameters: { type: "object", properties: {} }
          },
          contributes: {
            windows: [{ id: "main", title: "音乐", entry: "ui/index.html" }],
            actions: [{ id: "open", label: "音乐", window: "main" }]
          }
        })
      );
      const registry = new PluginRegistry(dir);
      registry.reload(settingsWith(["player"]));
      expect(registry.list()[0]?.enabled).toBe(true);
      expect(registry.list()[0]?.error).toBeUndefined();
      expect(registry.tools()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("仅 ui 无 index.js 可启用", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-plugins-"));
    try {
      const ui = join(dir, "player");
      mkdirSync(ui);
      writeFileSync(
        join(ui, "plugin.json"),
        JSON.stringify({
          id: "player",
          name: "播放器",
          description: "窗",
          version: "1.0.0",
          tool: {
            name: "player",
            description: "noop",
            parameters: { type: "object", properties: {} }
          },
          ui: {
            menu: { label: "音乐" },
            panel: { file: "panel.html" }
          }
        })
      );
      const registry = new PluginRegistry(dir);
      registry.reload(settingsWith(["player"]));
      expect(registry.list()[0]?.enabled).toBe(true);
      expect(registry.list()[0]?.error).toBeUndefined();
      expect(registry.tools()).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("execute storage 读写 plugin-storage", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hoshi-plugins-"));
    const storageDir = mkdtempSync(join(tmpdir(), "hoshi-kv-"));
    try {
      const good = join(dir, "kv_tool");
      mkdirSync(good);
      writeFileSync(
        join(good, "plugin.json"),
        JSON.stringify({
          id: "kv_tool",
          name: "kv",
          description: "kv",
          version: "1.0.0",
          tool: {
            name: "kv_tool",
            parameters: { type: "object", properties: {} }
          }
        })
      );
      writeFileSync(
        join(good, "index.js"),
        "exports.execute = async (_args, ctx) => { ctx.storage.set('a', '1'); return ctx.storage.get('a'); };"
      );
      const registry = new PluginRegistry(dir, storageDir);
      registry.reload(settingsWith(["kv_tool"]));
      expect(await registry.execute("kv_tool", {})).toBe("工具不可用：kv_tool");
      expect(registry.tools()).toEqual([]);
      writeFileSync(
        join(good, "plugin.json"),
        JSON.stringify({
          id: "kv_tool",
          name: "kv",
          description: "kv",
          version: "1.0.0",
          template: "panel",
          tool: {
            name: "kv_tool",
            parameters: { type: "object", properties: {} }
          }
        })
      );
      registry.reload(settingsWith(["kv_tool"]));
      expect(await registry.executeByPluginId("kv_tool", {})).toBe("1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(storageDir, { recursive: true, force: true });
    }
  });
});
