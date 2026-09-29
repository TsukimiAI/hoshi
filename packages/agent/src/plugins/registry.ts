import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HoshiSettings, PluginMarketItem, PluginSettings } from "@hoshi/shared";
import { parsePluginContributes, parsePluginUi } from "@hoshi/shared";
import { pluginKvGet, pluginKvSet, kvEncode } from "./kvStore";
import type { HostAppInfo, LlmTool, LoadedPlugin, PluginExecute, PluginManifest, PluginPickOpts } from "./types";

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
  const contributes = parsePluginContributes(raw.contributes);
  const ui = parsePluginUi(raw.ui);
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
    settingsFields,
    ...(contributes ? { contributes } : {}),
    ...(ui ? { ui } : {})
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

function scanLocal(pluginsDir: string, skipLoadExecute: boolean): LoadedPlugin[] {
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
      const mainPath = join(dir, "index.js");
      if (!existsSync(mainPath)) {
        loaded.push({ manifest, source: "local", dirName });
        continue;
      }
      if (skipLoadExecute) {
        loaded.push({ manifest, source: "local", dirName, mainPath });
        continue;
      }
      const execute = loadExternalExecute(mainPath);
      if (typeof execute === "string") {
        loaded.push({ manifest, source: "local", dirName, error: execute });
        continue;
      }
      loaded.push({ manifest, source: "local", dirName, execute, mainPath });
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

export type OpenExternalFn = (target: string) => Promise<string>;
export type ListAppsFn = () => Promise<HostAppInfo[]>;
export type PickFilesFn = (opts?: PluginPickOpts) => Promise<string[]>;

export type IsolatedRunFn = (
  pluginId: string,
  mainPath: string,
  args: Record<string, unknown>,
  config: Record<string, string>
) => Promise<string>;

export type PluginRuntimeCaps = {
  notify: (title: string, body?: string) => void;
};

export function sanitizeOpenTarget(raw: unknown): string {
  const target = typeof raw === "string" ? raw.trim() : "";
  if (!target || target.length > 4096 || /[\0\n\r]/.test(target)) {
    throw new Error("打开目标无效");
  }
  return target;
}

export function enabledPluginIds(settings: PluginSettings): Set<string> {
  return new Set(settings.enabled);
}

export class PluginRegistry {
  private plugins: LoadedPlugin[] = [];
  private settings: PluginSettings = { enabled: [], configs: {} };

  constructor(
    private readonly pluginsDir: string,
    private readonly storageDir?: string,
    private readonly onKvSet?: (pluginId: string, key: string, value: string) => void,
    private readonly openExternal?: OpenExternalFn,
    private readonly listApps?: ListAppsFn,
    private readonly pickFiles?: PickFilesFn,
    private readonly runtimeCaps?: PluginRuntimeCaps,
    private readonly isolatedRun?: IsolatedRunFn
  ) {}

  reload(settings: HoshiSettings): void {
    this.settings = settings.plugins;
    const seen = new Set<string>();
    const extra: LoadedPlugin[] = [];
    for (const item of scanLocal(this.pluginsDir, Boolean(this.isolatedRun))) {
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
      const canEnable = !plugin.error;
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
    return [];
  }

  async execute(name: string, _args: Record<string, unknown>): Promise<string> {
    return `工具不可用：${name}`;
  }

  async executeByPluginId(pluginId: string, args: Record<string, unknown>): Promise<string> {
    const enabled = enabledPluginIds(this.settings);
    const plugin = this.plugins.find(
      (item) =>
        !item.error &&
        (item.execute || item.mainPath) &&
        enabled.has(item.manifest.id) &&
        item.manifest.id === pluginId
    );
    if (!plugin?.execute && !plugin?.mainPath) {
      return `工具不可用：${pluginId}`;
    }
    if (this.isolatedRun && plugin.mainPath) {
      return this.isolatedRun(pluginId, plugin.mainPath, args, this.settings.configs[pluginId] ?? {});
    }
    if (!plugin.execute) {
      return `工具不可用：${pluginId}`;
    }
    const storageDir = this.storageDir;
    const onKvSet = this.onKvSet;
    return plugin.execute(args, {
      config: this.settings.configs[pluginId] ?? {},
      storage: {
        get: (key: string) => (storageDir ? pluginKvGet(storageDir, pluginId, key) : null),
        set: (key: string, value: unknown) => {
          if (!storageDir) {
            return;
          }
          pluginKvSet(storageDir, pluginId, key, value);
          onKvSet?.(pluginId, key, kvEncode(value));
        }
      },
      notify: (title, body) => {
        if (!this.runtimeCaps) throw new Error("宿主未提供 notify");
        this.runtimeCaps.notify(title, body);
      },
      openExternal: async () => {
        throw new Error("ctx 禁止 openExternal");
      },
      listApps: async () => {
        throw new Error("ctx 禁止 listApps");
      },
      pick: async () => {
        throw new Error("ctx 禁止 pick");
      }
    });
  }
}
