import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  watch,
  writeFileSync,
  renameSync,
  rmSync
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative } from "node:path";
import type { HoshiSettings } from "@hoshi/shared";
import { parsePluginContributes, EMOTIONS } from "@hoshi/shared";

const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", ".dsh", ".plugin-meta"]);
const SKIP_FILES = new Set([".hoshi-template", ".dsh-root"]);
const TEXT_EXTS = new Set([".js", ".json", ".md", ".ts", ".txt", ".yml", ".yaml", ".env", ".html", ".css"]);
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{16,}/,
  /AKIA[0-9A-Z]{16}/,
  /BEGIN (RSA )?PRIVATE KEY/,
  /api[_-]?key\s*=\s*['"][^'"]{8,}/i,
  /ghp_[A-Za-z0-9]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReservedPluginId(id: string): boolean {
  return id.startsWith("_template");
}

export type PluginTemplateKind = "panel" | "launcher" | "mcp" | "theme";

const TEMPLATE_LOCK = ".hoshi-template";
let templateMetaRoot = "";

export function setTemplateMetaRoot(dir: string): void {
  templateMetaRoot = dir;
  mkdirSync(dir, { recursive: true });
}

function parseTemplateKind(raw: string): PluginTemplateKind | null {
  const t = raw.trim();
  if (t === "panel" || t === "launcher" || t === "mcp" || t === "theme") return t;
  return null;
}

function metaFile(sandboxDir: string, id: string): string {
  return join(templateMetaRoot || join(sandboxDir, ".plugin-meta"), id);
}

export function readTemplateLock(dir: string): PluginTemplateKind | null {
  try {
    return parseTemplateKind(readFileSync(join(dir, TEMPLATE_LOCK), "utf8"));
  } catch {
    return null;
  }
}

export function writeTemplateLock(dir: string, template: PluginTemplateKind): void {
  writeFileSync(join(dir, TEMPLATE_LOCK), `${template}\n`);
}

export function freezePluginTemplate(sandboxDir: string, id: string, template: PluginTemplateKind): void {
  const root = templateMetaRoot || join(sandboxDir, ".plugin-meta");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, id), `${template}\n`);
  const dir = join(sandboxDir, "plugins", id);
  if (existsSync(dir)) writeTemplateLock(dir, template);
}

export function frozenTemplateOf(sandboxDir: string, id: string): PluginTemplateKind {
  const known = peekFrozenTemplate(sandboxDir, id);
  if (known) return known;
  throw new Error("请用模板或连接");
}

function inferTemplateFromManifest(sandboxDir: string, id: string): PluginTemplateKind | null {
  try {
    const dir = join(sandboxDir, "plugins", id);
    const raw = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")) as unknown;
    if (!isRecord(raw)) return null;
    if (raw.kind === "mcp") return "mcp";
    const t = parseTemplateKind(typeof raw.template === "string" ? raw.template : "");
    if (t) return t;
    if (existsSync(join(dir, "theme.json"))) return "theme";
    if (existsSync(join(dir, "layout.json"))) return "panel";
    return null;
  } catch {
    return null;
  }
}

export function peekFrozenTemplate(sandboxDir: string, id: string): PluginTemplateKind | null {
  try {
    const locked = parseTemplateKind(readFileSync(metaFile(sandboxDir, id), "utf8"));
    if (locked) return locked;
  } catch {
    /* none */
  }
  return inferTemplateFromManifest(sandboxDir, id);
}

export function pluginTemplateOf(dir: string): PluginTemplateKind {
  const id = basename(dir);
  if (id && templateMetaRoot) {
    try {
      const locked = parseTemplateKind(readFileSync(join(templateMetaRoot, id), "utf8"));
      if (locked) return locked;
    } catch {
      /* none */
    }
  }
  const fromLock = readTemplateLock(dir);
  if (fromLock) return fromLock;
  try {
    const raw = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")) as unknown;
    if (isRecord(raw)) {
      if (raw.kind === "mcp") return "mcp";
      const t = parseTemplateKind(typeof raw.template === "string" ? raw.template : "");
      if (t) return t;
    }
  } catch {
    /* none */
  }
  if (existsSync(join(dir, "theme.json"))) return "theme";
  if (existsSync(join(dir, "layout.json"))) return "panel";
  return "theme";
}

export function restoreTemplateLocks(sandboxDir: string): void {
  const root = join(sandboxDir, "plugins");
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || isReservedPluginId(entry.name)) continue;
    const kind = peekFrozenTemplate(sandboxDir, entry.name);
    if (kind) writeTemplateLock(join(root, entry.name), kind);
  }
}

export function lockLiveTemplates(pluginsDir: string): void {
  if (!existsSync(pluginsDir) || !templateMetaRoot) return;
  for (const name of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const dir = join(pluginsDir, name.name);
    try {
      const locked = parseTemplateKind(readFileSync(join(templateMetaRoot, name.name), "utf8"));
      if (locked) writeTemplateLock(dir, locked);
    } catch {
      /* 无 meta 不加能力 */
    }
  }
}

