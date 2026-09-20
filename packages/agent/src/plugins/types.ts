import type { PluginSettingField, PluginSource } from "@hoshi/shared";

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
}

export interface PluginExecuteContext {
  config: Record<string, string>;
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
}

export interface LlmTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}
