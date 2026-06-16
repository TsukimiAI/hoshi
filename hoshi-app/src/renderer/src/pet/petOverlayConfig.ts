/** 星奈回复最后一条落库后、开始滚出前的停留（毫秒）默认值 */
export const DEFAULT_BUBBLE_DWELL_MS = 2000

/** 星奈回复气泡向上滚出消失的动画时长（毫秒）默认值 */
export const DEFAULT_BUBBLE_EXIT_MS = 2000

/** 点击立绘问候气泡的停留时长（毫秒）默认值 */
export const DEFAULT_GREETING_DWELL_MS = 500

export const PET_GREETING_LINES = [
  '老师，今天也要加油哦～',
  '嗯？找星奈有事吗？',
  '星奈在这里陪着你呢。',
  '想聊天的话，右键点我打开菜单哦。',
  '今天过得怎么样？'
] as const

export function pickPetGreetingLine(): string {
  const index = Math.floor(Math.random() * PET_GREETING_LINES.length)
  return PET_GREETING_LINES[index] ?? PET_GREETING_LINES[0]
}
