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
  downloadWhisperModel: () => Promise<{ ok: true; path: string }>;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderUsageTotals(el: HTMLElement, totals: UsageTotals): void {
  el.innerHTML = `
    <div class="usage-card"><span>输入</span><strong>${totals.promptTokens}</strong></div>
    <div class="usage-card"><span>输出</span><strong>${totals.completionTokens}</strong></div>
    <div class="usage-card"><span>缓存</span><strong>${totals.cachedTokens}</strong></div>
    <div class="usage-card"><span>合计</span><strong>${totals.totalTokens}</strong></div>
    <div class="usage-card"><span>轮次</span><strong>${totals.turns}</strong></div>
  `;
}

function renderUsageSessions(el: HTMLElement, sessions: UsageSummary["sessions"]): void {
  if (sessions.length === 0) {
    el.innerHTML = `<p class="field-hint">暂无用量记录</p>`;
    return;
  }
  el.innerHTML = sessions
    .map(
      (item) =>
        `<div class="usage-session"><span class="usage-session-title">${escapeHtml(item.title)}</span><span>↑${item.promptTokens} ↓${item.completionTokens} · ${item.totalTokens}</span></div>`
    )
    .join("");
}

function usagePurposeLabel(purpose: string): string {
  if (purpose === "chat") {
    return "对话";
  }
  if (purpose === "tool") {
    return "工具";
  }
  if (purpose === "compact") {
    return "压缩";
  }
  if (purpose === "extract") {
    return "记忆";
  }
  if (purpose === "asr") {
    return "ASR";
  }
  return purpose;
}

function renderUsagePurpose(
  el: HTMLElement,
  byPurpose: UsageSummary["byPurpose"] | undefined
): void {
  const order = ["chat", "tool", "compact", "extract", "asr"];
  if (!byPurpose) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = order
    .map((purpose) => {
      const item = byPurpose[purpose];
      const all = item?.all;
      if (!all) {
        return "";
      }
      return `<div class="usage-session"><span class="usage-session-title">${usagePurposeLabel(purpose)}</span><span>↑${all.promptTokens} ↓${all.completionTokens} · ${all.totalTokens}（今日 ${item.today.totalTokens}）</span></div>`;
    })
    .join("");
}

function memoryKindLabel(kind: string): string {
  if (kind === "identity") {
    return "身份";
  }
  if (kind === "preference") {
    return "偏好";
  }
  if (kind === "habit") {
    return "习惯";
  }
  if (kind === "agreement") {
    return "约定";
  }
  return "其他";
}

function renderMemories(memories: MemoryItem[], archived: MemoryItem[]): void {
  const list = document.getElementById("memory-list") as HTMLDivElement;
  if (memories.length === 0 && archived.length === 0) {
    list.innerHTML = `<p class="memory-empty">暂无长期记忆</p>`;
    return;
  }
  const groups = ["identity", "agreement", "preference", "habit", "other"];
  const activeHtml = groups
    .map((kind) => {
      const items = memories.filter((item) => item.kind === kind);
      if (items.length === 0) {
        return "";
      }
      const cards = items
        .map(
          (item) => {
            const source = item.meta?.source === "knowledge" && item.meta.documentTitle
              ? `<div class="memory-source">📄 来自《${escapeHtml(item.meta.documentTitle)}》</div>`
              : "";
            return `<article class="memory-card" data-memory-id="${escapeHtml(item.id)}">
        <div class="memory-card-body">
          <div class="memory-kind">${escapeHtml(memoryKindLabel(item.kind))}</div>
          <input data-memory-text="${escapeHtml(item.id)}" value="${escapeHtml(item.text)}" />
          ${source}
        </div>
        <div class="memory-card-actions">
          <button type="button" data-memory-save="${escapeHtml(item.id)}">保存</button>
          <button type="button" data-memory-delete="${escapeHtml(item.id)}">删除</button>
        </div>
      </article>`;
          }
        )
        .join("");
      return `<h2 class="memory-group">${escapeHtml(memoryKindLabel(kind))}</h2>${cards}`;
    })
    .join("");
  const archivedHtml =
    archived.length === 0
      ? ""
      : `<h2 class="memory-group">已删除</h2>${archived
          .map(
            (item) => `<article class="memory-card" data-memory-id="${escapeHtml(item.id)}">
        <div class="memory-card-body">
          <p>${escapeHtml(item.text)}</p>
        </div>
        <div class="memory-card-actions">
          <button type="button" data-memory-restore="${escapeHtml(item.id)}">恢复</button>
        </div>
      </article>`
          )
          .join("")}`;
  list.innerHTML = `${activeHtml}${archivedHtml}`;
}

