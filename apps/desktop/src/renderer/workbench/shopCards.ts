import {
  noteEl,
  previewBody,
  previewMask,
  previewTitle,
  s,
  showNote,
  wb as workbenchApi
} from "./ctx.js";
import type { LiveItem, PluginTemplateKind, SandboxEntry } from "./types.js";

const wb = workbenchApi;

let deleteWorkspace: (id: string) => Promise<void> = async () => {};
let selectWorkspace: (id: string) => Promise<void> = async () => {};

export function bindShopActions(actions: {
  deleteWorkspace: (id: string) => Promise<void>;
  selectWorkspace: (id: string) => Promise<void>;
}): void {
  deleteWorkspace = actions.deleteWorkspace;
  selectWorkspace = actions.selectWorkspace;
}

function templateLabel(template: PluginTemplateKind): string {
  const map: Record<PluginTemplateKind, string> = {
    mcp: "MCP",
    panel: "播放器",
    launcher: "启动器",
    theme: "主题"
  };
  return map[template] ?? template;
}

async function themeFirstSpriteRel(id: string): Promise<string> {
  if (!wb) return "";
  try {
    const pack = await wb.readThemePack(id);
    return Object.values(pack.sprites ?? {})[0] ?? "";
  } catch {
    return "";
  }
}

export function buildSkinCard(entry: SandboxEntry): HTMLDivElement {
  const card = document.createElement("div");
  card.className = `card${entry.id === s.currentId ? " active" : ""}`;
  card.dataset.id = entry.id;
  const cover = document.createElement("div");
  cover.className = "card-cover";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = templateLabel(entry.template);
  cover.appendChild(badge);
  if (entry.template === "theme") {
    void themeFirstSpriteRel(entry.id)
      .then(async (rel) => {
        if (rel && wb) {
          const { url } = await wb.sandboxAssetUrl(entry.id, rel);
          if (url) {
            const img = document.createElement("img");
            img.src = url;
            cover.appendChild(img);
          }
        }
      })
      .catch(() => undefined);
  } else {
    cover.classList.add("placeholder");
    const icon = document.createElement("span");
    icon.className = "card-cover-icon";
    icon.textContent = entry.template === "launcher" ? "🚀" : "▶";
    cover.appendChild(icon);
  }
  const h3 = document.createElement("h3");
  h3.textContent = entry.id;
  const p = document.createElement("p");
  p.textContent = entry.template === "theme" ? "立绘与颜色" : "宿主界面 + 画布";
  card.append(cover, h3, p);
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "删除";
  del.addEventListener("click", (event) => {
    event.stopPropagation();
    void deleteWorkspace(entry.id);
  });
  actions.appendChild(del);
  card.append(actions);
  card.addEventListener("click", () => {
    void selectWorkspace(entry.id);
  });
  return card;
}

export async function buildShopCard(item: LiveItem): Promise<HTMLDivElement> {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.id = item.id;
  const cover = document.createElement("div");
  cover.className = "card-cover";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = templateLabel(item.template);
  cover.appendChild(badge);
  if (item.cover && wb) {
    try {
      const { url } = await wb.sandboxAssetUrl(item.id, item.cover, true);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        cover.appendChild(img);
      }
    } catch {
      /* none */
    }
  }
  if (!cover.querySelector("img")) {
    cover.classList.add("placeholder");
    const icon = document.createElement("span");
    icon.className = "card-cover-icon";
    icon.textContent = "✦";
    cover.appendChild(icon);
  }
  const h3 = document.createElement("h3");
  h3.textContent = item.name || item.id;
  const p = document.createElement("p");
  p.textContent = item.description || "";
  card.append(cover, h3, p);
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const toggleLabel = document.createElement("label");
  toggleLabel.className = "card-toggle";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = item.enabled;
  toggle.addEventListener("change", () => {
    void setEnabled(item.id, toggle.checked).catch((error) => {
      toggle.checked = !toggle.checked;
      showNote(error instanceof Error ? error.message : "开关失败");
    });
  });
  toggleLabel.append(toggle, document.createTextNode("启用"));
  const preview = document.createElement("button");
  preview.type = "button";
  preview.textContent = "预览";
  preview.addEventListener("click", (event) => {
    event.stopPropagation();
    void openShopPreview(item);
  });
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "卸载";
  del.addEventListener("click", (event) => {
    event.stopPropagation();
    void deleteWorkspace(item.id);
  });
  actions.append(toggleLabel, preview, del);
  card.append(actions);
  return card;
}

async function openShopPreview(item: LiveItem): Promise<void> {
  previewTitle.textContent = item.name || item.id;
  previewBody.replaceChildren();
  const hint = document.createElement("p");
  hint.className = "preview-hint";
  hint.textContent = item.description || templateLabel(item.template);
  previewBody.appendChild(hint);
  if (item.template === "theme" && wb) {
    try {
      const pack = await wb.readLiveThemePack(item.id);
      const swatches = document.createElement("div");
      swatches.className = "preview-swatches";
      const tokens = pack.tokens;
      for (const [key, label] of [
        ["bg", "背景"],
        ["dialog", "对话框"],
        ["menu", "菜单"]
      ] as const) {
        if (tokens[key]) {
          const chip = document.createElement("span");
          chip.className = "preview-swatch";
          chip.style.background = tokens[key];
          chip.title = `${label} ${tokens[key]}`;
          chip.textContent = label;
          swatches.appendChild(chip);
        }
      }
      if (pack.tokens.sound) {
        const sound = document.createElement("span");
        sound.className = "preview-note";
        sound.textContent = `音效: ${pack.tokens.sound}`;
        swatches.appendChild(sound);
      }
      previewBody.appendChild(swatches);
      const grid = document.createElement("div");
      grid.className = "preview-grid";
      const entries = Object.entries(pack.sprites ?? {});
      if (entries.length === 0) {
        grid.textContent = "未设置立绘，回退默认人格";
      }
      for (const [emotion, rel] of entries) {
        const cell = document.createElement("div");
        cell.className = "preview-cell";
        const img = document.createElement("img");
        img.alt = emotion;
        const { url } = await wb.sandboxAssetUrl(item.id, rel, true);
        if (url) img.src = url;
        const name = document.createElement("span");
        name.textContent = emotion;
        cell.append(img, name);
        grid.appendChild(cell);
      }
      previewBody.appendChild(grid);
    } catch (error) {
      previewBody.appendChild(noteEl(error instanceof Error ? error.message : "读取失败"));
    }
  } else {
    const big = document.createElement("div");
    big.className = "preview-cover";
    if (item.cover && wb) {
      const { url } = await wb.sandboxAssetUrl(item.id, item.cover, true);
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        big.appendChild(img);
      }
    }
    const note = document.createElement("p");
    note.className = "preview-hint";
    note.textContent = item.template === "launcher" ? "宿主启动器：列出应用并打开" : "宿主播放器：选文件播放";
    big.appendChild(note);
    previewBody.appendChild(big);
  }
  previewMask.hidden = false;
}

async function setEnabled(id: string, on: boolean): Promise<void> {
  if (!wb) return;
  const settings = await wb.getSettings();
  const enabled = new Set(settings.plugins.enabled);
  if (on) enabled.add(id);
  else enabled.delete(id);
  await wb.saveSettings({
    ...settings,
    plugins: { ...settings.plugins, enabled: [...enabled] }
  });
}
