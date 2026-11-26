import {
  applyChrome,
  backBtn,
  bindIme,
  canvasBoard,
  canvasDeco,
  canvasDelete,
  canvasEd,
  canvasFile,
  canvasImageBtn,
  canvasSave,
  canvasTextBtn,
  createBox,
  createErr,
  createMask,
  currentEl,
  deskAttachBtn,
  deskBoardEl,
  deskChatForm,
  deskFile,
  deskInput,
  deskLiveBtn,
  deskNewBtn,
  deskResetBtn,
  deskStop,
  emptyStateEl,
  galleryEl,
  kbExportBtn,
  kbFile,
  kbFileBtn,
  kbImportForm,
  kbImportText,
  kbImportTitle,
  kbNewBtn,
  kbNewInput,
  kbNewOk,
  kbNewRow,
  kbRefreshBtn,
  kbReindexBtn,
  kbSearchBtn,
  kbSearchInput,
  kbUrlBtn,
  listEl,
  mcpForm,
  mcpFormErr,
  mcpProbeBtn,
  mcpProbeOut,
  mcpRevealBtn,
  newBtn,
  newCancel,
  newIdInput,
  noteEl,
  previewBody,
  previewClose,
  previewMask,
  previewTitle,
  publishBtn,
  s,
  showNote,
  skinDesc,
  skinFilterExt,
  skinFilterExtRow,
  skinFilterName,
  skinFilterNameRow,
  skinForm,
  skinLabel,
  skinMultiple,
  skinMultipleRow,
  skinName,
  skinTitle,
  themeBg,
  themeDesc,
  themeDialog,
  themeEd,
  themeFile,
  themeFont,
  themeMenu,
  themeName,
  themePreviewBtn,
  themeRestoreBtn,
  themeSound,
  themeSoundClear,
  themeSoundFile,
  themeSoundPick,
  themeSoundPreview,
  themeSprites,
  wb as workbenchApi
} from "./ctx.js";
import {
  addDeskFiles,
  loadDeskBoard,
  paintDeskActivity,
  paintDeskSessions,
  refreshDesk,
  sendDeskChat,
  showDeskBoard
} from "./desk.js";
import { exportDb, handleKbFile, importKbUrl, refreshKb, renderKbPanel, runKbSearch } from "./kb.js";
import { parseMcpForm, refreshConnect, runMcpProbe } from "./connect.js";
import { assetExt, fileToB64, nodeId } from "./editorFiles.js";
import { applyThemeSprite, loadThemeEditor, saveThemeEditor, themePreviewTokens, updateSoundPreview } from "./themeEditor.js";
import {
  addCanvasDeco,
  addCanvasText,
  applyCanvasImage,
  deleteSelectedNode,
  loadCanvasEditor,
  saveCanvas,
  selectCanvasNode
} from "./layoutEditor.js";
import { bindShopActions, buildShopCard, buildSkinCard } from "./shopCards.js";
import { EMOTION_KEYS, type LayoutNode, type LiveItem, type PluginTemplateKind, type SandboxEntry } from "./types.js";

const wb = workbenchApi;

async function paintTheme(): Promise<void> {
  if (!wb?.getTheme || !wb.getSettings) return;
  const theme = await wb.getTheme();
  const settings = await wb.getSettings();
  const appearance = (settings as { appearance?: { wallpaper?: boolean } }).appearance;
  const root = document.documentElement;
  root.style.setProperty("--hoshi-bg", theme?.tokens?.bg || "#f4f6fb");
  root.style.setProperty("--bg", theme?.tokens?.bg || "#f4f6fb");
  root.style.setProperty("--hoshi-font", theme?.tokens?.font || '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif');
  root.style.setProperty("--hoshi-dialog", theme?.tokens?.dialog || "#ffffff");
  root.style.setProperty("--hoshi-menu", theme?.tokens?.menu || "#ffffff");
  const wallpaper = appearance?.wallpaper && wb.getWallpaper ? await wb.getWallpaper() : "";
  root.style.setProperty("--hoshi-wallpaper", wallpaper ? `url("${wallpaper}")` : "none");
}

function syncCreateKinds(): void {
  const title = document.getElementById("create-title");
  const kinds = document.getElementById("create-kind");
  if (title) title.textContent = "新建模板";
  if (kinds) kinds.hidden = false;
  const allow = ["theme", "panel", "launcher"];
  let first = "";
  for (const label of Array.from(createBox.querySelectorAll("#create-kind label"))) {
    if (!(label instanceof HTMLLabelElement)) continue;
    const kind = label.dataset.kind ?? "";
    const on = allow.includes(kind);
    label.hidden = !on;
    if (on && !first) first = kind;
  }
  const checked = createBox.querySelector('input[name="new-kind"]:checked') as HTMLInputElement | null;
  if (!checked || checked.closest("label")?.hidden) {
    const next = createBox.querySelector(`input[name="new-kind"][value="${first}"]`) as HTMLInputElement | null;
    if (next) next.checked = true;
  }
}

