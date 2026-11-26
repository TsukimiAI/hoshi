import { fileToB64, assetExt, nodeId } from "./editorFiles.js";
import {
  s,
  showNote,
  themeBg,
  themeDesc,
  themeDialog,
  themeFile,
  themeFont,
  themeMenu,
  themeName,
  themeSound,
  themeSoundPreview,
  themeSprites,
  wb as workbenchApi
} from "./ctx.js";
import { EMOTION_KEYS } from "./types.js";

const wb = workbenchApi;

export function emptyThemeTokens(): { bg: string; font: string; dialog: string; menu: string; sound: string } {
  return { bg: "#f4f6fb", font: "", dialog: "#ffffff", menu: "#ffffff", sound: "" };
}

function renderThemeSprites(): void {
  themeSprites.replaceChildren();
  const sprites = s.themePack?.sprites ?? {};
  for (const emotion of EMOTION_KEYS) {
    const rel = sprites[emotion] ?? "";
    const slot = document.createElement("div");
    slot.className = "theme-sprite";
    const label = document.createElement("span");
    label.className = "theme-sprite-label";
    label.textContent = emotion;
    const box = document.createElement("div");
    box.className = "theme-sprite-box";
    if (rel) {
      const img = document.createElement("img");
      img.alt = emotion;
      void wb
        ?.sandboxAssetUrl(s.currentId, rel)
        .then(({ url }) => {
          if (url) img.src = url;
        })
        .catch(() => undefined);
      box.appendChild(img);
    } else {
      box.classList.add("empty");
      box.textContent = "未设置";
    }
    const actions = document.createElement("div");
    actions.className = "theme-sprite-actions";
    const upload = document.createElement("button");
    upload.type = "button";
    upload.textContent = "上传";
    upload.addEventListener("click", () => {
      s.themeSpriteTarget = emotion;
      themeFile.value = "";
      themeFile.click();
    });
    actions.appendChild(upload);
    if (rel) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.textContent = "清除";
      clear.addEventListener("click", () => {
        if (!s.themePack) return;
        delete s.themePack.sprites[emotion];
        renderThemeSprites();
      });
      actions.appendChild(clear);
    }
    slot.append(label, box, actions);
    themeSprites.appendChild(slot);
  }
}

export async function applyThemeSprite(file: File): Promise<void> {
  const emotion = s.themeSpriteTarget;
  if (!emotion || !wb || !s.currentId) return;
  try {
    const rel = `sprites/${emotion}${assetExt(file.name) || ".png"}`;
    const b64 = await fileToB64(file);
    await wb.uploadSandboxAsset(s.currentId, rel, b64);
    if (!s.themePack) s.themePack = { name: "", description: "", tokens: emptyThemeTokens(), sprites: {} };
    s.themePack.sprites[emotion] = rel;
    renderThemeSprites();
  } catch (error) {
    showNote(error instanceof Error ? error.message : "上传失败");
  }
}

export function updateSoundPreview(): void {
  const rel = themeSound.value.trim();
  if (rel && wb && s.currentId) {
    void wb
      .sandboxAssetUrl(s.currentId, rel)
      .then(({ url }) => {
        if (url) {
          themeSoundPreview.src = url;
          themeSoundPreview.hidden = false;
        }
      })
      .catch(() => undefined);
  } else {
    themeSoundPreview.removeAttribute("src");
    themeSoundPreview.hidden = true;
  }
}

export async function loadThemeEditor(id: string): Promise<void> {
  if (!wb) return;
  const pack = await wb.readThemePack(id);
  s.themePack = pack;
  themeName.value = pack.name || "";
  themeDesc.value = pack.description || "";
  themeBg.value = pack.tokens.bg || "#f4f6fb";
  themeDialog.value = pack.tokens.dialog || "#ffffff";
  themeMenu.value = pack.tokens.menu || "#ffffff";
  themeFont.value = pack.tokens.font || "";
  themeSound.value = pack.tokens.sound || "";
  updateSoundPreview();
  renderThemeSprites();
}

export function themePreviewTokens(): { bg: string; font: string; dialog: string; menu: string } {
  return {
    bg: themeBg.value.trim(),
    font: themeFont.value.trim(),
    dialog: themeDialog.value.trim(),
    menu: themeMenu.value.trim()
  };
}

export async function saveThemeEditor(): Promise<void> {
  if (!wb || !s.currentId || !s.themePack) return;
  const pack = {
    name: themeName.value.trim(),
    description: themeDesc.value.trim(),
    tokens: {
      bg: themeBg.value.trim(),
      font: themeFont.value.trim(),
      dialog: themeDialog.value.trim(),
      menu: themeMenu.value.trim(),
      sound: themeSound.value.trim()
    },
    sprites: s.themePack.sprites
  };
  s.themePack = await wb.writeThemePack(s.currentId, pack);
  showNote("主题已保存");
}

// ---- canvas editor ----

