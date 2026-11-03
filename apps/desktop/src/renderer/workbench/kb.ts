import type { KbDocument, KbTraceHit, PdfTextItem } from "./types.js";
import {
  emptyStateEl,
  kbCapHint,
  kbCollectionName,
  kbDocList,
  kbImportForm,
  kbImportText,
  kbImportTitle,
  kbSearchBtn,
  kbSearchInput,
  kbSearchResults,
  kbStatus,
  kbUrl,
  listEl,
  noteEl,
  s,
  showNote,
  wb as workbenchApi
} from "./ctx.js";

const wb = workbenchApi;

type PdfLayout = { reconstructPdfPage: (items: PdfTextItem[]) => string };
const reconstructPdfPage = (globalThis as unknown as { hoshiPdfLayout?: PdfLayout }).hoshiPdfLayout
  ?.reconstructPdfPage;

function kbStatusLabel(status: string): string {
  const map: Record<string, string> = {
    parsing: "解析中",
    chunking: "分块中",
    embedding: "嵌入中",
    ready: "就绪",
    failed: "失败",
    disabled: "已禁用"
  };
  return map[status] ?? status;
}

function renderKbSidebar(): void {
  listEl.replaceChildren();
  for (const collection of s.kbCollections) {
    const li = document.createElement("li");
    if (collection.id === s.kbCollectionId) {
      li.className = "active";
    }
    li.dataset.id = collection.id;
    const row = document.createElement("div");
    row.className = "ws-row";
    const name = document.createElement("span");
    name.className = "ws-name";
    name.textContent = `${collection.name} · ${collection.documentCount}`;
    if (!collection.enabled) {
      name.style.opacity = "0.55";
      name.style.textDecoration = "line-through";
    }
    name.addEventListener("click", () => {
      s.kbCollectionId = collection.id;
      void renderKbPanel();
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "item-del";
    toggle.textContent = collection.enabled ? "停用" : "启用";
    toggle.title = collection.enabled ? "停用该知识库（检索时忽略）" : "启用该知识库";
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        if (!wb) {
          return;
        }
        try {
          await wb.patchKbCollection(collection.id, { enabled: !collection.enabled });
          await refreshKb();
        } catch (error) {
          showNote(error instanceof Error ? error.message : "操作失败");
        }
      })();
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "item-del";
    del.textContent = "×";
    del.title = "删除知识库";
    del.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void deleteKbCollection(collection.id);
    });
    row.append(name, toggle, del);
    li.appendChild(row);
    listEl.appendChild(li);
  }
  if (s.kbCollections.length === 0) {
    listEl.replaceChildren(emptyStateEl("📚", "还没有知识库，点「＋ 新建」开始"));
  }
}

export async function refreshKb(): Promise<void> {
  if (!wb) {
    return;
  }
  try {
    const data = await wb.listKbCollections();
    s.kbCollections = data.collections;
    if (!s.kbCollections.some((c) => c.id === s.kbCollectionId)) {
      s.kbCollectionId = s.kbCollections[0]?.id ?? "";
    }
    renderKbSidebar();
    const cap = data.capabilities;
    kbCapHint.hidden = cap.vectorAvailable && cap.embeddingDim > 0;
    if (!cap.vectorAvailable) {
      kbCapHint.textContent = "向量扩展加载失败：语义检索不可用（关键词检索仍可用）。";
    } else if (cap.embeddingDim === 0) {
      kbCapHint.textContent = "尚未建立向量索引，导入文档后自动创建。";
    }
    if (cap.pendingJobs > 0) {
      kbStatus.textContent = `${cap.pendingJobs} 个文档处理中…`;
      window.setTimeout(() => {
        if (s.rail === "kb") {
          void refreshKb();
        }
      }, 1500);
    } else {
      kbStatus.textContent = "";
    }
    await renderKbPanel();
  } catch (error) {
    showNote(error instanceof Error ? error.message : "知识库加载失败");
  }
}