function applySkinFields(template: PluginTemplateKind): void {
  const panel = template === "panel";
  skinMultipleRow.hidden = !panel;
  skinFilterNameRow.hidden = !panel;
  skinFilterExtRow.hidden = !panel;
}

async function loadSkinForm(id: string): Promise<void> {
  if (!wb) return;
  const data = await wb.readSandboxPluginForm(id);
  skinName.value = data.name;
  skinDesc.value = data.description;
  skinLabel.value = data.label;
  skinTitle.value = data.title;
  skinMultiple.checked = data.multiple;
  const filter = data.filters[0];
  skinFilterName.value = filter?.name ?? "";
  skinFilterExt.value = (filter?.extensions ?? []).join(",");
  applySkinFields(data.template);
  skinForm.hidden = false;
}

function readSkinPatch(): {
  name: string;
  description: string;
  label: string;
  title: string;
  multiple: boolean;
  filters: { name: string; extensions: string[] }[];
} {
  const extensions = skinFilterExt.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    name: skinName.value.trim(),
    description: skinDesc.value.trim(),
    label: skinLabel.value.trim(),
    title: skinTitle.value.trim(),
    multiple: skinMultiple.checked,
    filters: extensions.length || skinFilterName.value.trim()
      ? [{ name: skinFilterName.value.trim() || "文件", extensions }]
      : []
  };
}

async function saveSkinForm(): Promise<void> {
  if (!wb || !s.currentId || s.rail !== "skin") return;
  await wb.patchSandboxPluginForm(s.currentId, readSkinPatch());
}


function setSending(busy: boolean): void {
  s.sending = busy;
  publishBtn.disabled = !s.currentId || busy || s.rail === "shop" || s.rail === "connect" || s.rail === "kb";
}

async function refreshList(): Promise<void> {
  if (!wb) {
    return;
  }
  applyChrome();
  listEl.replaceChildren();
  if (s.rail === "desk") {
    await refreshDesk();
    return;
  }
  if (s.rail === "kb") {
    await refreshKb();
    return;
  }
  if (s.rail === "connect") {
    await refreshConnect();
    return;
  }
  if (s.rail === "shop") {
    const items = await wb.listLivePlugins();
    galleryEl.replaceChildren();
    if (items.length === 0) {
      galleryEl.appendChild(emptyStateEl("🛍️", "还没有上线的模组，先到模板做好再上线"));
      return;
    }
    for (const item of items) {
      galleryEl.appendChild(await buildShopCard(item));
    }
    return;
  }
  if (s.rail === "skin") {
    const allow = new Set(["theme", "panel", "launcher"]);
    const entries = (await wb.listSandboxPlugins()).filter((item) => allow.has(item.template));
    galleryEl.replaceChildren();
    if (entries.length === 0) {
      galleryEl.appendChild(emptyStateEl("🎨", "还没有模板，点「新建」创建主题、播放器或启动器"));
      return;
    }
    for (const entry of entries) {
      galleryEl.appendChild(buildSkinCard(entry));
    }
    return;
  }
}

async function deleteWorkspace(id: string): Promise<void> {
  if (!wb) {
    return;
  }
  try {
    await wb.deleteSandboxPlugin(id);
    if (s.currentId === id) {
      s.currentId = "";
      s.currentTemplate = "";
      s.themePack = null;
      s.layoutNodes = [];
      s.selectedNodeId = "";
      currentEl.textContent = s.rail === "shop" ? "工坊" : s.rail === "skin" ? "模板" : s.rail === "connect" ? "连接" : "未选择";
      skinForm.hidden = true;
      setSending(false);
      applyChrome();
    }
    await refreshList();
  } catch (error) {
    showNote(error instanceof Error ? error.message : "删除失败");
  }
}

