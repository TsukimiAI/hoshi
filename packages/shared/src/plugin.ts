export type PluginSource = "builtin" | "local";

export type PluginSettingFieldType = "text" | "password" | "textarea";

export interface PluginSettingField {
  key: string;
  label: string;
  type: PluginSettingFieldType;
  placeholder?: string;
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