export async function renderKbPanel(): Promise<void> {
  kbCollectionName.textContent =
    s.kbCollections.find((c) => c.id === s.kbCollectionId)?.name ?? "未选择知识库";
  kbImportForm.hidden = !s.kbCollectionId;
  kbSearchInput.disabled = !s.kbCollectionId;
  kbSearchBtn.disabled = !s.kbCollectionId;
  kbDocList.replaceChildren();
  if (!s.kbCollectionId || !wb) {
    kbDocList.replaceChildren(emptyStateEl("📚", "还没有知识库：点左侧「＋ 新建」创建后，即可导入文档与测试检索"));
    return;
  }
  const data = await wb.listKbDocuments(s.kbCollectionId);
  s.kbDocuments = data.documents;
  if (s.kbDocuments.length === 0) {
    kbDocList.replaceChildren(emptyStateEl("📄", "还没有文档，粘贴文本导入"));
    return;
  }
  for (const doc of s.kbDocuments) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "kb-doc-meta";
    const title = document.createElement("span");
    title.className = "kb-doc-title";
    title.textContent = doc.title;
    const sub = document.createElement("span");
    sub.className = "kb-doc-sub";
    sub.textContent = `${doc.chunkCount} 块 · ${kbStatusLabel(doc.status)}${doc.error ? " · " + doc.error : ""}`;
    meta.append(title, sub);
    const badge = document.createElement("span");
    badge.className = `kb-badge ${doc.status}`;
    badge.textContent = kbStatusLabel(doc.status);
    const view = document.createElement("button");
    view.type = "button";
    view.className = "item-del";
    view.textContent = "分块";
    view.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void viewKbChunks(doc);
    });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "item-del";
    del.textContent = "删除";
    del.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void deleteKbDocument(doc.id);
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "item-del";
    if (doc.status === "ready") {
      toggle.textContent = "停用";
    } else if (doc.status === "disabled") {
      toggle.textContent = "启用";
    }
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const disable = doc.status === "ready";
      void (async () => {
        try {
          await wb.setKbDocumentDisabled(doc.id, disable);
          void renderKbPanel();
        } catch (error) {
          showNote(error instanceof Error ? error.message : "操作失败");
        }
      })();
    });
    const buttons = [view, del];
    if (doc.status === "failed") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "item-del";
      retry.textContent = "重试";
      retry.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void (async () => {
          try {
            await wb.retryKbDocument(doc.id);
            showNote("已重新处理，后台进行中");
            window.setTimeout(() => {
              void renderKbPanel();
            }, 1500);
          } catch (error) {
            showNote(error instanceof Error ? error.message : "重试失败");
          }
        })();
      });
      buttons.splice(1, 0, retry);
    } else if (doc.status === "ready" || doc.status === "disabled") {
      buttons.splice(1, 0, toggle);
    }
    li.append(meta, badge, ...buttons);
    kbDocList.appendChild(li);
  }
}

async function deleteKbCollection(id: string): Promise<void> {
  if (!wb) return;
  await wb.deleteKbCollection(id);
  if (s.kbCollectionId === id) {
    s.kbCollectionId = "";
  }
  await refreshKb();
}

async function deleteKbDocument(id: string): Promise<void> {
  if (!wb) return;
  await wb.deleteKbDocument(id);
  await renderKbPanel();
}

async function viewKbChunks(doc: KbDocument): Promise<void> {
  if (!wb) return;
  const { chunks, total } = await wb.listKbChunks(doc.id);
  kbSearchResults.replaceChildren();
  const head = document.createElement("div");
  head.className = "kb-hit-head";
  head.textContent = `《${doc.title}》 ${total} 个分块`;
  kbSearchResults.appendChild(head);
  for (const chunk of chunks) {
    const el = document.createElement("div");
    el.className = "kb-hit";
    const sub = document.createElement("div");
    sub.className = "kb-hit-head";
    sub.textContent = `#${chunk.seq}`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "item-del";
    edit.textContent = "编辑";
    sub.appendChild(edit);
    const text = document.createElement("div");
    text.className = "kb-hit-text";
    text.textContent = chunk.text;
    el.append(sub, text);
    kbSearchResults.appendChild(el);

    let editing = false;
    edit.addEventListener("click", () => {
      if (editing) return;
      editing = true;
      const ta = document.createElement("textarea");
      ta.className = "kb-hit-textarea";
      ta.rows = 4;
      ta.value = chunk.text;
      const actions = document.createElement("div");
      actions.className = "kb-hit-actions";
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "保存";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "取消";
      actions.append(save, cancel);
      text.replaceWith(ta);
      el.appendChild(actions);

      const finish = (): void => {
        editing = false;
        ta.replaceWith(text);
        actions.remove();
      };
      cancel.addEventListener("click", finish);
      save.addEventListener("click", () => {
        const next = ta.value.trim();
        if (!next) {
          finish();
          return;
        }
        void (async () => {
          try {
            await wb.updateKbChunk(chunk.id, next);
            showNote("已更新并重新嵌入");
            void viewKbChunks(doc);
          } catch (error) {
            showNote(error instanceof Error ? error.message : "更新失败");
          }
        })();
      });
    });
  }
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((el) => el.remove());
  const text = doc.body?.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

export async function importKbUrl(): Promise<void> {
  const url = kbUrl.value.trim();
  if (!url || !wb) return;
  try {
    const { text } = await wb.fetchUrl(url);
    const parsed = text.trim().startsWith("<") ? htmlToText(text) : text;
    if (!parsed.trim()) {
      showNote("未提取到文本");
      return;
    }
    kbImportTitle.value = kbImportTitle.value.trim() || url.replace(/^https?:\/\//, "").slice(0, 40);
    kbImportText.value = parsed;
    s.kbSourceName = url;
    showNote("已解析链接，点「导入」入库");
  } catch (error) {
    showNote(error instanceof Error ? error.message : "解析失败");
  }
}

export async function exportDb(): Promise<void> {
  if (!wb) return;
  try {
    const result = await wb.exportDb();
    showNote(result.ok ? `已导出到 ${result.path ?? ""}` : "已取消");
  } catch (error) {
    showNote(error instanceof Error ? error.message : "导出失败");
  }
}

function getPdfLib(): { GlobalWorkerOptions: { workerSrc: string }; getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<unknown> } } | null {  const w = window as unknown as { pdfjsLib?: { GlobalWorkerOptions: { workerSrc: string }; getDocument: unknown } };
  const lib = w.pdfjsLib;
  if (!lib) {
    return null;
  }
  lib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.js";
  return lib as { GlobalWorkerOptions: { workerSrc: string }; getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<unknown> } };
}

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const lib = getPdfLib();
  if (!lib) {
    throw new Error("PDF 解析库未加载");
  }
  const doc = (await lib.getDocument({ data }).promise) as {
    numPages: number;
    getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: PdfTextItem[] }> }>;
  };
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    if (!reconstructPdfPage) {
      throw new Error("PDF 排版函数未加载");
    }
    pages.push(reconstructPdfPage(content.items));
  }
  return pages.join("\n\n");
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result.slice(result.indexOf(",") + 1));
      } else {
        reject(new Error("读取文件失败"));
      }
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

