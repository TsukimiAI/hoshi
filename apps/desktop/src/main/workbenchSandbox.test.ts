import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_HOSHI_SETTINGS } from "@hoshi/shared";
import {
  createSandboxPlugin,
  freezePluginTemplate,
  migrateSandboxMcp,
  publishSandboxPlugin,
  setTemplateMetaRoot,
  themeSoundDataUrl,
  parseThemeTokens,
  exclusiveThemeEnabled,
  readThemePack,
  writeThemePack
} from "./workbenchSandbox";

const resources = join(dirname(fileURLToPath(import.meta.url)), "../../resources/workbench/plugins");

function makeSandbox(): string {
  const sandbox = mkdtempSync(join(tmpdir(), "hoshi-wb-"));
  mkdirSync(join(sandbox, "plugins"), { recursive: true });
  setTemplateMetaRoot(join(sandbox, "meta"));
  for (const name of ["_template_theme", "_template_panel", "_template_launcher"]) {
    cpSync(join(resources, name), join(sandbox, "plugins", name), { recursive: true });
  }
  return sandbox;
}

describe("createSandboxPlugin", () => {
  it("只允许皮肤模板，拒绝 tool 与 mcp", async () => {
    const sandbox = makeSandbox();
    const mcpPath = join(sandbox, "mcp.json");
    try {
      createSandboxPlugin(sandbox, "skin_a", "theme");
      expect(existsSync(join(sandbox, "plugins", "skin_a", "theme.json"))).toBe(true);
      const native = JSON.parse(readFileSync(join(sandbox, "plugins", "skin_a", "plugin.json"), "utf8")) as {
        kind?: string;
        template?: string;
      };
      expect(native.kind).toBe("native");
      expect(native.template).toBe("theme");

      expect(() => createSandboxPlugin(sandbox, "skin_a", "theme")).toThrow("目录已存在");
      expect(() => createSandboxPlugin(sandbox, "mcp_a", "mcp")).toThrow("请到连接页添加连接器");

      mkdirSync(join(sandbox, "plugins", "old_mcp"));
      writeFileSync(
        join(sandbox, "plugins", "old_mcp", "plugin.json"),
        `${JSON.stringify({
          id: "old_mcp",
          name: "旧连接",
          description: "x",
          version: "0.1.0",
          kind: "mcp",
          template: "mcp",
          tool: { name: "old_mcp", parameters: { type: "object", properties: {} } }
        })}\n`
      );
      writeFileSync(
        join(sandbox, "plugins", "old_mcp", "connector.json"),
        `${JSON.stringify({ command: "npx", args: ["-y", "x"], env: {} })}\n`
      );
      setTemplateMetaRoot(join(sandbox, "meta"));
      writeFileSync(join(sandbox, "meta", "old_mcp"), "mcp\n");

      const moved = migrateSandboxMcp(sandbox, mcpPath);
      expect(moved).toEqual(["old_mcp"]);
      expect(existsSync(join(sandbox, "plugins", "old_mcp"))).toBe(false);
      const mcp = JSON.parse(readFileSync(mcpPath, "utf8")) as {
        servers: { name: string; command: string }[];
      };
      expect(mcp.servers).toEqual([expect.objectContaining({ name: "old_mcp", command: "npx" })]);

      createSandboxPlugin(sandbox, "stuck_mcp", "theme");
      freezePluginTemplate(sandbox, "stuck_mcp", "mcp");
      await expect(
        publishSandboxPlugin({
          sandboxDir: sandbox,
          pluginsDir: join(sandbox, "plugins-out"),
          mcpPath,
          dirName: "stuck_mcp",
          settings: structuredClone(DEFAULT_HOSHI_SETTINGS)
        })
      ).rejects.toThrow("请到连接页添加连接器");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("主题可以上线", async () => {
    const sandbox = makeSandbox();
    const mcpPath = join(sandbox, "mcp.json");
    try {
      createSandboxPlugin(sandbox, "ready_theme", "theme");
      const result = await publishSandboxPlugin({
        sandboxDir: sandbox,
        pluginsDir: join(sandbox, "plugins-out"),
        mcpPath,
        dirName: "ready_theme",
        settings: structuredClone(DEFAULT_HOSHI_SETTINGS)
      });
      expect(result.id).toBe("ready_theme");
      expect(existsSync(join(sandbox, "plugins-out", "ready_theme", "theme.json"))).toBe(true);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

describe("themeSoundDataUrl", () => {
  it("返回可播放音效 data URL，拒绝越界与空主题", () => {
    const root = mkdtempSync(join(tmpdir(), "hoshi-snd-"));
    const pluginsDir = join(root, "plugins");
    const metaDir = join(root, "meta");
    try {
      mkdirSync(join(pluginsDir, "mytheme", "sound"), { recursive: true });
      writeFileSync(
        join(pluginsDir, "mytheme", "theme.json"),
        `${JSON.stringify({ tokens: { sound: "sound/hello.mp3" }, sprites: {} })}\n`
      );
      writeFileSync(join(pluginsDir, "mytheme", "sound", "hello.mp3"), Buffer.from("ID3fake"));
      setTemplateMetaRoot(metaDir);
      writeFileSync(join(metaDir, "mytheme"), "theme\n");

      const url = themeSoundDataUrl(pluginsDir, ["mytheme"]);
      expect(url.startsWith("data:audio/mpeg;base64,")).toBe(true);

      writeFileSync(
        join(pluginsDir, "mytheme", "theme.json"),
        `${JSON.stringify({ tokens: { sound: "../secret.mp3" }, sprites: {} })}\n`
      );
      expect(themeSoundDataUrl(pluginsDir, ["mytheme"])).toBe("");

      expect(themeSoundDataUrl(pluginsDir, [])).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("parseThemeTokens", () => {
  it("音效走文件路径，颜色缺字段回默认", () => {
    const tokens = parseThemeTokens({ tokens: { bg: "#111111", sound: "sound/a.mp3" } });
    expect(tokens.bg).toBe("#111111");
    expect(tokens.sound).toBe("sound/a.mp3");
    expect(tokens.dialog).toBe("#ffffff");
    expect(tokens.menu).toBe("#ffffff");
  });
});

describe("exclusiveThemeEnabled", () => {
  it("多主题只留最后一个", () => {
    const root = mkdtempSync(join(tmpdir(), "hoshi-excl-"));
    try {
      setTemplateMetaRoot(join(root, "meta"));
      writeFileSync(join(root, "meta", "t_a"), "theme\n");
      writeFileSync(join(root, "meta", "t_b"), "theme\n");
      writeFileSync(join(root, "meta", "player_c"), "panel\n");
      expect(exclusiveThemeEnabled(join(root, "plugins"), ["t_a", "t_b", "player_c"])).toEqual([
        "player_c",
        "t_b"
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("themePack 往返", () => {
  it("name/description 写入 manifest 并可读回", () => {
    const sandbox = makeSandbox();
    try {
      const dir = join(sandbox, "plugins", "mytheme");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "plugin.json"), `${JSON.stringify({ id: "mytheme" })}\n`);

      const written = writeThemePack(sandbox, "mytheme", {
        name: "我的主题",
        description: "一句话说明",
        tokens: { bg: "#101010", font: "", dialog: "#222222", menu: "", sound: "sound/a.mp3" },
        sprites: { normal: "sprites/normal.png" }
      });
      expect(written.name).toBe("我的主题");
      expect(written.description).toBe("一句话说明");

      const read = readThemePack(sandbox, "mytheme");
      expect(read.name).toBe("我的主题");
      expect(read.description).toBe("一句话说明");
      expect(read.tokens.bg).toBe("#101010");
      expect(read.tokens.sound).toBe("sound/a.mp3");
      expect(read.sprites.normal).toBe("sprites/normal.png");

      const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")) as {
        name?: string;
        description?: string;
      };
      expect(manifest.name).toBe("我的主题");
      expect(manifest.description).toBe("一句话说明");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
