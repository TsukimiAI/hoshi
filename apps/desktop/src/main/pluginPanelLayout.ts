export const PET_SLOT = 184;
export const PANEL_MIN_W = 200;
export const PANEL_MAX_W = 800;
export const PANEL_MIN_H = 48;
export const PANEL_MAX_H = 720;

export type Rect = { x: number; y: number; width: number; height: number };

export function clampPanelSize(width: unknown, height: unknown): { width: number; height: number } {
  return {
    width: Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, Math.floor(Number(width) || 0))),
    height: Math.min(PANEL_MAX_H, Math.max(PANEL_MIN_H, Math.floor(Number(height) || 0)))
  };
}

export function parsePanelSize(payload: unknown): { width: number; height: number } {
  const rec = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const raw = Array.isArray(payload) ? payload : rec.size;
  const w = Array.isArray(raw) ? raw[0] : rec.width;
  const h = Array.isArray(raw) ? raw[1] : rec.height;
  return clampPanelSize(w, h);
}

export function pinPetBounds(pet: Rect, fixed: { width: number; height: number }): Rect {
  return {
    x: pet.x,
    y: pet.y + pet.height - fixed.height,
    width: fixed.width,
    height: fixed.height
  };
}

export function petWindowChanged(a: Rect, b: Rect): boolean {
  return a.x !== b.x || a.y !== b.y || a.width !== b.width || a.height !== b.height;
}

export function panelBoundsFromPet(pet: Rect, size: { width: number; height: number }): Rect {
  return {
    x: pet.x + PET_SLOT,
    y: pet.y + pet.height - size.height,
    width: size.width,
    height: size.height
  };
}

export const APPS_BOX_W = 280;
export const APPS_COL = 3;
export const APPS_HEADER_H = 40;
export const APPS_PAD = 12;
export const APPS_CELL_H = 88;
export const APPS_EMPTY_H = 160;
export const APPS_HOME_MAX_H = 360;
export const APPS_PANEL_H = 360;
export const APPS_LAUNCHER_H = 420;
export const APPS_SCHEDULE_H = 520;
export const APPS_MINI_H = 56;

export function appsMiniSize(): { width: number; height: number } {
  return clampPanelSize(APPS_BOX_W, APPS_MINI_H);
}

export function appsHomeSize(count: number): { width: number; height: number } {
  if (count <= 0) {
    return clampPanelSize(APPS_BOX_W, APPS_EMPTY_H);
  }
  const rows = Math.ceil(count / APPS_COL);
  const height = APPS_PAD + APPS_HEADER_H + rows * APPS_CELL_H + APPS_PAD;
  return clampPanelSize(APPS_BOX_W, Math.min(APPS_HOME_MAX_H, height));
}

export function appsTemplateSize(template: "panel" | "launcher" | "music" | "schedule"): { width: number; height: number } {
  const height =
    template === "launcher" ? APPS_LAUNCHER_H : template === "schedule" ? APPS_SCHEDULE_H : APPS_PANEL_H;
  return clampPanelSize(APPS_BOX_W, height);
}
