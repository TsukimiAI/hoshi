import { describe, expect, it } from 'vitest'
import { isOverInteractivePetArea, isPointInRect, type PetHitTestDeps } from './petHitTest'

describe('isPointInRect', () => {
  it('detects points inside rect', () => {
    const rect = new DOMRect(10, 20, 100, 80)
    expect(isPointInRect(50, 50, rect)).toBe(true)
    expect(isPointInRect(9, 50, rect)).toBe(false)
  })
})

describe('isOverInteractivePetArea', () => {
  it('returns true when elementFromPoint hits pet-hit', () => {
    const menu = document.createElement('nav')
    menu.className = 'pet-hit'

    const deps: PetHitTestDeps = {
      elementFromPoint: () => menu,
      querySpriteButton: () => null
    }

    expect(isOverInteractivePetArea(200, 80, deps)).toBe(true)
  })

  it('returns true over sprite bounding box including transparent pixels', () => {
    const sprite = document.createElement('button')
    sprite.getBoundingClientRect = () => new DOMRect(0, 0, 120, 240)

    const deps: PetHitTestDeps = {
      elementFromPoint: () => document.body,
      querySpriteButton: () => sprite
    }

    expect(isOverInteractivePetArea(60, 120, deps)).toBe(true)
  })

  it('returns false over empty overlay area', () => {
    const sprite = document.createElement('button')
    sprite.getBoundingClientRect = () => new DOMRect(0, 0, 120, 240)

    const deps: PetHitTestDeps = {
      elementFromPoint: () => document.body,
      querySpriteButton: () => sprite
    }

    expect(isOverInteractivePetArea(300, 10, deps)).toBe(false)
  })
})
