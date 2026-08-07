export type KnowledgeDocumentStatus = 'UPLOADED' | 'INDEXING' | 'READY' | 'FAILED'

export interface KnowledgeDocument {
  id: number
  userId: number
  filename: string
  contentType: string
  storageKey: string
  status: KnowledgeDocumentStatus
  chunkCount: number
  errorMessage: string | null
  createdAt: string | null
  updatedAt: string | null
}