function copyIfMissing(src: string, dest: string): void {
  if (!existsSync(src)) {
    return;
  }
  if (statSync(src).isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const name of readdirSync(src)) {
      copyIfMissing(join(src, name), join(dest, name));
    }
    return;
  }
  if (existsSync(dest)) {
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

const PROTOCOL_FILES = [
  "AGENTS.md",
  "protocol/DEV.md",
  "protocol/hoshi-plugin.schema.json",
  "protocol/mcp-templates.json",
  "tools/publish.sh",
  "plugins/_template_panel/AGENTS.md",
  "plugins/_template_launcher/AGENTS.md"
];

function overwriteProtocol(templateDir: string, sandboxDir: string): void {
  for (const rel of PROTOCOL_FILES) {
    const src = join(templateDir, rel);
    if (!existsSync(src) || !statSync(src).isFile()) {
      continue;
    }
    const dest = join(sandboxDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
  for (const name of ["_template_panel", "_template_launcher", "_template_theme"]) {
    const src = join(templateDir, "plugins", name);
    if (!existsSync(src)) continue;
    const dest = join(sandboxDir, "plugins", name);
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
  }
  rmSync(join(sandboxDir, "plugins", "_template"), { recursive: true, force: true });
  for (const stale of ["protocol/panel.example.html", "protocol/panel.example.js", "tools/test.sh", "tools/new-plugin.sh"]) {
    const extra = join(sandboxDir, stale);
    if (existsSync(extra)) unlinkSync(extra);
  }
}

export function seedWorkbenchSandbox(templateDir: string, sandboxDir: string): void {
  mkdirSync(sandboxDir, { recursive: true });
  copyIfMissing(templateDir, sandboxDir);
  overwriteProtocol(templateDir, sandboxDir);
  mkdirSync(join(sandboxDir, ".publish"), { recursive: true });
  restoreTemplateLocks(sandboxDir);
}

export function listSandboxPluginIds(sandboxDir: string): string[] {
  const pluginsRoot = join(sandboxDir, "plugins");
  if (!existsSync(pluginsRoot)) {
    return [];
  }
  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !isReservedPluginId(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function listSandboxPluginEntries(
  sandboxDir: string
): { id: string; template: PluginTemplateKind }[] {
  return listSandboxPluginIds(sandboxDir).flatMap((id) => {
    const template = peekFrozenTemplate(sandboxDir, id);
    return template ? [{ id, template }] : [];
  });
}

export type LivePluginItem = {
  id: string;
  name: string;
  description: string;
  cover: string;
  template: PluginTemplateKind;
  enabled: boolean;
};

export type ThemeTokens = {
  bg: string;
  font: string;
  dialog: string;
  menu: string;
  sound: string;
};

const DEFAULT_TOKENS: ThemeTokens = {
  bg: "#f4f6fb",
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  dialog: "#ffffff",
  menu: "#ffffff",
  sound: ""
};

export function parseThemeTokens(raw: unknown): ThemeTokens {
  const rec = isRecord(raw) ? raw : {};
  const tokens = isRecord(rec.tokens) ? rec.tokens : rec;
  return {
    bg: typeof tokens.bg === "string" && tokens.bg.trim() ? tokens.bg.trim() : DEFAULT_TOKENS.bg,
    font: typeof tokens.font === "string" && tokens.font.trim() ? tokens.font.trim() : DEFAULT_TOKENS.font,
    dialog:
      typeof tokens.dialog === "string" && tokens.dialog.trim() ? tokens.dialog.trim() : DEFAULT_TOKENS.dialog,
    menu: typeof tokens.menu === "string" && tokens.menu.trim() ? tokens.menu.trim() : DEFAULT_TOKENS.menu,
    sound: typeof tokens.sound === "string" ? tokens.sound.trim() : ""
  };
}

export function exclusiveThemeEnabled(pluginsDir: string, enabled: string[]): string[] {
  let lastTheme = "";
  const out: string[] = [];
  for (const id of enabled) {
    if (pluginTemplateOf(join(pluginsDir, id)) === "theme") lastTheme = id;
    else out.push(id);
  }
  if (lastTheme) out.push(lastTheme);
  return out;
}

export function resolveActiveTheme(
  pluginsDir: string,
  enabled: string[]
): { id: string; tokens: ThemeTokens } | null {
  let found: { id: string; tokens: ThemeTokens } | null = null;
  for (const id of exclusiveThemeEnabled(pluginsDir, enabled)) {
    if (pluginTemplateOf(join(pluginsDir, id)) !== "theme") continue;
    const file = join(pluginsDir, id, "theme.json");
    let tokens = DEFAULT_TOKENS;
    try {
      tokens = parseThemeTokens(JSON.parse(readFileSync(file, "utf8")) as unknown);
    } catch {
      /* 默认 */
    }
    found = { id, tokens };
  }
  return found;
}

const SOUND_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg"
};

export function themeSoundDataUrl(pluginsDir: string, enabled: string[]): string {
  const theme = resolveActiveTheme(pluginsDir, enabled);
  if (!theme || !theme.tokens.sound) {
    return "";
  }
  const rel = theme.tokens.sound.trim().replace(/\\/g, "/");
  const parts = rel.split("/");
  if (
    !parts.length ||
    parts.some((part) => !part || part === "." || part === ".." || !REL_SEG.test(part))
  ) {
    return "";
  }
  const file = join(pluginsDir, theme.id, ...parts);
  if (!existsSync(file) || !statSync(file).isFile()) {
    return "";
  }
  const mime = SOUND_MIME[extname(file).toLowerCase()];
  if (!mime) {
    return "";
  }
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

export function listLivePlugins(pluginsDir: string, settings: HoshiSettings): LivePluginItem[] {
  const enabled = new Set(settings.plugins.enabled);
  const items: LivePluginItem[] = [];
  if (existsSync(pluginsDir)) {
    for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || isReservedPluginId(entry.name)) continue;
      let name = entry.name;
      let description = "";
      const dir = join(pluginsDir, entry.name);
      try {
        const raw = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")) as unknown;
        if (isRecord(raw) && typeof raw.name === "string" && raw.name.trim()) name = raw.name;
        if (isRecord(raw) && typeof raw.description === "string") description = raw.description;
      } catch {
        /* 无清单 */
      }
      items.push({
        id: entry.name,
        name,
        description,
        cover: liveCover(dir),
        template: pluginTemplateOf(dir),
        enabled: enabled.has(entry.name)
      });
    }
  }
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

export type SandboxPluginForm = {
  id: string;
  template: PluginTemplateKind;
  name: string;
  description: string;
  label: string;
  title: string;
  multiple: boolean;
  filters: { name: string; extensions: string[] }[];
};

function readPluginJson(sandboxDir: string, id: string): Record<string, unknown> {
  const raw = JSON.parse(readFileSync(join(pluginRoot(sandboxDir, id), "plugin.json"), "utf8")) as unknown;
  if (!isRecord(raw)) throw new Error("plugin.json 无效");
  return raw;
}

export function readSandboxPluginForm(sandboxDir: string, id: string): SandboxPluginForm {
  const raw = readPluginJson(sandboxDir, id);
  const slots = isRecord(raw.slots) ? raw.slots : {};
  const ui = isRecord(raw.ui) ? raw.ui : {};
  const menu = isRecord(ui.menu) ? ui.menu : {};
  const filters: { name: string; extensions: string[] }[] = [];
  if (Array.isArray(slots.filters)) {
    for (const item of slots.filters) {
      if (!isRecord(item) || typeof item.name !== "string") continue;
      const extensions = Array.isArray(item.extensions)
        ? item.extensions.filter((ext): ext is string => typeof ext === "string")
        : [];
      filters.push({ name: item.name, extensions });
    }
  }
  const template = peekFrozenTemplate(sandboxDir, id);
  if (!template || template === "mcp") {
    throw new Error("请用模板或连接");
  }
  return {
    id,
    template,
    name: typeof raw.name === "string" ? raw.name : "",
    description: typeof raw.description === "string" ? raw.description : "",
    label: typeof menu.label === "string" ? menu.label : "",
    title: typeof slots.title === "string" ? slots.title : "",
    multiple: slots.multiple === true,
    filters
  };
}

export function patchSandboxPluginForm(
  sandboxDir: string,
  id: string,
  patch: {
    name?: string;
    description?: string;
    label?: string;
    title?: string;
    multiple?: boolean;
    filters?: { name: string; extensions: string[] }[];
  }
): SandboxPluginForm {
  const dest = join(pluginRoot(sandboxDir, id), "plugin.json");
  const raw = readPluginJson(sandboxDir, id);
  if (typeof patch.name === "string") raw.name = patch.name;
  if (typeof patch.description === "string") raw.description = patch.description;
  if (typeof patch.label === "string") {
    const ui = isRecord(raw.ui) ? raw.ui : {};
    const menu = isRecord(ui.menu) ? ui.menu : {};
    menu.label = patch.label;
    ui.menu = menu;
    raw.ui = ui;
  }
  const slots = isRecord(raw.slots) ? raw.slots : {};
  if (typeof patch.title === "string") slots.title = patch.title;
  if (typeof patch.multiple === "boolean") slots.multiple = patch.multiple;
  if (Array.isArray(patch.filters)) slots.filters = patch.filters;
  raw.slots = slots;
  writeFileSync(dest, `${JSON.stringify(raw, null, 2)}\n`);
  return readSandboxPluginForm(sandboxDir, id);
}

export type SandboxPluginKind = "mcp" | "panel" | "launcher" | "theme";

function templateDirName(kind: SandboxPluginKind): string {
  if (kind === "panel") return "_template_panel";
  if (kind === "launcher") return "_template_launcher";
  if (kind === "theme") return "_template_theme";
  throw new Error("kind 无效");
}

function liveCover(dir: string): string {
  const tryFiles = ["cover.png", "cover.webp", "sprites/normal.png"];
  for (const rel of tryFiles) {
    if (existsSync(join(dir, rel))) return rel;
  }
  try {
    const theme = JSON.parse(readFileSync(join(dir, "theme.json"), "utf8")) as unknown;
    if (isRecord(theme) && isRecord(theme.sprites)) {
      for (const rel of Object.values(theme.sprites)) {
        if (typeof rel === "string" && existsSync(join(dir, rel))) return rel;
      }
    }
  } catch {
    /* none */
  }
  return "";
}

export function createSandboxPlugin(
  sandboxDir: string,
  dirName: string,
  kind: string = "theme"
): void {
  if (!/^[A-Za-z0-9_-]+$/.test(dirName) || isReservedPluginId(dirName)) {
    throw new Error("工作区 id 无效");
  }
  if (kind === "mcp") {
    throw new Error("请到连接页添加连接器");
  }
  if (kind !== "panel" && kind !== "launcher" && kind !== "theme") {
    throw new Error("请用模板或连接");
  }
  const dest = join(sandboxDir, "plugins", dirName);
  if (existsSync(dest)) {
    throw new Error("目录已存在");
  }
  const template = join(sandboxDir, "plugins", templateDirName(kind));
  if (!existsSync(template)) {
    throw new Error("缺少模板");
  }
  mkdirSync(join(sandboxDir, "plugins"), { recursive: true });
  cpSync(template, dest, { recursive: true });
  const manifestPath = join(dest, "plugin.json");
  const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  raw.id = dirName;
  raw.kind = "native";
  raw.template = kind;
  if (isRecord(raw.tool)) {
    raw.tool.name = dirName;
  }
  writeFileSync(manifestPath, `${JSON.stringify(raw, null, 2)}\n`);
  freezePluginTemplate(sandboxDir, dirName, kind);
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

const FILE_MAX_BYTES = 512 * 1024;
const REL_SEG = /^[A-Za-z0-9._-]+$/;

function pluginRoot(sandboxDir: string, dirName: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(dirName) || isReservedPluginId(dirName)) {
    throw new Error("工作区 id 无效");
  }
  const pluginsRoot = realpathSync(join(sandboxDir, "plugins"));
  const dest = join(pluginsRoot, dirName);
  if (!existsSync(dest)) {
    throw new Error("目录不存在");
  }
  const real = realpathSync(dest);
  if (!isInside(pluginsRoot, real)) {
    throw new Error("插件路径非法");
  }
  return real;
}

function resolveInsidePlugin(root: string, rel: string): string {
  const parts = rel
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== ".");
  if (parts.some((part) => part === ".." || !REL_SEG.test(part) || SKIP_DIRS.has(part) || SKIP_FILES.has(part))) {
    throw new Error("路径非法");
  }
  const target = parts.length ? join(root, ...parts) : root;
  if (!existsSync(target)) {
    throw new Error("不存在");
  }
  const real = realpathSync(target);
  if (real !== root && !isInside(root, real)) {
    throw new Error("插件路径非法");
  }
  return real;
}

const ASSET_EXT = new Set([".png", ".webp", ".jpg", ".jpeg", ".gif", ".mp3", ".wav", ".m4a", ".ogg"]);

export function writeSandboxAsset(
  sandboxDir: string,
  dirName: string,
  rel: string,
  bytes: Buffer
): { rel: string } {
  const root = pluginRoot(sandboxDir, dirName);
  const parts = rel
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== ".");
  if (
    !parts.length ||
    parts.some((part) => part === ".." || !REL_SEG.test(part) || SKIP_DIRS.has(part) || SKIP_FILES.has(part))
  ) {
    throw new Error("路径非法");
  }
  const ext = extname(parts[parts.length - 1] ?? "").toLowerCase();
  if (!ASSET_EXT.has(ext)) throw new Error("不支持该类型");
  if (bytes.length > FILE_MAX_BYTES * 4) throw new Error("文件太大");
  const dest = join(root, ...parts);
  if (!isInside(root, dest) && dest !== root) throw new Error("插件路径非法");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
  return { rel: parts.join("/") };
}

export type ThemePack = {
  name: string;
  description: string;
  tokens: ThemeTokens;
  sprites: Partial<Record<(typeof EMOTIONS)[number], string>>;
};

function readNameDesc(raw: unknown): { name: string; description: string } {
  let name = "";
  let description = "";
  if (isRecord(raw)) {
    if (typeof raw.name === "string") name = raw.name.trim();
    if (typeof raw.description === "string") description = raw.description.trim();
  }
  return { name, description };
}

export function readThemePack(sandboxDir: string, id: string): ThemePack {
  const root = pluginRoot(sandboxDir, id);
  let tokens = DEFAULT_TOKENS;
  const sprites: ThemePack["sprites"] = {};
  let name = "";
  let description = "";
  try {
    const manifest = JSON.parse(readFileSync(join(root, "plugin.json"), "utf8")) as unknown;
    const nd = readNameDesc(manifest);
    name = nd.name;
    description = nd.description;
  } catch {
    /* 无清单 */
  }
  try {
    const raw = JSON.parse(readFileSync(join(root, "theme.json"), "utf8")) as unknown;
    tokens = parseThemeTokens(raw);
    if (isRecord(raw) && isRecord(raw.sprites)) {
      for (const [key, value] of Object.entries(raw.sprites)) {
        if (EMOTIONS.includes(key as (typeof EMOTIONS)[number]) && typeof value === "string") {
          sprites[key as (typeof EMOTIONS)[number]] = value;
        }
      }
    }
  } catch {
    /* 空 */
  }
  return { name, description, tokens, sprites };
}

export function writeThemePack(sandboxDir: string, id: string, pack: ThemePack): ThemePack {
  const root = pluginRoot(sandboxDir, id);
  const name = typeof pack.name === "string" ? pack.name.trim() : "";
  const description = typeof pack.description === "string" ? pack.description.trim() : "";
  const next: ThemePack = {
    name,
    description,
    tokens: parseThemeTokens({ tokens: pack.tokens }),
    sprites: pack.sprites ?? {}
  };
  writeFileSync(
    join(root, "theme.json"),
    `${JSON.stringify({ tokens: next.tokens, sprites: next.sprites }, null, 2)}\n`
  );
  const manifest = readPluginJson(sandboxDir, id);
  if (name) manifest.name = name;
  manifest.description = description;
  manifest.contributes = { sprites: next.sprites };
  writeFileSync(join(root, "plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return next;
}

export function readLiveThemePack(pluginsDir: string, id: string): ThemePack {
  if (!/^[A-Za-z0-9_-]+$/.test(id) || isReservedPluginId(id)) {
    throw new Error("工作区 id 无效");
  }
  const dir = join(pluginsDir, id);
  if (!existsSync(dir)) {
    throw new Error("目录不存在");
  }
  let tokens = DEFAULT_TOKENS;
  const sprites: ThemePack["sprites"] = {};
  let name = "";
  let description = "";
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "plugin.json"), "utf8")) as unknown;
    const nd = readNameDesc(manifest);
    name = nd.name;
    description = nd.description;
  } catch {
    /* none */
  }
  try {
    const raw = JSON.parse(readFileSync(join(dir, "theme.json"), "utf8")) as unknown;
    tokens = parseThemeTokens(raw);
    if (isRecord(raw) && isRecord(raw.sprites)) {
      for (const [key, value] of Object.entries(raw.sprites)) {
        if (EMOTIONS.includes(key as (typeof EMOTIONS)[number]) && typeof value === "string") {
          sprites[key as (typeof EMOTIONS)[number]] = value;
        }
      }
    }
  } catch {
    /* 空 */
  }
  return { name, description, tokens, sprites };
}

