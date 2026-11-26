type FormSettings = {
  model: { apiKey: string; baseUrl: string; model: string };
  chat: {
    contextBudget: number;
    compactTriggerToken: number;
    compactTriggerMsgCount: number;
    compactKeepRecent: number;
    referenceSites: string;
    memoryAutoWrite: boolean;
    deepseekApiKey: string;
    searchBaseUrl: string;
    searchModel: string;
  };
  presentation: {
    typeCharMs: number;
    sentenceGapMs: number;
    maxAssistantBubbles: number;
    fadeDelayMs: number;
    panelIdleCloseMs: number;
    soundVolume: number;
  };
  plugins: {
    enabled: string[];
    configs: Record<string, Record<string, string>>;
  };
  voice: {
    ttsBackend: "dashscope" | "gpt-sovits";
    asrBackend: "dashscope" | "whisper";
    dashscopeApiKey: string;
    dashscopeBaseUrl: string;
    hotwords: string;
    hotwordVocabularyId: string;
    ttsModel: string;
    ttsVoice: string;
    gsvBaseUrl: string;
    gsvRefAudioPath: string;
    gsvPromptText: string;
    gsvPromptLang: string;
    gsvGptWeights: string;
    gsvSovitsWeights: string;
    whisperBin: string;
    whisperModelPath: string;
    ttsEnabled: boolean;
  };
  knowledge: {
    enabled: boolean;
    embedding: {
      provider: "dashscope" | "openai-compat" | "ollama";
      baseUrl: string;
      apiKey: string;
      model: string;
    };
    search: { topK: number; minScore: number; contextBudgetChars: number; queryRewrite: "off" | "rewrite" | "multi" };
    rerank: { enabled: boolean; baseUrl: string; apiKey: string; model: string };
  };
  screen: {
    enabled: boolean;
  };
  appearance: {
    wallpaper: boolean;
  };
};

type PluginMarketItem = {
  key: string;
  id: string;
  name: string;
  description: string;
  version: string;
  source: "builtin" | "local";
  enabled: boolean;
  error?: string;
  settingsFields: Array<{
    key: string;
    label: string;
    type: "text" | "password" | "textarea";
    placeholder?: string;
  }>;
  config: Record<string, string>;
};

type MemoryItem = {
  id: string;
  text: string;
  kind: string;
  topic: string;
  status: string;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  ackedAt?: string | null;
  meta?: { source?: string; documentTitle?: string } | null;
};

type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  turns: number;
};

type UsageSummary = {
  all: UsageTotals;
  today: UsageTotals;
  byPurpose: Record<
    string,
    { all: UsageTotals; today: UsageTotals }
  >;
  sessions: Array<{
    sessionId: string;
    title: string;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    totalTokens: number;
    turns: number;
  }>;
};

interface SettingsApi {
  getSettings: () => Promise<FormSettings>;
  saveSettings: (settings: FormSettings) => Promise<FormSettings>;
  onSettingsUpdated: (handler: (settings: FormSettings) => void) => void;
  getTheme?: () => Promise<{
    tokens: { bg: string; font: string; dialog: string; menu: string; sound: string };
  } | null>;
  listPlugins: () => Promise<{ plugins: PluginMarketItem[] }>;
  openPluginsDir: () => Promise<void>;
  listMemories: () => Promise<{ memories: MemoryItem[] }>;
  getUsage: () => Promise<UsageSummary>;
  listArchivedMemories: () => Promise<{ memories: MemoryItem[] }>;
  deleteMemory: (id: string) => Promise<void>;
  restoreMemory: (id: string) => Promise<void>;
  updateMemory: (id: string, text: string) => Promise<MemoryItem>;
  testGsv: (baseUrl: string) => Promise<{ ok: true }>;
  whisperModelStatus: () => Promise<{
    ready: boolean;
    partialBytes: number;
    residualBytes: number;
    downloading: boolean;
    loaded: number;
    total: number;
  }>;
  downloadWhisperModel: () => Promise<{
    ok: true;
    path: string;
    skipped: boolean;
    stopped: boolean;
    busy: boolean;
  }>;
  stopWhisperDownload: () => Promise<{ ok: true }>;
  deleteWhisperModel: () => Promise<{ ok: boolean; removed: number }>;
  onWhisperDownloadProgress: (
    handler: (progress: { loaded: number; total: number }) => void
  ) => () => void;
  getWallpaper?: () => Promise<string>;
  setWallpaper?: (dataUrl: string) => Promise<{ ok: true }>;
  clearWallpaper?: () => Promise<{ ok: true }>;
  getWallpaperHistory?: () => Promise<Array<{ id: string; url: string }>>;
  useWallpaperHistory?: (id: string) => Promise<{ ok: true }>;
}