async function selectWorkspace(id: string): Promise<void> {
  if (id === s.currentId) {
    return;
  }
  if (!wb || s.sending) {
    return;
  }
  s.currentId = id;
  currentEl.textContent = s.rail === "shop" ? `${id} · 已上线` : `${id} · 草稿`;
  if (s.rail === "shop") {
    await refreshList();
    setSending(false);
    return;
  }
  s.currentTemplate = "";
  try {
    const entries = await wb.listSandboxPlugins();
    s.currentTemplate = entries.find((item) => item.id === id)?.template ?? "";
    if (s.currentTemplate === "theme") {
      await loadThemeEditor(id);
    } else if (s.currentTemplate === "panel" || s.currentTemplate === "launcher") {
      await loadSkinForm(id);
      await loadCanvasEditor(id);
    } else {
      showNote("未知模板");
    }
  } catch (error) {
    showNote(error instanceof Error ? error.message : "读取失败");
  }
  await refreshList();
  setSending(false);
}

bindShopActions({ deleteWorkspace, selectWorkspace });

function openCreate(): void {
  if (s.rail === "shop") return;
  createErr.textContent = "";
  newIdInput.value = "";
  syncCreateKinds();
  createMask.hidden = false;
  newIdInput.focus();
}

function closeCreate(): void {
  createMask.hidden = true;
}

newBtn.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  openCreate();
});

newCancel.addEventListener("click", () => {
  closeCreate();
});

createMask.addEventListener("click", (event) => {
  if (event.target === createMask) {
    closeCreate();
  }
});

createBox.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = newIdInput.value.trim();
  if (!id) {
    createErr.textContent = "填写工作区 id";
    return;
  }
  if (!wb) {
    createErr.textContent = "preload 未就绪";
    return;
  }
  void (async () => {
    try {
      const raw =
        (createBox.querySelector('input[name="new-kind"]:checked') as HTMLInputElement | null)?.value ??
        "theme";
      const kind = raw === "panel" || raw === "launcher" || raw === "theme" ? raw : "theme";
      await wb.createSandboxPlugin(id, kind);
      closeCreate();
      await selectWorkspace(id);
    } catch (error) {
      createErr.textContent = error instanceof Error ? error.message : "新建失败";
    }
  })();
});

publishBtn.addEventListener("click", () => {
  if (!s.currentId || !wb || s.sending || s.rail === "shop") {
    return;
  }
  void (async () => {
    setSending(true);
    try {
      if (s.rail === "skin") {
        if (s.currentTemplate === "theme") {
          await saveThemeEditor();
        } else if (s.currentTemplate === "panel" || s.currentTemplate === "launcher") {
          await saveSkinForm();
          await saveCanvas();
        }
        void wb.previewTheme(null);
      }
      const result = await wb.publishSandboxPlugin(s.currentId);
      if (result.ok) {
        showNote(`已上线 ${result.id}，已在工坊启用。`);
      } else {
        showNote(result.error);
      }
    } catch (error) {
      showNote(error instanceof Error ? error.message : "上线失败");
    } finally {
      setSending(false);
    }
  })();
});