function renderPlugins(plugins: PluginMarketItem[]): void {
  const list = document.getElementById("plugin-list") as HTMLDivElement;
  list.innerHTML = plugins
    .map((plugin) => {
      const source = plugin.source === "builtin" ? "内置" : "本地";
      const fieldId = plugin.error ? plugin.key : plugin.id;
      const fields =
        plugin.enabled && plugin.settingsFields.length > 0
          ? plugin.settingsFields
              .map((field) => {
                const value = escapeHtml(plugin.config[field.key] ?? "");
                const placeholder = field.placeholder
                  ? ` placeholder="${escapeHtml(field.placeholder)}"`
                  : "";
                if (field.type === "textarea") {
                  return `<label>${escapeHtml(field.label)}<textarea data-plugin-id="${escapeHtml(fieldId)}" data-field-key="${escapeHtml(field.key)}">${value}</textarea></label>`;
                }
                const inputType = field.type === "password" ? "password" : "text";
                return `<label>${escapeHtml(field.label)}<input type="${inputType}" data-plugin-id="${escapeHtml(fieldId)}" data-field-key="${escapeHtml(field.key)}" value="${value}"${placeholder} /></label>`;
              })
              .join("")
          : "";
      const error = plugin.error ? `<p class="plugin-error">${escapeHtml(plugin.error)}</p>` : "";
      const disabled = plugin.error ? " disabled" : "";
      const checked = plugin.enabled ? " checked" : "";
      return `<article class="plugin-card" data-plugin-key="${escapeHtml(plugin.key)}">
        <div class="plugin-card-head">
          <div>
            <h2>${escapeHtml(plugin.name)}</h2>
            <div class="plugin-meta">${source} · ${escapeHtml(plugin.version)}</div>
            <p class="plugin-desc">${escapeHtml(plugin.description)}</p>
            ${error}
          </div>
          <label class="plugin-toggle"><input type="checkbox" data-plugin-enable="${escapeHtml(plugin.id)}"${checked}${disabled} />启用</label>
        </div>
        <div class="plugin-fields">${fields}</div>
      </article>`;
    })
    .join("");
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
  if (downloadWhisperBtn) {
    downloadWhisperBtn.addEventListener("click", async () => {
      status.textContent = "下载 Whisper 模型中";
      try {
        const result = await hoshi.downloadWhisperModel();
        status.textContent = `已保存 ${result.path}`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "下载失败";
      }
    });
  }
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
          deepseekApiKey: text("deepseekApiKey").trim()
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
        }
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
    if (!hoshi.getTheme) return;
    const theme = await hoshi.getTheme();
    const tokens = theme?.tokens;
    const root = document.documentElement;
    root.style.setProperty("--hoshi-bg", tokens?.bg || "#f4f6fb");
    root.style.setProperty("--hoshi-font", tokens?.font || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
    root.style.setProperty("--hoshi-dialog", tokens?.dialog || "#ffffff");
    root.style.setProperty("--hoshi-menu", tokens?.menu || "#ffffff");
  };
  hoshi.onSettingsUpdated((settings) => {
    lastSettings = settings;
    void loadPlugins().catch(() => undefined);
    void paintTheme();
  });
  void paintTheme();

  try {
    fill(await hoshi.getSettings());
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "读取设置失败";
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

void bootstrapSettings();
