import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PET_EMOTION,
  PET_SPRITES,
  getPetSprite,
  resolvePetEmotion
} from './petSprites'

describe('resolvePetEmotion', () => {
  it('returns normal for empty input', () => {
    expect(resolvePetEmotion(undefined)).toBe(DEFAULT_PET_EMOTION)
    expect(resolvePetEmotion('')).toBe(DEFAULT_PET_EMOTION)
  })

  it('accepts sprite keys directly', () => {
    expect(resolvePetEmotion('happy')).toBe('happy')
    expect(resolvePetEmotion('shy')).toBe('shy')
  })

  it('maps legacy chinese labels', () => {
    expect(resolvePetEmotion('开心')).toBe('happy')
    expect(resolvePetEmotion('期待')).toBe('expect')
  })

  it('maps legacy english enum labels', () => {
    expect(resolvePetEmotion('HAPPY')).toBe('happy')
    expect(resolvePetEmotion('THINKING')).toBe('expect')
  })

  it('falls back to normal for unknown labels', () => {
    expect(resolvePetEmotion('not-a-real-emotion')).toBe(DEFAULT_PET_EMOTION)
  })
})

describe('getPetSprite', () => {
  it('returns bundled sprite url for known emotions', () => {
    expect(getPetSprite('happy')).toBe(PET_SPRITES.happy)
    expect(getPetSprite('normal')).toBe(PET_SPRITES.normal)
  })

  it('falls back to normal sprite for unknown emotions', () => {
    expect(getPetSprite('unknown-emotion')).toBe(PET_SPRITES[DEFAULT_PET_EMOTION])
  })
})
