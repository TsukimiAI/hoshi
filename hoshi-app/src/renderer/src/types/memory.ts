export type MemoryType = 'long' | 'short'

export type LongMemoryCategory =
  | 'identity'
  | 'preference'
  | 'habit'
  | 'communication_preference'
  | 'long_term_goal'

export type ShortMemoryCategory =
  | 'plan'
  | 'mood'
  | 'recent_event'
  | 'temporary_goal'
  | 'current_focus'

export type MemoryCategory = LongMemoryCategory | ShortMemoryCategory

export type MemoryEventType = 'created' | 'promoted'

export interface UserMemory {
  id: string
  memoryType: MemoryType
  content: string
  category: MemoryCategory
  alwaysPinned: boolean
  supersedesMemoryId?: string | null
  createdAt: string
  updatedAt: string
}

export interface RecentMemory extends UserMemory {
  eventType: MemoryEventType
}

export const LONG_MEMORY_CATEGORY_LABELS: Record<LongMemoryCategory, string> = {
  identity: '身份',
  preference: '偏好',
  habit: '习惯',
  communication_preference: '交流方式',
  long_term_goal: '长期目标'
}

export const SHORT_MEMORY_CATEGORY_LABELS: Record<ShortMemoryCategory, string> = {
  plan: '计划',
  mood: '情绪',
  recent_event: '近期事件',
  temporary_goal: '阶段目标',
  current_focus: '当前关注'
}

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  ...LONG_MEMORY_CATEGORY_LABELS,
  ...SHORT_MEMORY_CATEGORY_LABELS
}

export const LONG_MEMORY_CATEGORIES: LongMemoryCategory[] = [
  'identity',
  'preference',
  'habit',
  'communication_preference',
  'long_term_goal'
]

export const SHORT_MEMORY_CATEGORIES: ShortMemoryCategory[] = [
  'plan',
  'mood',
  'recent_event',
  'temporary_goal',
  'current_focus'
]

export const MEMORY_FILTER_CATEGORIES: MemoryCategory[] = [
  ...LONG_MEMORY_CATEGORIES,
  ...SHORT_MEMORY_CATEGORIES
]

export interface CreateMemoryInput {
  content: string
  category: LongMemoryCategory
  alwaysPinned?: boolean
}

export interface UpdateMemoryInput {
  content?: string
  category?: LongMemoryCategory
  alwaysPinned?: boolean
}

export type MemoryCorrectionAction = 'supersede' | 'archive'

export interface MemoryCorrection {
  id: string
  action: MemoryCorrectionAction
  memoryType: MemoryType
  content: string
  category: MemoryCategory
  supersedesMemoryId: string | null
  supersededContent: string | null
  occurredAt: string
}

export type HistoryFilter = 'all' | 'proactive' | 'correction'

export type MemoryPanelSection = 'long' | 'short' | 'history'

export type ProactiveSourceType = 'memory' | 'open_loop'

export interface ProactiveHistoryItem {
  id: string
  sourceType: ProactiveSourceType | string
  sourceKey: string
  content: string
  createdAt: string
}
