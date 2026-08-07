import { apiFetch, resolveApiUrl } from '../lib/http'
import { getAccessToken } from '../auth/authStorage'
import type { KnowledgeDocument } from '../types/knowledge'

export function listKnowledgeDocuments(limit = 50) {
  return apiFetch<KnowledgeDocument[]>(
    `/api/v1/skills/knowledge/documents?limit=${encodeURIComponent(String(limit))}`,
    { method: 'GET' }
  )
}

export async function uploadKnowledgeDocument(file: File) {
  const token = getAccessToken()
  const formData = new FormData()
  formData.append('file', file)

  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(resolveApiUrl('/api/v1/skills/knowledge/documents'), {
    method: 'POST',
    headers,
    body: formData
  })

  const rawBody = await response.text()
  const payload = JSON.parse(rawBody) as {
    code: number
    message: string
    data: KnowledgeDocument
  }
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || `上传失败: HTTP ${response.status}`)
  }
  return payload
}

export function deleteKnowledgeDocument(id: number) {
  return apiFetch<void>(`/api/v1/skills/knowledge/documents/${encodeURIComponent(String(id))}`, {
    method: 'DELETE'
  })
}
