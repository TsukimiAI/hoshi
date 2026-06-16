export const AVATAR_CROP_VIEWPORT_SIZE = 280
export const AVATAR_CROP_OUTPUT_SIZE = 512
export const AVATAR_CROP_MIN_ZOOM = 1
export const AVATAR_CROP_MAX_ZOOM = 3

export interface AvatarCropTransform {
  offsetX: number
  offsetY: number
  zoom: number
}

export function computeCoverScale(
  imageWidth: number,
  imageHeight: number,
  viewportSize = AVATAR_CROP_VIEWPORT_SIZE
): number {
  return Math.max(viewportSize / imageWidth, viewportSize / imageHeight)
}

export function createInitialAvatarCropTransform(): AvatarCropTransform {
  return { offsetX: 0, offsetY: 0, zoom: 1 }
}

export function clampAvatarCropTransform(
  transform: AvatarCropTransform,
  imageWidth: number,
  imageHeight: number,
  viewportSize = AVATAR_CROP_VIEWPORT_SIZE
): AvatarCropTransform {
  const zoom = Math.min(
    AVATAR_CROP_MAX_ZOOM,
    Math.max(AVATAR_CROP_MIN_ZOOM, transform.zoom)
  )
  const scale = computeCoverScale(imageWidth, imageHeight, viewportSize) * zoom
  const displayWidth = imageWidth * scale
  const displayHeight = imageHeight * scale

  const maxOffsetX = Math.max(0, displayWidth / 2 - viewportSize / 2)
  const maxOffsetY = Math.max(0, displayHeight / 2 - viewportSize / 2)

  return {
    zoom,
    offsetX: clamp(transform.offsetX, -maxOffsetX, maxOffsetX),
    offsetY: clamp(transform.offsetY, -maxOffsetY, maxOffsetY)
  }
}

const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_AVATAR_EXTENSION = /\.(jpe?g|png|webp)$/i

export function isAllowedAvatarImageFile(file: File): boolean {
  if (ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
    return true
  }
  return ALLOWED_AVATAR_EXTENSION.test(file.name)
}

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await loadImageFromBitmap(await createImageBitmap(file))
    } catch {
      // Fall back to data URL for formats the browser cannot decode via ImageBitmap.
    }
  }

  const dataUrl = await readFileAsDataUrl(file)
  return loadImage(dataUrl)
}

export async function cropAvatarToBlob(
  image: HTMLImageElement,
  transform: AvatarCropTransform,
  options: {
    viewportSize?: number
    outputSize?: number
    mimeType?: string
    quality?: number
  } = {}
): Promise<Blob> {
  const viewportSize = options.viewportSize ?? AVATAR_CROP_VIEWPORT_SIZE
  const outputSize = options.outputSize ?? AVATAR_CROP_OUTPUT_SIZE
  const mimeType = options.mimeType ?? 'image/jpeg'
  const quality = options.quality ?? 0.92

  const clamped = clampAvatarCropTransform(
    transform,
    image.naturalWidth,
    image.naturalHeight,
    viewportSize
  )
  const scale =
    computeCoverScale(image.naturalWidth, image.naturalHeight, viewportSize) * clamped.zoom
  const exportScale = outputSize / viewportSize

  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建裁剪画布')
  }

  context.save()
  context.beginPath()
  context.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2)
  context.clip()
  context.translate(
    outputSize / 2 + clamped.offsetX * exportScale,
    outputSize / 2 + clamped.offsetY * exportScale
  )
  context.scale(scale * exportScale, scale * exportScale)
  context.drawImage(
    image,
    -image.naturalWidth / 2,
    -image.naturalHeight / 2,
    image.naturalWidth,
    image.naturalHeight
  )
  context.restore()

  const blob = await canvasToBlob(canvas, mimeType, quality)
  if (!blob) {
    throw new Error('头像裁剪失败')
  }
  return blob
}

export function blobToAvatarFile(blob: Blob, originalName: string): File {
  const extension = blob.type === 'image/png' ? '.png' : '.jpg'
  const baseName = originalName.replace(/\.[^.]+$/, '') || 'avatar'
  return new File([blob], `${baseName}${extension}`, { type: blob.type })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function loadImageFromBitmap(bitmap: ImageBitmap): Promise<HTMLImageElement> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('无法读取图片')
  }
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/png')
  return loadImage(dataUrl)
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('图片读取失败'))
    }
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, mimeType, quality)
  })
}
