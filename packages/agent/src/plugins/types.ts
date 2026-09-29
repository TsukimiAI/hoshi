import type { PluginSettingField, PluginSource, PluginContributes, PluginUi } from "@hoshi/shared";

export interface PluginToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  tool: PluginToolSchema;
  settingsFields?: PluginSettingField[];
  contributes?: PluginContributes;
  ui?: PluginUi;
}

export type PluginPickOpts = {
  multiple?: boolean;
  directories?: boolean;
  filters?: { name: string; extensions: string[] }[];
};

export type HostAppInfo = { name: string; path: string; names: string[] };

export type ExecResult = { code: number; stdout: string; stderr: string };

export interface PluginExecuteContext {
  config: Record<string, string>;
  storage: {
    get: (key: string) => string | null;
    set: (key: string, value: unknown) => void;
  };
  openExternal: (target: string) => Promise<string>;
  listApps: () => Promise<HostAppInfo[]>;
  pick: (opts?: PluginPickOpts) => Promise<string[]>;
  notify: (title: string, body?: string) => void;
}

export type PluginExecute = (
  args: Record<string, unknown>,
  ctx: PluginExecuteContext
) => Promise<string>;

export interface LoadedPlugin {
  manifest: PluginManifest;
  source: PluginSource;
  dirName?: string;
  error?: string;
  execute?: PluginExecute;
  mainPath?: string;
}

export interface LlmTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
