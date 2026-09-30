import { contextBridge, ipcRenderer, webUtils } from "electron";

type ThemeTokens = { bg: string; font: string; dialog: string; menu: string; sound: string };

type HoshiPluginApi = {
  close: () => void;
  setPanelSize: (size: [number, number]) => Promise<void>;
  setBoxSize: (size: [number, number]) => Promise<void>;
  pathForFile: (file: File) => string;
  pick: (opts?: {
    multiple?: boolean;
    directories?: boolean;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string[]>;
  run: (args: Record<string, unknown>) => Promise<string>;
  localUrl: (absPath: string) => string;
  listApps: () => Promise<{ name: string; path: string; names: string[] }[]>;
  openExternal: (target: string) => Promise<string>;
  slots: () => Promise<{ title: string; multiple: boolean; filters: { name: string; extensions: string[] }[] }>;
  layout: () => Promise<{ nodes: { id: string; type: string; x: number; y: number; w: number; h: number; src?: string; text?: string }[] }>;
  theme: () => Promise<ThemeTokens | null>;
  listPluginApps: () => Promise<{
    apps: { pluginId: string; title: string; template: "panel" | "launcher" | "music" | "schedule"; icon: "music" | "panel" | "launcher" | "schedule" }[];
    size: { width: number; height: number };
  }>;
  activate: (pluginId: string) => Promise<{
    pluginId: string;
    template: "panel" | "launcher" | "music" | "schedule";
    size: { width: number; height: number };
  }>;
  probeTracks: (paths: string[]) => Promise<
    { path: string; title: string; artist: string; album: string; picture: string | null }[]
  >;
  onAppsChanged: (cb: (removedId: string) => void) => () => void;
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: unknown) => Promise<void>;
    subscribe: (cb: (key: string, value: string) => void) => () => void;
  };
};

let api: HoshiPluginApi | undefined;

contextBridge.exposeInMainWorld("acquireHoshiApi", (): HoshiPluginApi => {
  if (!api) {
    api = {
      close: () => {
        ipcRenderer.send("hoshi:plugin-close");
      },
      setPanelSize: (size) =>
        ipcRenderer.invoke("hoshi:plugin-panel-size", { size }) as Promise<void>,
      setBoxSize: (size) =>
        ipcRenderer.invoke("hoshi:apps-set-size", { size }) as Promise<void>,
      pathForFile: (file: File) => {
        try {
          return webUtils.getPathForFile(file) || "";
        } catch {
          return "";
        }
      },
      pick: (opts) => ipcRenderer.invoke("hoshi:plugin-pick", opts ?? {}) as Promise<string[]>,
      run: (args) => ipcRenderer.invoke("hoshi:plugin-run", args) as Promise<string>,
      localUrl: (absPath) => {
        const id = String(ipcRenderer.sendSync("hoshi:plugin-id") ?? "");
        const norm = String(absPath ?? "").trim().replace(/\\/g, "/");
        return `hoshi-media://plugin/?id=${encodeURIComponent(id)}&p=${encodeURIComponent(norm)}`;
      },
      listApps: () =>
        ipcRenderer.invoke("hoshi:plugin-list-apps") as Promise<{ name: string; path: string; names: string[] }[]>,
      openExternal: (target) =>
        ipcRenderer.invoke("hoshi:plugin-open-external", target) as Promise<string>,
      slots: () =>
        ipcRenderer.invoke("hoshi:plugin-slots") as Promise<{
          title: string;
          multiple: boolean;
          filters: { name: string; extensions: string[] }[];
        }>,
      layout: () =>
        ipcRenderer.invoke("hoshi:plugin-layout") as Promise<{
          nodes: { id: string; type: string; x: number; y: number; w: number; h: number; src?: string; text?: string }[];
        }>,
      theme: () =>
        ipcRenderer.invoke("hoshi:plugin-theme") as Promise<ThemeTokens | null>,
      listPluginApps: () =>
        ipcRenderer.invoke("hoshi:list-plugin-apps") as Promise<{
          apps: { pluginId: string; title: string; template: "panel" | "launcher" | "music" | "schedule"; icon: "music" | "panel" | "launcher" | "schedule" }[];
          size: { width: number; height: number };
        }>,
      activate: (pluginId: string) =>
        ipcRenderer.invoke("hoshi:plugin-activate", pluginId) as Promise<{
          pluginId: string;
          template: "panel" | "launcher" | "music" | "schedule";
          size: { width: number; height: number };
        }>,
      probeTracks: (paths: string[]) =>
        ipcRenderer.invoke("hoshi:music-probe", paths) as Promise<
          { path: string; title: string; artist: string; album: string; picture: string | null }[]
        >,
      onAppsChanged: (cb: (removedId: string) => void) => {
        const handler = (_event: unknown, payload: { removedId?: unknown }) => {
          cb(String(payload?.removedId ?? ""));
        };
        ipcRenderer.on("hoshi:apps-changed", handler);
        return () => {
          ipcRenderer.removeListener("hoshi:apps-changed", handler);
        };
      },
      storage: {
        get: (key: string) => ipcRenderer.invoke("hoshi:plugin-kv-get", key) as Promise<string | null>,
        set: async (key: string, value: unknown) => {
          await ipcRenderer.invoke("hoshi:plugin-kv-set", key, value);
        },
        subscribe: (cb: (key: string, value: string) => void) => {
          const handler = (_event: unknown, payload: { key?: unknown; value?: unknown }) => {
            cb(String(payload?.key ?? ""), String(payload?.value ?? ""));
          };
          ipcRenderer.on("hoshi:plugin-kv-change", handler);
          return () => {
            ipcRenderer.removeListener("hoshi:plugin-kv-change", handler);
          };
        }
      }
    };
  }
  return api;
});
