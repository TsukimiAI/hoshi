"use strict";
function num(id) {
    const value = Number(document.getElementById(id).value);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}
function text(id) {
    return document.getElementById(id).value;
}
function fixTtsPair(model, voice) {
    let nextModel = model.trim();
    let nextVoice = voice.trim();
    const looksVoice = (value) => /^(long|loong)/i.test(value) && !value.includes("cosyvoice");
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
function setText(id, value) {
    document.getElementById(id).value = String(value);
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function renderUsageTotals(el, totals) {
    el.innerHTML = `
    <div class="usage-card"><span>输入</span><strong>${totals.promptTokens}</strong></div>
    <div class="usage-card"><span>输出</span><strong>${totals.completionTokens}</strong></div>
    <div class="usage-card"><span>缓存</span><strong>${totals.cachedTokens}</strong></div>
    <div class="usage-card"><span>合计</span><strong>${totals.totalTokens}</strong></div>
    <div class="usage-card"><span>轮次</span><strong>${totals.turns}</strong></div>
  `;
}
function renderUsageSessions(el, sessions) {
    if (sessions.length === 0) {
        el.innerHTML = `<p class="field-hint">暂无用量记录</p>`;
        return;
    }
    el.innerHTML = sessions
        .map((item) => `<div class="usage-session"><span class="usage-session-title">${escapeHtml(item.title)}</span><span>↑${item.promptTokens} ↓${item.completionTokens} · ${item.totalTokens}</span></div>`)
        .join("");
}
function usagePurposeLabel(purpose) {
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
function renderUsagePurpose(el, byPurpose) {
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
function memoryKindLabel(kind) {
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
function renderMemories(memories, archived) {
    const list = document.getElementById("memory-list");
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
            .map((item) => `<article class="memory-card" data-memory-id="${escapeHtml(item.id)}">
        <div class="memory-card-body">
          <div class="memory-kind">${escapeHtml(memoryKindLabel(item.kind))}</div>
          <input data-memory-text="${escapeHtml(item.id)}" value="${escapeHtml(item.text)}" />
        </div>
        <div class="memory-card-actions">
          <button type="button" data-memory-save="${escapeHtml(item.id)}">保存</button>
          <button type="button" data-memory-delete="${escapeHtml(item.id)}">删除</button>
        </div>
      </article>`)
            .join("");
        return `<h2 class="memory-group">${escapeHtml(memoryKindLabel(kind))}</h2>${cards}`;
    })
        .join("");
    const archivedHtml = archived.length === 0
        ? ""
        : `<h2 class="memory-group">已删除</h2>${archived
            .map((item) => `<article class="memory-card" data-memory-id="${escapeHtml(item.id)}">
        <div class="memory-card-body">
          <p>${escapeHtml(item.text)}</p>
        </div>
        <div class="memory-card-actions">
          <button type="button" data-memory-restore="${escapeHtml(item.id)}">恢复</button>
        </div>
      </article>`)
            .join("")}`;
    list.innerHTML = `${activeHtml}${archivedHtml}`;
}
function renderPlugins(plugins) {
    const list = document.getElementById("plugin-list");
    list.innerHTML = plugins
        .map((plugin) => {
        const source = plugin.source === "builtin" ? "内置" : "本地";
        const fieldId = plugin.error ? plugin.key : plugin.id;
        const fields = plugin.enabled && plugin.settingsFields.length > 0
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
function checkbox(id, fallback) {
    const el = document.getElementById(id);
    return el ? el.checked : fallback;
}
function readPluginSettings(fallback) {
    const boxes = document.querySelectorAll("[data-plugin-enable]");
    if (boxes.length === 0) {
        return fallback;
    }
    const enabled = [];
    boxes.forEach((input) => {
        const checkboxEl = input;
        if (checkboxEl.checked && checkboxEl.dataset.pluginEnable) {
            enabled.push(checkboxEl.dataset.pluginEnable);
        }
    });
    const configs = {};
    document.querySelectorAll("[data-plugin-id][data-field-key]").forEach((node) => {
        const el = node;
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
function readTtsBackend() {
    const checked = document.querySelector('input[name="ttsBackend"]:checked');
    return checked?.value === "gpt-sovits" ? "gpt-sovits" : "dashscope";
}
function readAsrBackend() {
    const checked = document.querySelector('input[name="asrBackend"]:checked');
    return checked?.value === "whisper" ? "whisper" : "dashscope";
}
function syncVoicePanels() {
    const gsv = readTtsBackend() === "gpt-sovits";
    document.getElementById("dashscope-fields")?.classList.toggle("hidden", gsv);
    document.getElementById("gsv-fields")?.classList.toggle("hidden", !gsv);
    document.getElementById("whisper-fields")?.classList.toggle("hidden", readAsrBackend() !== "whisper");
    const paths = document.getElementById("whisper-paths");
    if (paths) {
        const hasOverride = Boolean(document.getElementById("whisperBin")?.value.trim() ||
            document.getElementById("whisperModelPath")?.value.trim());
        paths.open = hasOverride;
    }
}
async function bootstrapSettings() {
    const hoshi = window.hoshi;
    const form = document.getElementById("settings-form");
    const status = document.getElementById("save-status");
    if (!hoshi) {
        status.textContent = "preload 未就绪";
        return;
    }
    let lastSettings = null;
    const fill = (settings) => {
        lastSettings = settings;
        setText("apiKey", settings.model.apiKey);
        setText("baseUrl", settings.model.baseUrl);
        setText("model", settings.model.model);
        setText("contextBudget", settings.chat.contextBudget);
        setText("compactTriggerToken", settings.chat.compactTriggerToken);
        setText("compactTriggerMsgCount", settings.chat.compactTriggerMsgCount);
        setText("compactKeepRecent", settings.chat.compactKeepRecent);
        setText("referenceSites", settings.chat.referenceSites);
        const autoWrite = document.getElementById("memoryAutoWrite");
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
        const ttsEnabled = document.getElementById("ttsEnabled");
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
        const asrRadio = document.querySelector(`input[name="asrBackend"][value="${asr}"]`);
        if (asrRadio) {
            asrRadio.checked = true;
        }
        const backend = settings.voice.ttsBackend === "gpt-sovits" ? "gpt-sovits" : "dashscope";
        const radio = document.querySelector(`input[name="ttsBackend"][value="${backend}"]`);
        if (radio) {
            radio.checked = true;
        }
        syncVoicePanels();
    };
    const loadPlugins = async () => {
        const data = await hoshi.listPlugins();
        renderPlugins(data.plugins);
    };
    const loadMemories = async () => {
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
    const downloadWhisperBtn = document.getElementById("download-whisper");
    if (downloadWhisperBtn) {
        downloadWhisperBtn.addEventListener("click", async () => {
            status.textContent = "下载 Whisper 模型中";
            try {
                const result = await hoshi.downloadWhisperModel();
                status.textContent = `已保存 ${result.path}`;
            }
            catch (error) {
                status.textContent = error instanceof Error ? error.message : "下载失败";
            }
        });
    }
    const testGsvBtn = document.getElementById("test-gsv");
    if (testGsvBtn) {
        testGsvBtn.addEventListener("click", async () => {
            status.textContent = "测通中";
            try {
                await hoshi.testGsv(text("gsvBaseUrl").trim());
                status.textContent = "GPT-SoVITS 可用";
            }
            catch (error) {
                status.textContent = error instanceof Error ? error.message : "测通失败";
            }
        });
    }
    const loadUsage = async () => {
        if (!hoshi.getUsage) {
            return;
        }
        const data = await hoshi.getUsage();
        renderUsageTotals(document.getElementById("usage-all"), data.all);
        renderUsageTotals(document.getElementById("usage-today"), data.today);
        renderUsagePurpose(document.getElementById("usage-purpose"), data.byPurpose);
        renderUsageSessions(document.getElementById("usage-sessions"), data.sessions);
    };
    document.querySelectorAll(".nav-btn").forEach((button) => {
        button.addEventListener("click", () => {
            const section = button.dataset.section;
            document.querySelectorAll(".nav-btn").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            document.querySelectorAll(".section").forEach((item) => {
                item.classList.toggle("hidden", item.dataset.section !== section);
            });
            if (section === "usage") {
                void loadUsage().catch((error) => {
                    status.textContent = error instanceof Error ? error.message : "用量读取失败";
                });
            }
        });
    });
    document.getElementById("open-plugins-dir").addEventListener("click", async () => {
        status.textContent = "";
        try {
            await hoshi.openPluginsDir();
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : "打开失败";
        }
    });
    document.getElementById("refresh-plugins").addEventListener("click", async () => {
        status.textContent = "刷新中";
        try {
            await loadPlugins();
            status.textContent = "已刷新";
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : "刷新失败";
        }
    });
    document.getElementById("refresh-usage").addEventListener("click", async () => {
        status.textContent = "刷新中";
        try {
            await loadUsage();
            status.textContent = "已刷新";
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : "用量读取失败";
        }
    });
    const memoryList = document.getElementById("memory-list");
    if (memoryList) {
        memoryList.addEventListener("click", async (event) => {
            const target = event.target;
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
                }
                else if (restoreId) {
                    await hoshi.restoreMemory(restoreId);
                }
                else if (saveId) {
                    const input = document.querySelector(`[data-memory-text="${saveId}"]`);
                    if (!input) {
                        return;
                    }
                    await hoshi.updateMemory(saveId, input.value);
                }
                await loadMemories();
            }
            catch (error) {
                status.textContent = error instanceof Error ? error.message : "操作失败";
            }
        });
    }
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        status.textContent = "保存中";
        try {
            const ttsPair = fixTtsPair(text("ttsModel"), text("ttsVoice"));
            const payload = {
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
                    memoryAutoWrite: checkbox("memoryAutoWrite", lastSettings?.chat.memoryAutoWrite ?? true)
                },
                presentation: {
                    typeCharMs: num("typeCharMs"),
                    sentenceGapMs: num("sentenceGapMs"),
                    maxAssistantBubbles: num("maxAssistantBubbles"),
                    fadeDelayMs: num("fadeDelayMs"),
                    panelIdleCloseMs: num("panelIdleCloseMs")
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
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : "保存失败";
        }
    });
    try {
        fill(await hoshi.getSettings());
    }
    catch (error) {
        status.textContent = error instanceof Error ? error.message : "读取设置失败";
    }
    try {
        await loadPlugins();
    }
    catch (error) {
        status.textContent = error instanceof Error ? error.message : "插件列表读取失败";
    }
    try {
        await loadMemories();
    }
    catch (error) {
        status.textContent = error instanceof Error ? error.message : "记忆列表读取失败";
    }
}
void bootstrapSettings();