function num(id: string): number {
  const value = Number((document.getElementById(id) as HTMLInputElement).value);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function text(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement).value;
}

function fixTtsPair(model: string, voice: string): { model: string; voice: string } {
  let nextModel = model.trim();
  let nextVoice = voice.trim();
  const looksVoice = (value: string): boolean =>
    /^(long|loong)/i.test(value) && !value.includes("cosyvoice");
  if (looksVoice(nextModel) && !looksVoice(nextVoice)) {
    nextVoice = nextModel;
    nextModel = "cosyvoice-v2";
  }
  if (!nextModel || nextModel.includes("v3") || looksVoice(nextModel)) {
    nextModel = "cosyvoice-v2";
    if (!nextVoice || nextVoice === "longxiaochun" || nextVoice.endsWith("_v3")) {
      nextVoice = nextVoice.endsWith("_v3") ? nextVoice.replace(/_v3$/, "_v2") : "longxiaochun_v2";
    }
  }
  if (!nextVoice || nextVoice === "longxiaochun" || nextVoice.endsWith("_v3")) {
    nextVoice = nextVoice.endsWith("_v3") ? nextVoice.replace(/_v3$/, "_v2") : "longxiaochun_v2";
  }
  return { model: nextModel, voice: nextVoice };
}

function setText(id: string, value: string | number): void {
  (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement).value = String(value);
}

function checkbox(id: string, fallback: boolean): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? el.checked : fallback;
}

function readPluginSettings(fallback: FormSettings["plugins"]): FormSettings["plugins"] {
  const boxes = document.querySelectorAll("[data-plugin-enable]");
  if (boxes.length === 0) {
    return fallback;
  }
  const enabled: string[] = [];
  boxes.forEach((input) => {
    const checkboxEl = input as HTMLInputElement;
    if (checkboxEl.checked && checkboxEl.dataset.pluginEnable) {
      enabled.push(checkboxEl.dataset.pluginEnable);
    }
  });
  const configs: Record<string, Record<string, string>> = {};
  document.querySelectorAll("[data-plugin-id][data-field-key]").forEach((node) => {
    const el = node as HTMLInputElement | HTMLTextAreaElement;
    const id = el.dataset.pluginId;
    const key = el.dataset.fieldKey;
    if (!id || !key) {
      return;
    }
    if (!configs[id]) {
      configs[id] = {};
    }
    configs[id][key] = el.value;
  });
  return { enabled, configs };
}

function readTtsBackend(): FormSettings["voice"]["ttsBackend"] {
  const checked = document.querySelector(
    'input[name="ttsBackend"]:checked'
  ) as HTMLInputElement | null;
  return checked?.value === "gpt-sovits" ? "gpt-sovits" : "dashscope";
}

function readAsrBackend(): FormSettings["voice"]["asrBackend"] {
  const checked = document.querySelector(
    'input[name="asrBackend"]:checked'
  ) as HTMLInputElement | null;
  return checked?.value === "whisper" ? "whisper" : "dashscope";
}

function kbQueryRewriteValue(): "off" | "rewrite" | "multi" {
  const el = document.getElementById("kbQueryRewrite") as HTMLSelectElement | null;
  const value = el?.value;
  return value === "rewrite" || value === "multi" ? value : "off";
}

function syncVoicePanels(): void {
  const gsv = readTtsBackend() === "gpt-sovits";
  document.getElementById("dashscope-fields")?.classList.toggle("hidden", gsv);
  document.getElementById("gsv-fields")?.classList.toggle("hidden", !gsv);
  document.getElementById("whisper-fields")?.classList.toggle("hidden", readAsrBackend() !== "whisper");
  const paths = document.getElementById("whisper-paths") as HTMLDetailsElement | null;
  if (paths) {
    const hasOverride = Boolean(
      (document.getElementById("whisperBin") as HTMLInputElement | null)?.value.trim() ||
        (document.getElementById("whisperModelPath") as HTMLInputElement | null)?.value.trim()
    );
    paths.open = hasOverride;
  }
}

