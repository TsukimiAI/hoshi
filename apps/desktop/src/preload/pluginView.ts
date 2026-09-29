import { contextBridge, ipcRenderer, webUtils } from "electron";

type HoshiPluginApi = {
  close: () => void;
  setPanelSize: (size: [number, number]) => Promise<void>;
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
  theme: () => Promise<{ bg: string; font: string; dialog: string; menu: string; sound: string } | null>;
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
        ipcRenderer.invoke("hoshi:plugin-theme") as Promise<{
          bg: string;
          font: string;
          dialog: string;
          menu: string;
          sound: string;
        } | null>,
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