export type LayoutNode = {
  id: string;
  type: "image" | "text" | "deco";
  x: number;
  y: number;
  w: number;
  h: number;
  src?: string;
  text?: string;
};

export function readLayout(sandboxDir: string, id: string): { nodes: LayoutNode[] } {
  try {
    const raw = JSON.parse(readFileSync(join(pluginRoot(sandboxDir, id), "layout.json"), "utf8")) as unknown;
    if (!isRecord(raw) || !Array.isArray(raw.nodes)) return { nodes: [] };
    return { nodes: raw.nodes.filter((item): item is LayoutNode => isRecord(item) && typeof item.id === "string") };
  } catch {
    return { nodes: [] };
  }
}

export function writeLayout(sandboxDir: string, id: string, nodes: LayoutNode[]): { nodes: LayoutNode[] } {
  const next = { nodes };
  writeFileSync(join(pluginRoot(sandboxDir, id), "layout.json"), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function sandboxAssetDataUrl(sandboxDir: string, id: string, rel: string): string {
  const file = resolveInsidePlugin(pluginRoot(sandboxDir, id), rel);
  const ext = extname(file).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
            ? "image/gif"
            : "application/octet-stream";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

export function liveAssetDataUrl(pluginsDir: string, id: string, rel: string): string {
  const file = join(pluginsDir, id, ...rel.replace(/\\/g, "/").split("/"));
  if (!existsSync(file)) return "";
  const ext = extname(file).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : "image/png";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
}

export function deleteSandboxPlugin(sandboxDir: string, dirName: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(dirName) || isReservedPluginId(dirName)) {
    throw new Error("工作区 id 无效");
  }
  const pluginsRoot = realpathSync(join(sandboxDir, "plugins"));
  const dest = join(pluginsRoot, dirName);
  if (!existsSync(dest)) {
    throw new Error("目录不存在");
  }
  const real = realpathSync(dest);
  if (!isInside(pluginsRoot, real)) {
    throw new Error("插件路径非法");
  }
  rmSync(real, { recursive: true, force: true });
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (entry.isFile()) {
        out.push(full);
      }
    }
  };
  visit(root);
  return out;
}