async function bootstrapSettings() {
  const hoshi = (window as Window & { hoshi?: SettingsApi }).hoshi;
  const form = document.getElementById("settings-form") as HTMLFormElement;
  const status = document.getElementById("save-status") as HTMLSpanElement;
  if (!hoshi) {
    status.textContent = "preload 未就绪";
    return;
  }

  let lastSettings: FormSettings | null = null;
  const refreshWallpaperPreview = async (): Promise<void> => {
    const preview = document.getElementById("wallpaper-preview");
    if (!preview) {
      return;
    }
    const url = lastSettings?.appearance.wallpaper && hoshi.getWallpaper ? await hoshi.getWallpaper() : "";
    if (!url) {
      preview.classList.add("hidden");
      preview.style.backgroundImage = "";
      return;
    }
    preview.classList.remove("hidden");
    preview.style.backgroundImage = `url("${url}")`;
  };
  const refreshWallpaperHistory = async (): Promise<void> => {
    const list = document.getElementById("wallpaper-history");
    if (!list) {
      return;
    }
    const items = hoshi.getWallpaperHistory ? await hoshi.getWallpaperHistory() : [];
    if (items.length === 0) {
      list.innerHTML = `<p class="memory-empty">暂无历史壁纸</p>`;
      return;
    }
    list.replaceChildren(
      ...items.map((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.wallpaperHistory = item.id;
        button.title = "使用这张";
        button.style.backgroundImage = `url("${item.url}")`;
        return button;
      })
    );
  };
  const fill = (settings: FormSettings): void => {
    lastSettings = settings;
    setText("apiKey", settings.model.apiKey);
    setText("baseUrl", settings.model.baseUrl);
    setText("model", settings.model.model);
    setText("contextBudget", settings.chat.contextBudget);
    setText("compactTriggerToken", settings.chat.compactTriggerToken);
    setText("compactTriggerMsgCount", settings.chat.compactTriggerMsgCount);
    setText("compactKeepRecent", settings.chat.compactKeepRecent);
    setText("referenceSites", settings.chat.referenceSites);
    setText("deepseekApiKey", settings.chat.deepseekApiKey);
    setText("searchBaseUrl", settings.chat.searchBaseUrl);
    setText("searchModel", settings.chat.searchModel);
    const autoWrite = document.getElementById("memoryAutoWrite") as HTMLInputElement | null;
    if (autoWrite) {
      autoWrite.checked = settings.chat.memoryAutoWrite === true;
    }
    setText("typeCharMs", settings.presentation.typeCharMs);
    setText("sentenceGapMs", settings.presentation.sentenceGapMs);
    setText("maxAssistantBubbles", settings.presentation.maxAssistantBubbles);
    setText("fadeDelayMs", settings.presentation.fadeDelayMs);
    setText("panelIdleCloseMs", settings.presentation.panelIdleCloseMs);
    setText("hotwords", settings.voice.hotwords);
    setText("hotwordVocabularyId", settings.voice.hotwordVocabularyId);
    setText("dashscopeApiKey", settings.voice.dashscopeApiKey);
    setText("dashscopeBaseUrl", settings.voice.dashscopeBaseUrl);
    setText("whisperBin", settings.voice.whisperBin);
    setText("whisperModelPath", settings.voice.whisperModelPath);
    const tts = fixTtsPair(settings.voice.ttsModel, settings.voice.ttsVoice);
    setText("ttsModel", tts.model);
    setText("ttsVoice", tts.voice);
    const ttsEnabled = document.getElementById("ttsEnabled") as HTMLInputElement | null;
    if (ttsEnabled) {
      ttsEnabled.checked = settings.voice.ttsEnabled === true;
    }
    setText("gsvBaseUrl", settings.voice.gsvBaseUrl);
    setText("gsvRefAudioPath", settings.voice.gsvRefAudioPath);
    setText("gsvPromptText", settings.voice.gsvPromptText);
    setText("gsvPromptLang", settings.voice.gsvPromptLang);
    setText("gsvGptWeights", settings.voice.gsvGptWeights);
    setText("gsvSovitsWeights", settings.voice.gsvSovitsWeights);
    const screenEnabled = document.getElementById("screenEnabled") as HTMLInputElement | null;
    if (screenEnabled) {
      screenEnabled.checked = settings.screen.enabled === true;
    }
    void refreshWallpaperPreview();
    void refreshWallpaperHistory();
    const asr = settings.voice.asrBackend === "whisper" ? "whisper" : "dashscope";
    const asrRadio = document.querySelector(
      `input[name="asrBackend"][value="${asr}"]`
    ) as HTMLInputElement | null;
    if (asrRadio) {
      asrRadio.checked = true;
    }
    const backend = settings.voice.ttsBackend === "gpt-sovits" ? "gpt-sovits" : "dashscope";
    const radio = document.querySelector(
      `input[name="ttsBackend"][value="${backend}"]`
    ) as HTMLInputElement | null;
    if (radio) {
      radio.checked = true;
    }
    syncVoicePanels();
    setText("kbEmbeddingModel", settings.knowledge.embedding.model);
    setText("kbEmbeddingBaseUrl", settings.knowledge.embedding.baseUrl);
    setText("kbEmbeddingApiKey", settings.knowledge.embedding.apiKey);
    setText("kbTopK", settings.knowledge.search.topK);
    setText("kbMinScore", settings.knowledge.search.minScore);
    setText("kbQueryRewrite", settings.knowledge.search.queryRewrite);
    setText("kbRerankModel", settings.knowledge.rerank.model);
    const kbEnabled = document.getElementById("kbEnabled") as HTMLInputElement | null;
    if (kbEnabled) {
      kbEnabled.checked = settings.knowledge.enabled === true;
    }
    const kbRerankEnabled = document.getElementById("kbRerankEnabled") as HTMLInputElement | null;
    if (kbRerankEnabled) {
      kbRerankEnabled.checked = settings.knowledge.rerank.enabled === true;
    }
  };

  const loadPlugins = async (): Promise<void> => {
    const data = await hoshi.listPlugins();
    renderPlugins(data.plugins);
  };

  const loadMemories = async (): Promise<void> => {
    const listFn = hoshi.listMemories;
    const archivedFn = hoshi.listArchivedMemories;
    if (!listFn) {
      return;
    }
    const active = await listFn.call(hoshi);
    const archived = archivedFn ? await archivedFn.call(hoshi) : { memories: [] };
    renderMemories(active.memories, archived.memories);
  };

  document.querySelectorAll('input[name="ttsBackend"], input[name="asrBackend"]').forEach((input) => {
    input.addEventListener("change", () => {
      syncVoicePanels();
    });
  });

  const downloadWhisperBtn = document.getElementById("download-whisper") as HTMLButtonElement | null;
  const stopWhisperBtn = document.getElementById("stop-whisper") as HTMLButtonElement | null;
  const deleteWhisperBtn = document.getElementById("delete-whisper") as HTMLButtonElement | null;
  const whisperProgress = document.getElementById("whisper-progress") as HTMLProgressElement | null;
  const paintWhisperBar = (loaded: number, total: number): void => {
    if (!whisperProgress || total <= 0) {
      whisperProgress?.classList.add("hidden");
      return;
    }
    whisperProgress.classList.remove("hidden");
    whisperProgress.max = total;
    whisperProgress.value = Math.min(loaded, total);
  };
  const applyWhisperControls = async (): Promise<void> => {
    const cache = await hoshi.whisperModelStatus();
    const hasFile = cache.ready || cache.partialBytes > 0 || cache.residualBytes > 0;
    if (downloadWhisperBtn) {
      downloadWhisperBtn.disabled = cache.downloading || cache.ready;
      downloadWhisperBtn.textContent =
        !cache.ready && cache.partialBytes > 0 ? "继续下载" : "下载 Whisper 模型";
    }
    if (stopWhisperBtn) {
      stopWhisperBtn.disabled = !cache.downloading;
    }
    if (deleteWhisperBtn) {
      deleteWhisperBtn.disabled = cache.downloading || !hasFile;
    }
    if (cache.downloading) {
      paintWhisperBar(cache.loaded || cache.partialBytes, cache.total);
      return;
    }
    if (!cache.ready && cache.partialBytes > 0) {
      paintWhisperBar(cache.partialBytes, cache.total);
      return;
    }
    whisperProgress?.classList.add("hidden");
  };
  hoshi.onWhisperDownloadProgress(({ loaded, total }) => {
    paintWhisperBar(loaded, total);
    if (total > 0) {
      const pct = Math.min(100, Math.floor((loaded / total) * 100));
      status.textContent = `下载 Whisper 模型中 ${pct}%`;
    }
  });
  downloadWhisperBtn?.addEventListener("click", async () => {
    status.textContent = "检查本地模型";
    downloadWhisperBtn.disabled = true;
    if (stopWhisperBtn) {
      stopWhisperBtn.disabled = false;
    }
    if (deleteWhisperBtn) {
      deleteWhisperBtn.disabled = true;
    }
    try {
      const result = await hoshi.downloadWhisperModel();
      if (result.busy) {
        status.textContent = "正在下载";
      } else if (result.stopped) {
        status.textContent = "已停止";
      } else if (result.skipped) {
        status.textContent = "本地已有模型，未下载";
      } else {
        status.textContent = `已保存 ${result.path}`;
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "下载失败";
    } finally {
      await applyWhisperControls();
    }
  });
  stopWhisperBtn?.addEventListener("click", async () => {
    status.textContent = "正在停止";
    try {
      await hoshi.stopWhisperDownload();
      status.textContent = "已停止";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "停止失败";
    } finally {
      await applyWhisperControls();
    }
  });
  deleteWhisperBtn?.addEventListener("click", async () => {
    deleteWhisperBtn.disabled = true;
    status.textContent = "正在删除";
    try {
      const result = await hoshi.deleteWhisperModel();
      status.textContent = result.ok
        ? result.removed > 0
          ? "已删除模型"
          : "没有可删除的文件"
        : "正在下载，无法删除";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "删除失败";
    } finally {
      await applyWhisperControls();
    }
  });
  const testGsvBtn = document.getElementById("test-gsv") as HTMLButtonElement | null;
  if (testGsvBtn) {
    testGsvBtn.addEventListener("click", async () => {
      status.textContent = "测通中";
      try {
        await hoshi.testGsv(text("gsvBaseUrl").trim());
        status.textContent = "GPT-SoVITS 可用";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "测通失败";
      }
    });
  }

  const loadUsage = async (): Promise<void> => {
    if (!hoshi.getUsage) {
      return;
    }
    const data = await hoshi.getUsage();
    renderUsageTotals(document.getElementById("usage-all") as HTMLElement, data.all);
    renderUsageTotals(document.getElementById("usage-today") as HTMLElement, data.today);
    renderUsagePurpose(document.getElementById("usage-purpose") as HTMLElement, data.byPurpose);
    renderUsageSessions(document.getElementById("usage-sessions") as HTMLElement, data.sessions);
  };

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const section = (button as HTMLButtonElement).dataset.section;
      document.querySelectorAll(".nav-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      document.querySelectorAll(".section").forEach((item) => {
        item.classList.toggle("hidden", (item as HTMLElement).dataset.section !== section);
      });
      if (section === "usage") {
        void loadUsage().catch((error) => {
          status.textContent = error instanceof Error ? error.message : "用量读取失败";
        });
      }
    });
  });

  (document.getElementById("open-plugins-dir") as HTMLButtonElement).addEventListener("click", async () => {
    status.textContent = "";
    try {
      await hoshi.openPluginsDir();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "打开失败";
    }
  });

  (document.getElementById("refresh-plugins") as HTMLButtonElement).addEventListener("click", async () => {
    status.textContent = "刷新中";
    try {
      await loadPlugins();
      status.textContent = "已刷新";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "刷新失败";
    }
  });

  (document.getElementById("refresh-usage") as HTMLButtonElement).addEventListener("click", async () => {
    status.textContent = "刷新中";
    try {
      await loadUsage();
      status.textContent = "已刷新";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "用量读取失败";
    }
  });

  const memoryList = document.getElementById("memory-list") as HTMLDivElement | null;
  if (memoryList) {
    memoryList.addEventListener("click", async (event) => {
      const target = event.target as HTMLElement;
      const deleteId = target.dataset.memoryDelete;
      const saveId = target.dataset.memorySave;
      const restoreId = target.dataset.memoryRestore;
      if (!deleteId && !saveId && !restoreId) {
        return;
      }
      status.textContent = "";
      try {
        if (deleteId) {
          await hoshi.deleteMemory(deleteId);
        } else if (restoreId) {
          await hoshi.restoreMemory(restoreId);
        } else if (saveId) {
          const input = document.querySelector(
            `[data-memory-text="${saveId}"]`
          ) as HTMLInputElement | null;
          if (!input) {
            return;
          }
          await hoshi.updateMemory(saveId, input.value);
        }
        await loadMemories();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "操作失败";
      }
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "保存中";
    try {
      const ttsPair = fixTtsPair(text("ttsModel"), text("ttsVoice"));
      const payload: FormSettings = {
        model: {
          apiKey: text("apiKey").trim(),
          baseUrl: text("baseUrl").trim(),
          model: text("model").trim()
        },
        chat: {
          contextBudget: num("contextBudget"),
          compactTriggerToken: num("compactTriggerToken"),
          compactTriggerMsgCount: num("compactTriggerMsgCount"),
          compactKeepRecent: num("compactKeepRecent"),
          referenceSites: text("referenceSites"),
          memoryAutoWrite: checkbox("memoryAutoWrite", lastSettings?.chat.memoryAutoWrite ?? true),
          deepseekApiKey: text("deepseekApiKey").trim(),
          searchBaseUrl: text("searchBaseUrl").trim(),
          searchModel: text("searchModel").trim()
        },
        presentation: {
          typeCharMs: num("typeCharMs"),
          sentenceGapMs: num("sentenceGapMs"),
          maxAssistantBubbles: num("maxAssistantBubbles"),
          fadeDelayMs: num("fadeDelayMs"),
          panelIdleCloseMs: num("panelIdleCloseMs"),
          soundVolume: lastSettings?.presentation.soundVolume ?? 0.8
        },
        plugins: readPluginSettings(lastSettings?.plugins ?? { enabled: [], configs: {} }),
        voice: {
          ttsBackend: readTtsBackend(),
          asrBackend: readAsrBackend(),
          dashscopeApiKey: text("dashscopeApiKey").trim(),
          dashscopeBaseUrl: text("dashscopeBaseUrl").trim(),
          hotwords: text("hotwords"),
          hotwordVocabularyId: text("hotwordVocabularyId").trim(),
          ttsModel: ttsPair.model,
          ttsVoice: ttsPair.voice,
          ttsEnabled: checkbox("ttsEnabled", lastSettings?.voice.ttsEnabled ?? true),
          gsvBaseUrl: text("gsvBaseUrl").trim(),
          gsvRefAudioPath: text("gsvRefAudioPath").trim(),
          gsvPromptText: text("gsvPromptText"),
          gsvPromptLang: text("gsvPromptLang").trim(),
          gsvGptWeights: text("gsvGptWeights").trim(),
          gsvSovitsWeights: text("gsvSovitsWeights").trim(),
          whisperBin: text("whisperBin").trim(),
          whisperModelPath: text("whisperModelPath").trim()
        },
        knowledge: {
          enabled: checkbox("kbEnabled", lastSettings?.knowledge.enabled ?? true),
          embedding: {
            provider: lastSettings?.knowledge.embedding.provider ?? "dashscope",
            baseUrl: text("kbEmbeddingBaseUrl").trim(),
            apiKey: text("kbEmbeddingApiKey").trim(),
            model: text("kbEmbeddingModel").trim()
          },
          search: {
            topK: num("kbTopK"),
            minScore: num("kbMinScore"),
            contextBudgetChars: lastSettings?.knowledge.search.contextBudgetChars ?? 2400,
            queryRewrite: kbQueryRewriteValue()
          },
          rerank: {
            enabled: checkbox("kbRerankEnabled", lastSettings?.knowledge.rerank.enabled ?? false),
            baseUrl: lastSettings?.knowledge.rerank.baseUrl ?? "",
            apiKey: lastSettings?.knowledge.rerank.apiKey ?? "",
            model: text("kbRerankModel").trim() || "gte-rerank-v2"
          }
        },
        screen: {
          enabled: checkbox("screenEnabled", lastSettings?.screen.enabled ?? false)
        },
        appearance: (await hoshi.getSettings()).appearance
      };
      const saved = await hoshi.saveSettings(payload);
      fill({
        ...saved,
        chat: { ...saved.chat, memoryAutoWrite: payload.chat.memoryAutoWrite },
        plugins: payload.plugins,
        voice: { ...saved.voice, ...payload.voice }
      });
      await loadPlugins();
      status.textContent = "已保存";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "保存失败";
    }
  });

  const paintTheme = async (): Promise<void> => {
    const theme = hoshi.getTheme ? await hoshi.getTheme() : null;
    const tokens = theme?.tokens;
    const root = document.documentElement;
    root.style.setProperty("--hoshi-bg", tokens?.bg || "#f4f6fb");
    root.style.setProperty("--hoshi-font", tokens?.font || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    root.style.setProperty("--hoshi-dialog", tokens?.dialog || "#ffffff");
    root.style.setProperty("--hoshi-menu", tokens?.menu || "#ffffff");
    let wallpaper = "";
    if (lastSettings?.appearance.wallpaper && hoshi.getWallpaper) {
      wallpaper = await hoshi.getWallpaper();
    }
    root.style.setProperty("--hoshi-wallpaper", wallpaper ? `url("${wallpaper}")` : "none");
  };
  hoshi.onSettingsUpdated((settings) => {
    lastSettings = settings;
    void loadPlugins().catch(() => undefined);
    void paintTheme();
    void refreshWallpaperPreview();
    void refreshWallpaperHistory();
  });
  bindWallpaper(hoshi, status, () => lastSettings);
  document.getElementById("wallpaper-history")?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const id = target.dataset.wallpaperHistory;
    if (!id || !hoshi.useWallpaperHistory) {
      return;
    }
    void hoshi.useWallpaperHistory(id).then(
      () => {
        status.textContent = "已换成这张背景";
      },
      (error: unknown) => {
        status.textContent = error instanceof Error ? error.message : "换背景失败";
      }
    );
  });
  void paintTheme();

  try {
    fill(await hoshi.getSettings());
    void paintTheme();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "读取设置失败";
  }
  try {
    await applyWhisperControls();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "模型状态读取失败";
  }
  try {
    await loadPlugins();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "插件列表读取失败";
  }
  try {
    await loadMemories();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "记忆列表读取失败";
  }
}

