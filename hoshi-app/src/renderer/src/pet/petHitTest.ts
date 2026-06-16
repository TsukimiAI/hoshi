export const PET_HIT_SELECTOR = '.pet-hit, .login-modal'

export interface PetHitTestDeps {
  elementFromPoint: (clientX: number, clientY: number) => Element | null
  querySpriteButton: () => HTMLElement | null
}

export function isPointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

export function createPetHitTestDeps(doc: Document = document): PetHitTestDeps {
  return {
    elementFromPoint: (clientX, clientY) => doc.elementFromPoint(clientX, clientY),
    querySpriteButton: () => doc.querySelector('.pet-overlay .pet-stage__sprite-btn')
  }
}

export function isOverInteractivePetArea(
  clientX: number,
  clientY: number,
  deps: PetHitTestDeps = createPetHitTestDeps()
): boolean {
  const target = deps.elementFromPoint(clientX, clientY)

  if (target?.closest(PET_HIT_SELECTOR)) {
    return true
  }

  const spriteBtn = deps.querySpriteButton()
  if (spriteBtn) {
    const rect = spriteBtn.getBoundingClientRect()
    if (isPointInRect(clientX, clientY, rect)) {
      return true
    }
  }

  return false
}