function readManifest(
  pluginDir: string,
  dirName: string,
  frozen: PluginTemplateKind
): { id: string; kind: "native" | "mcp" } {
  const raw = JSON.parse(readFileSync(join(pluginDir, "plugin.json"), "utf8")) as unknown;
  if (!isRecord(raw)) {
    throw new Error("plugin.json 无效");
  }
  for (const key of ["id", "name", "description", "version"]) {
    if (typeof raw[key] !== "string" || !String(raw[key]).trim()) {
      throw new Error(`plugin.json 缺 ${key}`);
    }
  }
  const id = String(raw.id).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error("plugin.json id 无效");
  }
  if (id !== dirName) {
    throw new Error("plugin.json id 须与目录名一致");
  }
  if (!isRecord(raw.tool) || typeof raw.tool.name !== "string" || !raw.tool.name.trim()) {
    throw new Error("plugin.json tool 无效");
  }
  if (!isRecord(raw.tool.parameters)) {
    throw new Error("plugin.json 缺 tool.parameters");
  }
  const kind = frozen === "mcp" ? "mcp" : "native";
  return { id, kind };
}

function readConnector(pluginDir: string, id: string): { name: string; command: string; args: string[]; env: Record<string, string> } {
  const raw = JSON.parse(readFileSync(join(pluginDir, "connector.json"), "utf8")) as unknown;
  if (!isRecord(raw) || typeof raw.command !== "string" || !raw.command.trim()) {
    throw new Error("connector.json 无效");
  }
  const args = Array.isArray(raw.args) ? raw.args.filter((item): item is string => typeof item === "string") : [];
  const env: Record<string, string> = {};
  if (isRecord(raw.env)) {
    for (const [key, value] of Object.entries(raw.env)) {
      if (typeof value === "string") {
        env[key] = value;
      }
    }
  }
  return { name: id, command: raw.command.trim(), args, env };
}

