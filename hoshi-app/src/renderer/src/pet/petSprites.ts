const modules = import.meta.glob<string>('../assets/pet/petpng/*.png', {
  eager: true,
  import: 'default'
})

function spriteNameFromPath(path: string): string {
  const file = path.split('/').pop() ?? path
  return decodeURIComponent(file.replace(/\.png$/i, ''))
}

/** 差分文件名（不含扩展名）→ 打包后的图片 URL */
export const PET_SPRITES: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, url]) => [spriteNameFromPath(path), url])
)

export const DEFAULT_PET_EMOTION = '正常'

/** 后端旧版英文 emotion 兼容映射 */
const LEGACY_EMOTION_MAP: Record<string, string> = {
  IDLE: '正常',
  HAPPY: '开心',
  SLEEPY: '生无可恋'
}

export const PET_EMOTION_LIST = Object.keys(PET_SPRITES).sort()

export function resolvePetEmotion(raw: string | undefined): string {
  if (!raw) return DEFAULT_PET_EMOTION
  if (raw in PET_SPRITES) return raw
  if (raw in LEGACY_EMOTION_MAP) return LEGACY_EMOTION_MAP[raw]
  return DEFAULT_PET_EMOTION
}

export function getPetSprite(emotion: string): string {
  return PET_SPRITES[emotion] ?? PET_SPRITES[DEFAULT_PET_EMOTION]
}