export async function handleKbFile(file: File): Promise<void> {
  try {
    const name = file.name;
    const ext = (name.split(".").pop() ?? "").toLowerCase();
    let text = "";
    if (ext === "pdf") {
      text = await extractPdfText(await file.arrayBuffer());
    } else if (ext === "docx") {
      if (!wb?.parseDocx) {
        showNote("Word 解析不可用");
        return;
      }
      const { text: parsed } = await wb.parseDocx(await fileToBase64(file));
      text = parsed;
    } else if (ext === "html" || ext === "htm") {
      text = htmlToText(await file.text());
    } else {
      text = await file.text();
    }
    if (!text.trim()) {
      showNote("未提取到文本");
      return;
    }
    kbImportTitle.value = name.replace(/\.[^.]+$/, "");
    kbImportText.value = text;
    s.kbSourceName = file.name;
    showNote(`已解析《${name}》，点「导入」入库`);
  } catch (error) {
    showNote(error instanceof Error ? error.message : "解析失败");
  }
}

function renderTraceSection(title: string, hits: KbTraceHit[]): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "kb-trace-section";
  const head = document.createElement("div");
  head.className = "kb-hit-head";
  head.textContent = `${title}（${hits.length}）`;
  el.appendChild(head);
  if (hits.length === 0) {
    const empty = document.createElement("div");
    empty.className = "kb-hit-text";
    empty.textContent = "（无）";
    el.appendChild(empty);
    return el;
  }
  for (const hit of hits) {
    const row = document.createElement("div");
    row.className = "kb-trace-hit";
    row.textContent = `${hit.score.toFixed(3)}  ${hit.text.slice(0, 40)}`;
    el.appendChild(row);
  }
  return el;
}

export async function runKbSearch(): Promise<void> {
  if (!wb || !s.kbCollectionId) return;
  const query = kbSearchInput.value.trim();
  if (!query) return;
  kbSearchResults.replaceChildren();
  try {
    const { hits, trace } = await wb.searchKb(query, [s.kbCollectionId], true);
    if (hits.length === 0) {
      kbSearchResults.appendChild(noteEl("未找到相关内容"));
      return;
    }
    for (const hit of hits) {
      const el = document.createElement("div");
      el.className = "kb-hit";
      const head = document.createElement("div");
      head.className = "kb-hit-head";
      head.textContent = `《${hit.documentTitle}》 相似度 ${hit.score.toFixed(3)}`;
      const text = document.createElement("div");
      text.className = "kb-hit-text";
      text.textContent = hit.text;
      el.append(head, text);
      kbSearchResults.appendChild(el);
    }
    if (trace) {
      const divider = document.createElement("div");
      divider.className = "kb-hit-head";
      divider.textContent = "── 检索过程 ──";
      kbSearchResults.appendChild(divider);
      const latency = trace.latencyMs;
      const latencyEl = document.createElement("div");
      latencyEl.className = "kb-trace-latency";
      latencyEl.textContent = `嵌入 ${latency.embed}ms · 向量 ${latency.vector}ms · 关键词 ${latency.keyword}ms · 融合 ${latency.fuse}ms · 重排 ${latency.rerank}ms（${trace.reranked ? "已重排" : "未重排"}）· 总计 ${latency.total}ms`;
      kbSearchResults.appendChild(latencyEl);
      kbSearchResults.appendChild(renderTraceSection("向量命中", trace.vectorHits));
      kbSearchResults.appendChild(renderTraceSection("关键词命中", trace.keywordHits));
      kbSearchResults.appendChild(renderTraceSection("融合结果", trace.fusedHits));
    }
  } catch (error) {
    kbSearchResults.appendChild(noteEl(error instanceof Error ? error.message : "检索失败"));
  }
}