function mergeMcpServer(mcpPath: string, server: { name: string; command: string; args: string[]; env: Record<string, string> }): void {
  let servers: unknown[] = [];
  if (existsSync(mcpPath)) {
    const raw = JSON.parse(readFileSync(mcpPath, "utf8")) as unknown;
    if (isRecord(raw) && Array.isArray(raw.servers)) {
      servers = raw.servers.filter((item) => !(isRecord(item) && item.name === server.name));
    }
  }
  servers.push({ ...server, enabled: true });
  writeFileSync(mcpPath, `${JSON.stringify({ servers }, null, 2)}\n`);
}

export function migrateSandboxMcp(sandboxDir: string, mcpPath: string): string[] {
  const moved: string[] = [];
  const pluginsRoot = join(sandboxDir, "plugins");
  if (!existsSync(pluginsRoot)) {
    return moved;
  }
  const destRoot = join(sandboxDir, ".migrated-mcp");
  for (const id of listSandboxPluginIds(sandboxDir)) {
    if (peekFrozenTemplate(sandboxDir, id) !== "mcp") {
      continue;
    }
    const pluginDir = join(pluginsRoot, id);
    try {
      const connector = readConnector(pluginDir, id);
      const already = existsSync(mcpPath)
        ? (JSON.parse(readFileSync(mcpPath, "utf8")) as { servers?: { name?: string }[] }).servers?.some(
            (item) => item?.name === id
          )
        : false;
      if (!already) {
        mergeMcpServer(mcpPath, connector);
      }
    } catch {
      /* 坏 connector 仍挪走草稿 */
    }
    mkdirSync(destRoot, { recursive: true });
    const dest = join(destRoot, id);
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    renameSync(pluginDir, dest);
    for (const meta of [metaFile(sandboxDir, id), join(sandboxDir, ".plugin-meta", id)]) {
      if (existsSync(meta)) unlinkSync(meta);
    }
    moved.push(id);
  }
  return moved;
}

