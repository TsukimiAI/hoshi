import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import * as memoryApi from '../api/memory'
import { useAuth } from '../auth/AuthContext'
import { useAppPreferences } from '../settings/useAppPreferences'
import type {
  CreateMemoryInput,
  MemoryCategory,
  MemoryEventType,
  RecentMemory,
  UpdateMemoryInput,
  UserMemory
} from '../types/memory'

export type WorkspaceTab = 'chat' | 'memory'

export interface MemoryToastEvent {
  id: string
  eventType: MemoryEventType
  memories: RecentMemory[]
}

interface MemoryContextValue {
  workspaceTab: WorkspaceTab
  setWorkspaceTab: (tab: WorkspaceTab) => void
  memories: UserMemory[]
  loading: boolean
  error: string | null
  categoryFilter: MemoryCategory | null
  setCategoryFilter: (category: MemoryCategory | null) => void
  refreshMemories: () => Promise<void>
  createMemory: (input: CreateMemoryInput) => Promise<void>
  updateMemory: (memoryId: string, input: UpdateMemoryInput) => Promise<void>
  removeMemory: (memoryId: string) => Promise<void>
  enqueueMemoryEvents: (items: RecentMemory[]) => void
  activeToast: MemoryToastEvent | null
  dismissToast: () => void
}

const MemoryContext = createContext<MemoryContextValue | null>(null)

const SHOWN_MEMORY_IDS_KEY = 'hoshi.shownMemoryIds'

function loadShownMemoryIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SHOWN_MEMORY_IDS_KEY)
    if (!raw) {
      return new Set()
    }
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed)
  } catch {
    return new Set()
  }
}

function persistShownMemoryIds(ids: Set<string>): void {
  localStorage.setItem(SHOWN_MEMORY_IDS_KEY, JSON.stringify([...ids].slice(-200)))
}

function groupRecentMemories(
  items: RecentMemory[],
  shownIds: Set<string>
): MemoryToastEvent[] {
  const fresh = items.filter((item) => !shownIds.has(item.id))
  if (fresh.length === 0) {
    return []
  }

  const groups: Record<MemoryEventType, RecentMemory[]> = {
    promoted: [],
    created: []
  }
  for (const item of fresh) {
    groups[item.eventType].push(item)
  }

  const events: MemoryToastEvent[] = []
  if (groups.promoted.length > 0) {
    events.push({
      id: `promoted-${groups.promoted.map((item) => item.id).join('-')}`,
      eventType: 'promoted',
      memories: groups.promoted
    })
  }
  if (groups.created.length > 0) {
    events.push({
      id: `created-${groups.created.map((item) => item.id).join('-')}`,
      eventType: 'created',
      memories: groups.created
    })
  }
  return events
}

function toRecentMemory(memory: UserMemory, eventType: MemoryEventType = 'created'): RecentMemory {
  return {
    ...memory,
    eventType
  }
}

export function MemoryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useAuth()
  const { preferences } = useAppPreferences()
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('chat')
  const [memories, setMemories] = useState<UserMemory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | null>(null)
  const [toastQueue, setToastQueue] = useState<MemoryToastEvent[]>([])
  const shownMemoryIdsRef = useRef(loadShownMemoryIds())

  const enqueueToastEvents = useCallback(
    (events: MemoryToastEvent[]) => {
      if (!preferences.memoryToastEnabled || events.length === 0) {
        return
      }
      setToastQueue((prev) => [...prev, ...events])
    },
    [preferences.memoryToastEnabled]
  )

  const refreshMemories = useCallback(async () => {
    if (!user) {
      setMemories([])
      setError(null)
      return
    }

    setLoading(true)
    try {
      const res = await memoryApi.fetchMemories(categoryFilter ?? undefined)
      setMemories(res.data)
      setError(null)
    } catch (err) {
      setMemories([])
      setError(err instanceof Error ? err.message : '记忆加载失败了…')
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, user])

  useEffect(() => {
    void refreshMemories()
  }, [refreshMemories])

  const enqueueMemoryEvents = useCallback(
    (items: RecentMemory[]) => {
      const events = groupRecentMemories(items, shownMemoryIdsRef.current)
      enqueueToastEvents(events)
      void refreshMemories()
    },
    [enqueueToastEvents, refreshMemories]
  )

  const createMemory = useCallback(
    async (input: CreateMemoryInput) => {
      const res = await memoryApi.createMemory(input)
      await refreshMemories()
      enqueueToastEvents(
        groupRecentMemories([toRecentMemory(res.data, 'created')], shownMemoryIdsRef.current)
      )
    },
    [enqueueToastEvents, refreshMemories]
  )

  const updateMemory = useCallback(
    async (memoryId: string, input: UpdateMemoryInput) => {
      await memoryApi.updateMemory(memoryId, input)
      await refreshMemories()
    },
    [refreshMemories]
  )

  const removeMemory = useCallback(
    async (memoryId: string) => {
      await memoryApi.deleteMemory(memoryId)
      await refreshMemories()
    },
    [refreshMemories]
  )

  const activeToast = toastQueue[0] ?? null

  const dismissToast = useCallback(() => {
    setToastQueue((prev) => {
      const current = prev[0]
      if (!current) {
        return prev
      }
      for (const memory of current.memories) {
        shownMemoryIdsRef.current.add(memory.id)
      }
      persistShownMemoryIds(shownMemoryIdsRef.current)
      return prev.slice(1)
    })
  }, [])

  const value = useMemo(
    () => ({
      workspaceTab,
      setWorkspaceTab,
      memories,
      loading,
      error,
      categoryFilter,
      setCategoryFilter,
      refreshMemories,
      createMemory,
      updateMemory,
      removeMemory,
      enqueueMemoryEvents,
      activeToast,
      dismissToast
    }),
    [
      workspaceTab,
      memories,
      loading,
      error,
      categoryFilter,
      refreshMemories,
      createMemory,
      updateMemory,
      removeMemory,
      enqueueMemoryEvents,
      activeToast,
      dismissToast
    ]
  )

  return <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>
}

export function useMemory(): MemoryContextValue {
  const context = useContext(MemoryContext)
  if (!context) {
    throw new Error('useMemory must be used within MemoryProvider')
  }
  return context
}
