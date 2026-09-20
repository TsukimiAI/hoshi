import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HoshiSettings, PluginMarketItem, PluginSettings } from "@hoshi/shared";
import type { LlmTool, LoadedPlugin, PluginExecute, PluginManifest } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readManifest(raw: unknown): PluginManifest | null {
  if (!isRecord(raw)) {
    return null;
  }
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";
  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  if (!id || !name || !version || !isRecord(raw.tool)) {
    return null;
  }
  const toolName = typeof raw.tool.name === "string" ? raw.tool.name.trim() : "";
  const toolDescription = typeof raw.tool.description === "string" ? raw.tool.description.trim() : "";
  if (!toolName || !isRecord(raw.tool.parameters)) {
    return null;
  }
  const settingsFields = Array.isArray(raw.settingsFields)
    ? raw.settingsFields.flatMap((field) => {
        if (!isRecord(field) || typeof field.key !== "string" || typeof field.label !== "string") {
          return [];
        }
        const type: "text" | "password" | "textarea" =
          field.type === "password" || field.type === "textarea" || field.type === "text"
            ? field.type
            : "text";
        return [
          {
            key: field.key,
            label: field.label,
            type,
            placeholder: typeof field.placeholder === "string" ? field.placeholder : undefined
          }
        ];
      })
    : [];
  return {
    id,
    name,
    description,
    version,
    tool: {
      name: toolName,
      description: toolDescription,
      parameters: raw.tool.parameters
    },
    settingsFields
  };
}

function loadExternalExecute(mainPath: string): PluginExecute | string {
  try {
    const resolved = require.resolve(mainPath);
    delete require.cache[resolved];
    const mod = require(mainPath) as { execute?: PluginExecute };
    if (typeof mod.execute !== "function") {
      return "缺少 execute";
    }
    return mod.execute.bind(mod);
  } catch (error) {
    return error instanceof Error ? error.message : "加载失败";
  }
}

function scanLocal(pluginsDir: string): LoadedPlugin[] {
  if (!existsSync(pluginsDir)) {
    return [];
  }
  let entries: string[] = [];
  try {
    entries = readdirSync(pluginsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const loaded: LoadedPlugin[] = [];
  for (const dirName of entries) {
    const dir = join(pluginsDir, dirName);
    const manifestPath = join(dir, "plugin.json");
    try {
      if (!existsSync(manifestPath)) {
        loaded.push({
          manifest: {
            id: dirName,
            name: dirName,
            description: "",
            version: "0",
            tool: { name: dirName, description: "", parameters: { type: "object", properties: {} } }
          },
          source: "local",
          dirName,
          error: "缺少 plugin.json"
        });
        continue;
      }
      const manifest = readManifest(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
      if (!manifest) {
        loaded.push({
          manifest: {
            id: dirName,
            name: dirName,
            description: "",
            version: "0",
            tool: { name: dirName, description: "", parameters: { type: "object", properties: {} } }
          },
          source: "local",
          dirName,
          error: "plugin.json 无效"
        });
        continue;
      }
      const mainName = "index.js";
      const mainPath = join(dir, mainName);
      if (!existsSync(mainPath)) {
        loaded.push({ manifest, source: "local", dirName, error: "缺少 index.js" });
        continue;
      }
      const execute = loadExternalExecute(mainPath);
      if (typeof execute === "string") {
        loaded.push({ manifest, source: "local", dirName, error: execute });
        continue;
      }
      loaded.push({ manifest, source: "local", dirName, execute });
    } catch (error) {
      loaded.push({
        manifest: {
          id: dirName,
          name: dirName,
          description: "",
          version: "0",
          tool: { name: dirName, description: "", parameters: { type: "object", properties: {} } }
        },
          source: "local",
          dirName,
          error: error instanceof Error ? error.message : "加载失败"
      });
    }
  }
  return loaded;
}

export function enabledPluginIds(settings: PluginSettings): Set<string> {
  return new Set(settings.enabled);
}

export class PluginRegistry {
  private plugins: LoadedPlugin[] = [];
  private settings: PluginSettings = { enabled: [], configs: {} };

  constructor(private readonly pluginsDir: string) {}

  reload(settings: HoshiSettings): void {
    this.settings = settings.plugins;
    const seen = new Set<string>();
    const extra: LoadedPlugin[] = [];
    for (const item of scanLocal(this.pluginsDir)) {
      if (seen.has(item.manifest.id)) {
        extra.push({ ...item, error: item.error ?? "插件 id 冲突" });
        continue;
      }
      seen.add(item.manifest.id);
      extra.push(item);
    }
    this.plugins = extra;
  }

  list(): PluginMarketItem[] {
    const enabled = enabledPluginIds(this.settings);
    const usedKeys = new Set<string>();
    return this.plugins.map((plugin, index) => {
      let key = plugin.manifest.id;
      if (usedKeys.has(key) || plugin.error) {
        key = `${plugin.manifest.id}::${plugin.dirName ?? String(index)}`;
      }
      while (usedKeys.has(key)) {
        key = `${key}-${index}`;
      }
      usedKeys.add(key);
      const canEnable = !plugin.error && Boolean(plugin.execute);
      return {
        key,
        id: plugin.manifest.id,
        name: plugin.manifest.name,
        description: plugin.manifest.description,
        version: plugin.manifest.version,
        source: plugin.source,
        enabled: canEnable && enabled.has(plugin.manifest.id),
        error: plugin.error,
        settingsFields: plugin.manifest.settingsFields ?? [],
        config: this.settings.configs[plugin.manifest.id] ?? {}
      };
    });
  }

  tools(): LlmTool[] {
    const enabled = enabledPluginIds(this.settings);
    return this.plugins
      .filter((plugin) => !plugin.error && plugin.execute && enabled.has(plugin.manifest.id))
      .map((plugin) => ({
        type: "function" as const,
        function: {
          name: plugin.manifest.tool.name,
          description: plugin.manifest.description || plugin.manifest.tool.description,
          parameters: plugin.manifest.tool.parameters
        }
      }));
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    const enabled = enabledPluginIds(this.settings);
    const plugin = this.plugins.find(
      (item) =>
        !item.error &&
        item.execute &&
        enabled.has(item.manifest.id) &&
        item.manifest.tool.name === name
    );
    if (!plugin?.execute) {
      return `工具不可用：${name}`;
    }
    return plugin.execute(args, {
      config: this.settings.configs[plugin.manifest.id] ?? {}
    });
  }
}