function scanSecrets(pluginDir: string): void {
  for (const file of walkFiles(pluginDir)) {
    if (!TEXT_EXTS.has(extname(file).toLowerCase()) && !file.endsWith(".env")) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) {
        throw new Error(`疑似密钥: ${relative(pluginDir, file)}`);
      }
    }
  }
}

export async function publishSandboxPlugin(input: {
  sandboxDir: string;
  pluginsDir: string;
  mcpPath: string;
  dirName: string;
  settings: HoshiSettings;
}): Promise<{ id: string; kind: "native" | "mcp"; howToUse?: string }> {
  if (!/^[A-Za-z0-9_-]+$/.test(input.dirName) || isReservedPluginId(input.dirName)) {
    throw new Error("插件 id 无效");
  }
  const pluginsRoot = realpathSync(join(input.sandboxDir, "plugins"));
  const source = join(pluginsRoot, input.dirName);
  if (!existsSync(source)) {
    throw new Error("插件不在沙箱内");
  }
  const realSource = realpathSync(source);
  if (!isInside(pluginsRoot, realSource)) {
    throw new Error("插件路径非法");
  }
  const frozen = frozenTemplateOf(input.sandboxDir, input.dirName);
  writeTemplateLock(realSource, frozen);
  const manifestPath = join(realSource, "plugin.json");
  const rawManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  if (isRecord(rawManifest)) {
    rawManifest.template = frozen;
    rawManifest.kind = frozen === "mcp" ? "mcp" : "native";
    if (isRecord(rawManifest.contributes)) {
      delete rawManifest.contributes.webviews;
      delete rawManifest.contributes.windows;
      delete rawManifest.contributes.commands;
      delete rawManifest.contributes.menus;
    }
    if (isRecord(rawManifest.ui)) {
      delete rawManifest.ui.panel;
    }
    writeFileSync(manifestPath, `${JSON.stringify(rawManifest, null, 2)}\n`);
  }
  const manifest = readManifest(realSource, input.dirName, frozen);
  const contributes = parsePluginContributes(isRecord(rawManifest) ? rawManifest.contributes : undefined);
  if (contributes) {
    for (const rel of Object.values(contributes.sprites ?? {})) {
      const file = resolveInsidePlugin(realSource, rel);
      const ext = extname(file).toLowerCase();
      if (!statSync(file).isFile() || (ext !== ".png" && ext !== ".webp" && ext !== ".jpg" && ext !== ".jpeg")) {
        throw new Error(`立绘无效: ${rel}`);
      }
    }
  }
  scanSecrets(realSource);
  if (frozen === "mcp") {
    throw new Error("请到连接页添加连接器");
  }
  const dest = join(input.pluginsDir, input.dirName);
  mkdirSync(input.pluginsDir, { recursive: true });
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(realSource, "plugin.json"), join(dest, "plugin.json"));
  writeTemplateLock(dest, frozen);
  const extraFiles = ["theme.json", "layout.json", "cover.png", "cover.webp"];
  for (const name of extraFiles) {
    const from = join(realSource, name);
    if (existsSync(from) && statSync(from).isFile()) copyFileSync(from, join(dest, name));
  }
  const copyRels = new Set<string>(Object.values(contributes?.sprites ?? {}));
  if (frozen === "theme") {
    try {
      const pack = JSON.parse(readFileSync(join(realSource, "theme.json"), "utf8")) as unknown;
      if (isRecord(pack) && isRecord(pack.sprites)) {
        for (const rel of Object.values(pack.sprites)) {
          if (typeof rel === "string") copyRels.add(rel);
        }
      }
      if (isRecord(pack) && isRecord(pack.tokens)) {
        const sound = pack.tokens.sound;
        if (typeof sound === "string" && sound.trim()) {
          copyRels.add(sound.trim().replace(/\\/g, "/"));
        }
      }
    } catch {
      /* none */
    }
  }
  if (frozen === "panel" || frozen === "launcher") {
    try {
      const layout = JSON.parse(readFileSync(join(realSource, "layout.json"), "utf8")) as unknown;
      if (isRecord(layout) && Array.isArray(layout.nodes)) {
        for (const node of layout.nodes) {
          if (isRecord(node) && typeof node.src === "string" && node.src.trim()) copyRels.add(node.src.trim());
        }
      }
    } catch {
      /* none */
    }
  }
  for (const rel of copyRels) {
    const from = resolveInsidePlugin(realSource, rel);
    const to = join(dest, ...rel.replace(/\\/g, "/").split("/"));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  const enabled = input.settings.plugins.enabled.includes(manifest.id)
    ? input.settings.plugins.enabled
    : [...input.settings.plugins.enabled, manifest.id];
  input.settings.plugins.enabled =
    frozen === "theme" ? exclusiveThemeEnabled(input.pluginsDir, [...enabled, manifest.id]) : enabled;
  const toolDesc =
    isRecord(rawManifest) && isRecord(rawManifest.tool) && typeof rawManifest.tool.description === "string"
      ? rawManifest.tool.description.trim()
      : "";
  return { id: manifest.id, kind: "native" as const, ...(toolDesc ? { howToUse: toolDesc } : {}) };
}