type CropRect = { x: number; y: number; w: number; h: number };
type CropHandle = "new" | "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function bindWallpaper(
  hoshi: SettingsApi,
  status: HTMLSpanElement,
  current: () => FormSettings | null
): void {
  const pick = document.getElementById("wallpaper-pick") as HTMLButtonElement | null;
  const clear = document.getElementById("wallpaper-clear") as HTMLButtonElement | null;
  const file = document.getElementById("wallpaper-file") as HTMLInputElement | null;
  const mask = document.getElementById("crop-mask");
  const image = document.getElementById("crop-image") as HTMLImageElement | null;
  const box = document.getElementById("crop-box") as HTMLDivElement | null;
  const ok = document.getElementById("crop-ok") as HTMLButtonElement | null;
  const cancel = document.getElementById("crop-cancel") as HTMLButtonElement | null;
  if (!pick || !clear || !file || !mask || !image || !box || !ok || !cancel) {
    return;
  }
  let rect: CropRect | null = null;
  let drag: { mode: CropHandle; x: number; y: number; origin: CropRect } | null = null;
  let objectUrl = "";

  const paint = (): void => {
    if (!rect || rect.w < 2 || rect.h < 2) {
      box.hidden = true;
      ok.disabled = true;
      return;
    }
    box.hidden = false;
    ok.disabled = false;
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.w}px`;
    box.style.height = `${rect.h}px`;
  };

  const closeCrop = (): void => {
    mask.classList.add("hidden");
    drag = null;
    rect = null;
    paint();
    image.removeAttribute("src");
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = "";
    }
    file.value = "";
  };

  const point = (event: PointerEvent): { x: number; y: number } => {
    const bounds = image.getBoundingClientRect();
    return {
      x: Math.min(bounds.width, Math.max(0, event.clientX - bounds.left)),
      y: Math.min(bounds.height, Math.max(0, event.clientY - bounds.top))
    };
  };

  const clamp = (next: CropRect): CropRect => {
    const width = image.clientWidth;
    const height = image.clientHeight;
    let x = next.x;
    let y = next.y;
    let w = next.w;
    let h = next.h;
    if (w < 0) {
      x += w;
      w = -w;
    }
    if (h < 0) {
      y += h;
      h = -h;
    }
    x = Math.max(0, Math.min(x, width - 1));
    y = Math.max(0, Math.min(y, height - 1));
    w = Math.max(24, Math.min(w, width - x));
    h = Math.max(24, Math.min(h, height - y));
    return { x, y, w, h };
  };

  const handleAt = (x: number, y: number): CropHandle => {
    if (!rect) {
      return "new";
    }
    const margin = 10;
    const right = rect.x + rect.w;
    const bottom = rect.y + rect.h;
    const nearL = Math.abs(x - rect.x) <= margin;
    const nearR = Math.abs(x - right) <= margin;
    const nearT = Math.abs(y - rect.y) <= margin;
    const nearB = Math.abs(y - bottom) <= margin;
    const inside = x >= rect.x && x <= right && y >= rect.y && y <= bottom;
    if (nearT && nearL) return "nw";
    if (nearT && nearR) return "ne";
    if (nearB && nearL) return "sw";
    if (nearB && nearR) return "se";
    if (nearT && x >= rect.x && x <= right) return "n";
    if (nearB && x >= rect.x && x <= right) return "s";
    if (nearL && y >= rect.y && y <= bottom) return "w";
    if (nearR && y >= rect.y && y <= bottom) return "e";
    return inside ? "move" : "new";
  };

  pick.addEventListener("click", () => {
    file.click();
  });
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    if (!chosen) {
      return;
    }
    if (chosen.size > 12_000_000) {
      status.textContent = "图片太大";
      file.value = "";
      return;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    objectUrl = URL.createObjectURL(chosen);
    rect = null;
    paint();
    image.onload = () => {
      mask.classList.remove("hidden");
    };
    image.src = objectUrl;
  });
  cancel.addEventListener("click", () => {
    closeCrop();
  });
  image.addEventListener("pointerdown", (event) => {
    const at = point(event);
    const mode = handleAt(at.x, at.y);
    const origin = rect ?? { x: at.x, y: at.y, w: 0, h: 0 };
    drag = { mode, x: at.x, y: at.y, origin };
    if (mode === "new") {
      rect = { x: at.x, y: at.y, w: 0, h: 0 };
    }
    image.setPointerCapture(event.pointerId);
  });
  image.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }
    const at = point(event);
    const dx = at.x - drag.x;
    const dy = at.y - drag.y;
    const origin = drag.origin;
    if (drag.mode === "new") {
      rect = clamp({ x: origin.x, y: origin.y, w: at.x - origin.x, h: at.y - origin.y });
    } else if (drag.mode === "move") {
      rect = clamp({ ...origin, x: origin.x + dx, y: origin.y + dy });
    } else {
      let next = { ...origin };
      if (drag.mode.includes("n")) {
        next.y = origin.y + dy;
        next.h = origin.h - dy;
      }
      if (drag.mode.includes("s")) {
        next.h = origin.h + dy;
      }
      if (drag.mode.includes("w")) {
        next.x = origin.x + dx;
        next.w = origin.w - dx;
      }
      if (drag.mode.includes("e")) {
        next.w = origin.w + dx;
      }
      rect = clamp(next);
    }
    paint();
  });
  const endDrag = (): void => {
    drag = null;
    if (rect) {
      rect = clamp(rect);
      paint();
    }
  };
  image.addEventListener("pointerup", endDrag);
  image.addEventListener("pointercancel", endDrag);
  ok.addEventListener("click", () => {
    if (!rect || !hoshi.setWallpaper) {
      status.textContent = "壁纸保存不可用";
      return;
    }
    const scaleX = image.naturalWidth / image.clientWidth;
    const scaleY = image.naturalHeight / image.clientHeight;
    const sx = rect.x * scaleX;
    const sy = rect.y * scaleY;
    const sw = rect.w * scaleX;
    const sh = rect.h * scaleY;
    const maxEdge = 1920;
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      status.textContent = "无法裁剪";
      return;
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    void hoshi.setWallpaper(dataUrl).then(
      () => {
        status.textContent = "背景已更新";
        closeCrop();
      },
      (error: unknown) => {
        status.textContent = error instanceof Error ? error.message : "背景保存失败";
      }
    );
  });
  clear.addEventListener("click", () => {
    if (!current()?.appearance.wallpaper) {
      return;
    }
    if (!hoshi.clearWallpaper) {
      status.textContent = "壁纸保存不可用";
      return;
    }
    void hoshi.clearWallpaper().then(
      () => {
        status.textContent = "已清除背景";
      },
      (error: unknown) => {
        status.textContent = error instanceof Error ? error.message : "清除失败";
      }
    );
  });
}

void bootstrapSettings();