if (wb) {
  bindIme(newIdInput);
  bindIme(deskInput);
  wb.onSettingsUpdated(() => {
    void paintTheme();
    if (s.rail === "shop" || s.rail === "connect") void refreshList();
  });
  mcpRevealBtn.addEventListener("click", () => {
    void wb.revealMcpConfig().catch((error) => {
      showNote(error instanceof Error ? error.message : "无法打开配置");
    });
  });
  mcpProbeBtn.addEventListener("click", () => {
    const server = parseMcpForm();
    if (!server.name || !server.command) {
      mcpFormErr.textContent = "填写 id 与 command";
      return;
    }
    mcpFormErr.textContent = "";
    void runMcpProbe(server);
  });
  mcpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const server = parseMcpForm();
    if (!server.name || !server.command) {
      mcpFormErr.textContent = "填写 id 与 command";
      return;
    }
    mcpFormErr.textContent = "";
    void (async () => {
      const result = await wb.upsertMcpServer(server);
      mcpProbeOut.hidden = false;
      if (result.ok && result.server) {
        mcpProbeOut.textContent = `已连接\n${result.server.toolNames.join("\n") || "（无工具）"}`;
      } else {
        mcpProbeOut.textContent = `连接失败\n${result.server?.lastError || "未知错误"}`;
      }
      await refreshConnect();
    })().catch((error) => {
      mcpFormErr.textContent = error instanceof Error ? error.message : "连接失败";
    });
  });
  for (const btn of Array.from(document.querySelectorAll("[data-rail]"))) {
    btn.addEventListener("click", () => {
      const next = (btn as HTMLButtonElement).dataset.rail;
      if (
        next !== "desk" &&
        next !== "skin" &&
        next !== "shop" &&
        next !== "connect" &&
        next !== "kb"
      )
        return;
      if (next === s.rail) return;
      void (async () => {
        s.rail = next;
        document.querySelectorAll("[data-rail]").forEach((node) => {
          node.classList.toggle("active", (node as HTMLElement).dataset.rail === s.rail);
        });
        s.currentId = "";
        s.currentTemplate = "";
        s.themePack = null;
        s.layoutNodes = [];
        s.selectedNodeId = "";
        currentEl.textContent =
          next === "shop"
            ? "工坊"
            : next === "skin"
              ? "模板"
              : next === "kb"
                ? "知识库"
                : next === "desk"
                  ? "共享画布"
                  : "连接";
        void wb?.previewTheme(null);
        applyChrome();
        setSending(false);
        await refreshList();
      })();
    });
  }
  skinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveSkinForm().catch((error) => {
      showNote(error instanceof Error ? error.message : "保存失败");
    });
  });
  themeEd.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveThemeEditor().catch((error) => {
      showNote(error instanceof Error ? error.message : "保存失败");
    });
  });
  themeFile.addEventListener("change", () => {
    const file = themeFile.files?.[0];
    if (file) void applyThemeSprite(file);
  });
  themeSoundPick.addEventListener("click", () => {
    themeSoundFile.value = "";
    themeSoundFile.click();
  });
  themeSoundClear.addEventListener("click", () => {
    themeSound.value = "";
    updateSoundPreview();
  });
  themePreviewBtn.addEventListener("click", () => {
    void wb?.previewTheme(themePreviewTokens());
  });
  themeRestoreBtn.addEventListener("click", () => {
    void wb?.previewTheme(null);
  });
  themeSoundFile.addEventListener("change", () => {
    const file = themeSoundFile.files?.[0];
    if (!file || !wb || !s.currentId) return;
    void (async () => {
      try {
        const rel = `sound/${nodeId("snd")}${assetExt(file.name) || ".mp3"}`;
        const b64 = await fileToB64(file);
        await wb.uploadSandboxAsset(s.currentId, rel, b64);
        themeSound.value = rel;
        updateSoundPreview();
      } catch (error) {
        showNote(error instanceof Error ? error.message : "上传失败");
      }
    })();
  });
  canvasTextBtn.addEventListener("click", () => {
    addCanvasText();
  });
  canvasImageBtn.addEventListener("click", () => {
    canvasFile.value = "";
    canvasFile.click();
  });
  canvasDeco.addEventListener("click", () => {
    addCanvasDeco();
  });
  canvasDelete.addEventListener("click", () => {
    deleteSelectedNode();
  });
  canvasSave.addEventListener("click", () => {
    void saveCanvas().catch((error) => {
      showNote(error instanceof Error ? error.message : "保存失败");
    });
  });
  canvasFile.addEventListener("change", () => {
    const file = canvasFile.files?.[0];
    if (file) void applyCanvasImage(file);
  });
  canvasBoard.addEventListener("pointerdown", (event) => {
    if (event.target === canvasBoard) {
      selectCanvasNode("");
    }
  });
  window.addEventListener("keydown", (event) => {
    if ((event.key === "Delete" || event.key === "Backspace") && !canvasEd.hidden && s.selectedNodeId) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      deleteSelectedNode();
    }
  });
  backBtn.addEventListener("click", () => {
    s.currentId = "";
    s.currentTemplate = "";
    s.themePack = null;
    s.layoutNodes = [];
    s.selectedNodeId = "";
    currentEl.textContent = "模板";
    void wb?.previewTheme(null);
    applyChrome();
    void refreshList();
  });
  previewClose.addEventListener("click", () => {
    previewMask.hidden = true;
    previewBody.replaceChildren();
  });
  previewMask.addEventListener("click", (event) => {
    if (event.target === previewMask) {
      previewMask.hidden = true;
      previewBody.replaceChildren();
    }
  });
  kbNewBtn.addEventListener("click", () => {
    kbNewRow.hidden = false;
    kbNewInput.value = "";
    kbNewInput.focus();
  });
  const createKb = async (): Promise<void> => {
    const name = kbNewInput.value.trim();
    if (!name || !wb) return;
    kbNewRow.hidden = true;
    try {
      await wb.createKbCollection(name);
      await refreshKb();
    } catch (error) {
      showNote(error instanceof Error ? error.message : "创建失败");
    }
  };
  kbNewOk.addEventListener("click", () => {
    void createKb();
  });
  kbNewInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void createKb();
    }
  });
  kbRefreshBtn.addEventListener("click", () => {
    void refreshKb();
  });
  kbReindexBtn.addEventListener("click", () => {
    if (!wb) return;
    void (async () => {
      try {
        const { chunks } = await wb.reindexKb();
        showNote(`已重建 ${chunks} 个分块的索引`);
      } catch (error) {
        showNote(error instanceof Error ? error.message : "重建失败");
      }
    })();
  });
  kbFileBtn.addEventListener("click", () => {
    kbFile.value = "";
    kbFile.click();
  });
  kbFile.addEventListener("change", () => {
    const file = kbFile.files?.[0];
    if (file) void handleKbFile(file);
  });
  kbUrlBtn.addEventListener("click", () => {
    void importKbUrl();
  });
  kbExportBtn.addEventListener("click", () => {
    void exportDb();
  });
  kbImportForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!wb || !s.kbCollectionId) return;
    const title = kbImportTitle.value.trim();
    const text = kbImportText.value.trim();
    if (!text) return;
    void (async () => {
      try {
        const result = await wb.importKbDocument(s.kbCollectionId, { title: title || "未命名文档", text, sourceName: s.kbSourceName });
        s.kbSourceName = "";
        kbImportText.value = "";
        kbImportTitle.value = "";
        if (result.action === "skipped") {
          showNote("内容未变化，已跳过（去重）");
        } else if (result.action === "updated") {
          showNote("已覆盖更新，后台重新处理中");
        } else {
          showNote("已导入，后台处理中");
        }
        window.setTimeout(() => {
          void renderKbPanel();
        }, 1500);
      } catch (error) {
        showNote(error instanceof Error ? error.message : "导入失败");
      }
    })();
  });
  kbSearchBtn.addEventListener("click", () => {
    void runKbSearch();
  });
  kbSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void runKbSearch();
    }
  });
  deskNewBtn.addEventListener("click", () => {
    void (async () => {
      const created = await wb.createSession("新会话", "desk");
      s.deskSessionId = created.id;
      await refreshDesk();
    })();
  });
  deskResetBtn.addEventListener("click", () => {
    void (async () => {
      const created = await wb.createSession("新会话", "desk");
      s.deskSessionId = created.id;
      s.deskViewingTurnId = null;
      s.deskTurns = [];
      paintDeskActivity();
      s.deskSessions = await wb.listSessions("desk");
      paintDeskSessions();
      currentEl.textContent = created.title || "共享画布";
      await loadDeskBoard();
    })();
  });
  deskLiveBtn.addEventListener("click", () => {
    s.deskViewingTurnId = null;
    showDeskBoard(s.deskLiveItems, false);
    paintDeskActivity();
  });
  deskAttachBtn.addEventListener("click", () => {
    deskFile.click();
  });
  deskFile.addEventListener("change", () => {
    if (deskFile.files) void addDeskFiles(deskFile.files);
    deskFile.value = "";
  });
  deskInput.addEventListener("paste", (event) => {
    const files = event.clipboardData?.files;
    if (files && files.length) {
      event.preventDefault();
      void addDeskFiles(files);
    }
  });
  deskBoardEl.addEventListener("paste", (event) => {
    const files = event.clipboardData?.files;
    if (files && files.length) {
      event.preventDefault();
      void addDeskFiles(files);
    }
  });
  const bindFileDrop = (target: HTMLElement): void => {
    let depth = 0;
    const hasFiles = (drag: DragEvent): boolean => Boolean(drag.dataTransfer?.types.includes("Files"));
    const clear = (): void => {
      depth = 0;
      target.classList.remove("is-file-drop");
    };
    target.addEventListener("dragenter", (event) => {
      const drag = event as DragEvent;
      if (!hasFiles(drag)) {
        return;
      }
      drag.preventDefault();
      depth += 1;
      target.classList.add("is-file-drop");
    });
    target.addEventListener("dragover", (event) => {
      const drag = event as DragEvent;
      if (!hasFiles(drag)) {
        return;
      }
      drag.preventDefault();
      if (drag.dataTransfer) {
        drag.dataTransfer.dropEffect = "copy";
      }
      target.classList.add("is-file-drop");
    });
    target.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        target.classList.remove("is-file-drop");
      }
    });
    target.addEventListener("drop", (event) => {
      const drag = event as DragEvent;
      const files = drag.dataTransfer?.files;
      clear();
      if (!files || files.length === 0) {
        return;
      }
      drag.preventDefault();
      void addDeskFiles(files);
    });
    window.addEventListener("dragend", clear);
  };
  bindFileDrop(deskChatForm);
  bindFileDrop(deskBoardEl);
  deskChatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendDeskChat();
  });
  deskStop.addEventListener("click", () => {
    wb?.abortChat();
  });
  void paintTheme();
  void refreshList();
}
setSending(false);