function removeMcpServer(mcpPath: string, name: string): void {
  if (!existsSync(mcpPath)) return;
  const raw = JSON.parse(readFileSync(mcpPath, "utf8")) as unknown;
  if (!isRecord(raw) || !Array.isArray(raw.servers)) return;
  const servers = raw.servers.filter((item) => !(isRecord(item) && item.name === name));
  writeFileSync(mcpPath, `${JSON.stringify({ servers }, null, 2)}\n`);
}

function rmInside(parent: string, child: string): void {
  if (!existsSync(parent) || !existsSync(child)) return;
  const root = realpathSync(parent);
  const real = realpathSync(child);
  if (real === root || !isInside(root, real)) return;
  rmSync(real, { recursive: true, force: true });
}

export function uninstallPlugin(input: {
  sandboxDir: string;
  pluginsDir: string;
  mcpPath: string;
  storageDir: string;
  settings: HoshiSettings;
  dirName: string;
}): void {
  const id = input.dirName;
  if (!/^[A-Za-z0-9_-]+$/.test(id) || isReservedPluginId(id)) {
    throw new Error("工作区 id 无效");
  }
  try {
    deleteSandboxPlugin(input.sandboxDir, id);
  } catch {
    /* sandbox 可能已删 */
  }
  rmInside(input.pluginsDir, join(input.pluginsDir, id));
  for (const meta of [
    metaFile(input.sandboxDir, id),
    join(input.sandboxDir, ".plugin-meta", id)
  ]) {
    if (existsSync(meta)) unlinkSync(meta);
  }
  rmInside(join(input.sandboxDir, ".dsh"), join(input.sandboxDir, ".dsh", id));
  for (const dir of [input.storageDir, join(input.sandboxDir, ".storage")]) {
    const kv = join(dir, `${id}.json`);
    if (existsSync(kv)) unlinkSync(kv);
  }
  removeMcpServer(input.mcpPath, id);
  input.settings.plugins.enabled = input.settings.plugins.enabled.filter((item) => item !== id);
  delete input.settings.plugins.configs[id];
}

