import { apiFetch } from '../lib/http'
import type {
  CreateMemoryInput,
  MemoryCategory,
  MemoryCorrection,
  ProactiveHistoryItem,
  RecentMemory,
  UpdateMemoryInput,
  UserMemory
} from '../types/memory'

export function formatSinceParam(date: Date, offsetSeconds = 0): string {
  const adjusted = new Date(date.getTime() + offsetSeconds * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${adjusted.getFullYear()}-${pad(adjusted.getMonth() + 1)}-${pad(adjusted.getDate())}T${pad(adjusted.getHours())}:${pad(adjusted.getMinutes())}:${pad(adjusted.getSeconds())}`
}

export function fetchMemories(category?: MemoryCategory) {
  const query = category ? `?category=${encodeURIComponent(category)}` : ''
  return apiFetch<UserMemory[]>(`/api/v1/memories${query}`)
}

export function fetchRecentMemories(since: string) {
  return apiFetch<RecentMemory[]>(
    `/api/v1/memories/recent?since=${encodeURIComponent(since)}`
  )
}

export function fetchMemoryCorrections(limit = 10, offset = 0) {
  return apiFetch<MemoryCorrection[]>(
    `/api/v1/memories/corrections?limit=${limit}&offset=${offset}`
  )
}

export function fetchProactiveHistory(limit = 10, offset = 0) {
  return apiFetch<ProactiveHistoryItem[]>(
    `/api/v1/proactive/history?limit=${limit}&offset=${offset}`
  )
}

export function createMemory(input: CreateMemoryInput) {
  return apiFetch<UserMemory>('/api/v1/memories', {
    method: 'POST',
    body: JSON.stringify(input)
  })
}

export function updateMemory(memoryId: string, input: UpdateMemoryInput) {
  return apiFetch<UserMemory>(`/api/v1/memories/${memoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(input)
  })
}

export function deleteMemory(memoryId: string) {
  return apiFetch<void>(`/api/v1/memories/${memoryId}`, {
    method: 'DELETE'
  })
}
