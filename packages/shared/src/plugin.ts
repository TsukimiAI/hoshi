import { isEmotion, type Emotion } from "./emotion";

export type PluginSource = "builtin" | "local";

export type PluginSettingFieldType = "text" | "password" | "textarea";

export interface PluginSettingField {
  key: string;
  label: string;
  type: PluginSettingFieldType;
  placeholder?: string;
}

export interface PluginWindowContrib {
  id: string;
  title: string;
  entry: string;
  width?: number;
  height?: number;
}

export interface PluginCommandContrib {
  id: string;
  title: string;
  webview: string;
}

export interface PluginMenuFanItem {
  command: string;
}

export interface PluginActionContrib {
  id: string;
  label: string;
  window: string;
}

export interface PluginContributes {
  sprites?: Partial<Record<Emotion, string>>;
  commands?: PluginCommandContrib[];
  menus?: { fan?: PluginMenuFanItem[] };
  webviews?: PluginWindowContrib[];
  actions?: PluginActionContrib[];
  windows?: PluginWindowContrib[];
}

export interface PluginUi {
  menu: { label: string };
  panel: { file: string; size: [number, number] };
}

export interface PluginMarketItem {
  key: string;
  id: string;
  name: string;
  description: string;
  version: string;
  source: PluginSource;
  enabled: boolean;
  error?: string;
  settingsFields: PluginSettingField[];
  config: Record<string, string>;
}

export interface PluginListResponse {
  plugins: PluginMarketItem[];
}

export interface PluginFanAction {
  pluginId: string;
  id: string;
  label: string;
  window: string;
  kind?: "panel";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CONTRIB_REL = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

export function hasPluginContributes(contributes: PluginContributes | undefined): boolean {
  return Boolean(contributes?.sprites && Object.keys(contributes.sprites).length > 0);
}

export function hasPluginUi(ui: PluginUi | undefined): boolean {
  return Boolean(ui?.menu.label && ui?.panel.file);
}

function clampPanelSize(raw: unknown): [number, number] {
  let width = 280;
  let height = 360;
  if (Array.isArray(raw) && typeof raw[0] === "number" && typeof raw[1] === "number") {
    width = raw[0];
    height = raw[1];
  }
  return [
    Math.min(480, Math.max(160, Math.round(width))),
    Math.min(520, Math.max(200, Math.round(height)))
  ];
}

export function parsePluginUi(raw: unknown): PluginUi | undefined {
  if (!isRecord(raw) || !isRecord(raw.menu) || !isRecord(raw.panel)) {
    return undefined;
  }
  if (typeof raw.menu.label !== "string" || !raw.menu.label.trim()) {
    return undefined;
  }
  if (typeof raw.panel.file !== "string" || !CONTRIB_REL.test(raw.panel.file.trim())) {
    return undefined;
  }
  const file = raw.panel.file.trim().replace(/\\/g, "/");
  if (!file.toLowerCase().endsWith(".html") || file.split("/").some((part) => part === ".." || part === ".")) {
    return undefined;
  }
  return {
    menu: { label: raw.menu.label.trim().slice(0, 8) },
    panel: { file, size: clampPanelSize(raw.panel.size) }
  };
}

export function parsePluginContributes(raw: unknown): PluginContributes | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const sprites: Partial<Record<Emotion, string>> = {};
  if (isRecord(raw.sprites)) {
    for (const [key, value] of Object.entries(raw.sprites)) {
      if (typeof value === "string" && CONTRIB_REL.test(value.trim()) && isEmotion(key)) {
        sprites[key] = value.trim().replace(/\\/g, "/");
      }
    }
  }
  if (!Object.keys(sprites).length) {
    return undefined;
  }
  return { sprites };
}
