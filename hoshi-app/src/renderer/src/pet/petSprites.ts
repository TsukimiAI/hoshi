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

export const DEFAULT_PET_EMOTION = 'normal'

/** 后端旧版英文 emotion 兼容映射 */
const LEGACY_EMOTION_MAP: Record<string, string> = {
  正常: 'normal',
  开心: 'happy',
  很高兴: 'very-happy',
  害羞: 'shy',
  困惑: 'confused',
  疑惑: 'doubt',
  生气: 'angry',
  难过: 'sad',
  惊讶: 'shock',
  期待: 'expect',
  喜欢: 'like',
  很喜欢: 'very-like',
  IDLE: 'normal',
  HAPPY: 'happy',
  THINKING: 'expect',
  SURPRISED: 'shock',
  SAD: 'sad',
  SLEEPY: 'wry'
}

export const PET_EMOTION_LIST = Object.keys(PET_SPRITES).sort()

export function resolvePetEmotion(raw: string | undefined): string {
  if (!raw) return DEFAULT_PET_EMOTION
  const normalized = raw.trim()
  if (normalized in PET_SPRITES) return normalized
  if (normalized in LEGACY_EMOTION_MAP) return LEGACY_EMOTION_MAP[normalized]
  return DEFAULT_PET_EMOTION
}

export function getPetSprite(emotion: string): string {
  return PET_SPRITES[emotion] ?? PET_SPRITES[DEFAULT_PET_EMOTION]
}