export function watchPublishQueue(
  sandboxDir: string,
  onRequest: (dirName: string) => Promise<void>
): { close: () => void } {
  const queue = join(sandboxDir, ".publish");
  mkdirSync(queue, { recursive: true });
  const pluginsRoot = join(sandboxDir, "plugins");
  mkdirSync(pluginsRoot, { recursive: true });
  const busy = new Set<string>();
  const finish = (id: string, ok: boolean, error?: string): void => {
    const dir = join(pluginsRoot, id);
    const queueOk = join(queue, `${id}.ok`);
    const queueErr = join(queue, `${id}.err`);
    try {
      if (ok) {
        writeFileSync(queueOk, "ok\n");
        if (existsSync(queueErr)) unlinkSync(queueErr);
        if (existsSync(dir)) {
          writeFileSync(join(dir, ".hoshi-publish.ok"), "ok\n");
          const localErr = join(dir, ".hoshi-publish.err");
          if (existsSync(localErr)) unlinkSync(localErr);
        }
        return;
      }
      const text = error ?? "上线失败";
      writeFileSync(queueErr, text);
      if (existsSync(dir)) writeFileSync(join(dir, ".hoshi-publish.err"), text);
    } catch {
      /* 沙箱目录可能已删 */
    }
  };
  const handle = (id: string): void => {
    if (!/^[A-Za-z0-9_-]+$/.test(id) || isReservedPluginId(id)) return;
    if (busy.has(id)) return;
    busy.add(id);
    void onRequest(id)
      .then(() => finish(id, true))
      .catch((error: unknown) => {
        finish(id, false, error instanceof Error ? error.message : "上线失败");
      })
      .finally(() => {
        busy.delete(id);
      });
  };
  const fromQueue = (name: string): void => {
    if (!name || name.endsWith(".ok") || name.endsWith(".err") || name.startsWith(".")) return;
    handle(name);
  };
  const fromPlugin = (rel: string): void => {
    const norm = rel.replace(/\\/g, "/");
    if (norm !== ".hoshi-publish" && !norm.endsWith("/.hoshi-publish")) return;
    const id = norm.includes("/") ? norm.slice(0, norm.indexOf("/")) : "";
    if (id) handle(id);
  };
  const watchers = [
    watch(queue, (event, filename) => {
      if (event !== "rename" && event !== "change") return;
      fromQueue(String(filename ?? ""));
    }),
    watch(pluginsRoot, { recursive: true }, (event, filename) => {
      if (event !== "rename" && event !== "change") return;
      fromPlugin(String(filename ?? ""));
    })
  ];
  return {
    close: () => {
      for (const item of watchers) item.close();
    }
  };
}
