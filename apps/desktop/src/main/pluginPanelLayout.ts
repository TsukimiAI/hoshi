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
