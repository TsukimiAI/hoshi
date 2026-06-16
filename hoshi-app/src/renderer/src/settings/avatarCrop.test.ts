import { describe, expect, it } from 'vitest'
import {
  AVATAR_CROP_VIEWPORT_SIZE,
  clampAvatarCropTransform,
  computeCoverScale,
  createInitialAvatarCropTransform
} from './avatarCrop'

describe('avatarCrop', () => {
  it('computes cover scale for portrait and landscape images', () => {
    expect(computeCoverScale(1000, 500, AVATAR_CROP_VIEWPORT_SIZE)).toBeCloseTo(0.56, 2)
    expect(computeCoverScale(500, 1000, AVATAR_CROP_VIEWPORT_SIZE)).toBeCloseTo(0.56, 2)
  })

  it('clamps zoom and pan inside cover bounds', () => {
    const transform = clampAvatarCropTransform(
      { offsetX: 999, offsetY: -999, zoom: 5 },
      800,
      800,
      AVATAR_CROP_VIEWPORT_SIZE
    )

    expect(transform.zoom).toBe(3)
    expect(transform.offsetX).toBeLessThan(999)
    expect(transform.offsetY).toBeGreaterThan(-999)
  })

  it('starts centered at minimum zoom', () => {
    expect(createInitialAvatarCropTransform()).toEqual({
      offsetX: 0,
      offsetY: 0,
      zoom: 1
    })
  })
})
