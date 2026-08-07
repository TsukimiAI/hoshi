import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  uploadKnowledgeDocument
} from '../api/knowledge'
import type { KnowledgeDocument } from '../types/knowledge'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const SUPPORTED_EXTENSIONS = new Set(['md', 'txt', 'pdf'])
const POLL_INTERVAL_MS = 3000

function statusLabel(status: KnowledgeDocument['status']): string {
  switch (status) {
    case 'UPLOADED':
      return '已上传'
    case 'INDEXING':
      return '索引中'
    case 'READY':
      return '可检索'
    case 'FAILED':
      return '失败'
    default:
      return status
  }
}

function resolveExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 0 || dot === filename.length - 1) {
    return ''
  }
  return filename.slice(dot + 1).trim().toLowerCase()
}

function isSupportedKnowledgeFile(file: File): boolean {
  return SUPPORTED_EXTENSIONS.has(resolveExtension(file.name))
}

export function KnowledgeSettingsSection(): React.JSX.Element {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [docs, setDocs] = useState<KnowledgeDocument[]>([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canLoad = Boolean(user?.id)

  const load = useCallback(
    async (silent = false): Promise<void> => {
      if (!user?.id) {
        return
      }
      if (!silent) {
        setLoading(true)
      }
      setError(null)
      try {
        const payload = await listKnowledgeDocuments(100)
        setDocs(payload.data ?? [])
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : '加载失败')
        }
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [user?.id]
  )

  useEffect(() => {
    void load()
  }, [load])

  const hasIndexing = useMemo(() => docs.some((doc) => doc.status === 'INDEXING'), [docs])

  useEffect(() => {
    if (!hasIndexing) {
      return
    }
    const timer = window.setInterval(() => {
      void load(true)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [hasIndexing, load])

  const sorted = useMemo(() => {
    return [...docs].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  }, [docs])

  const handleUploadFile = async (file: File): Promise<void> => {
    setError(null)
    setInfo(null)

    if (!isSupportedKnowledgeFile(file)) {
      setError('仅支持 md、txt、pdf 格式')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('文件大小不能超过 20MB')
      return
    }

    setUploading(true)
    try {
      await uploadKnowledgeDocument(file)
      setInfo(`已上传「${file.name}」，正在索引…`)
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    void handleUploadFile(file)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) {
      return
    }
    void handleUploadFile(file)
  }

  const handleDelete = async (doc: KnowledgeDocument): Promise<void> => {
    if (!window.confirm(`确定删除「${doc.filename}」吗？`)) {
      return
    }
    setError(null)
    setInfo(null)
    setDeletingId(doc.id)
    try {
      await deleteKnowledgeDocument(doc.id)
      setInfo(`已删除「${doc.filename}」`)
      await load(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="settings-card">
      <h2>知识库</h2>
      <p className="settings-card__hint">
        上传 md、txt、pdf 文档（最大 20MB），索引完成后可在对话中检索。拖拽文件到下方区域，或点击选择文件。
      </p>

      {!user ? <p>登录后可管理知识库文档。</p> : null}

      {user ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setDragActive(false)
          }}
          onDrop={handleDrop}
          style={{
            marginTop: '0.75rem',
            padding: '1.25rem',
            border: `1px dashed ${dragActive ? 'var(--hoshi-accent)' : 'var(--hoshi-border)'}`,
            borderRadius: 'var(--hoshi-radius-sm)',
            background: dragActive ? 'var(--hoshi-surface-muted, rgba(0,0,0,0.03))' : 'transparent',
            textAlign: 'center',
            cursor: uploading ? 'not-allowed' : 'pointer'
          }}
        >
          <p style={{ margin: 0, color: 'var(--hoshi-text-subtle)' }}>
            {uploading ? '上传中…' : '拖拽文件到此处，或点击选择文件'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.pdf,text/plain,text/markdown,application/pdf"
            hidden
            disabled={uploading}
            onChange={handleFileInputChange}
          />
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1rem' }}>
        <button
          type="button"
          className="settings-btn settings-btn--primary"
          onClick={() => void load()}
          disabled={!canLoad || loading || uploading}
        >
          {loading ? '刷新中…' : '刷新列表'}
        </button>
        {error ? <span style={{ color: 'var(--hoshi-danger)' }}>{error}</span> : null}
        {!error && info ? <span style={{ color: 'var(--hoshi-text-subtle)' }}>{info}</span> : null}
      </div>

      <div style={{ marginTop: '1rem' }}>
        {sorted.length === 0 ? (
          <p style={{ color: 'var(--hoshi-text-subtle)' }}>暂无文档</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {sorted.map((doc) => (
              <div
                key={doc.id}
                style={{
                  border: '1px solid var(--hoshi-border)',
                  borderRadius: 'var(--hoshi-radius-sm)',
                  padding: '0.75rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doc.filename}
                    </strong>
                    <small style={{ color: 'var(--hoshi-text-subtle)' }}>
                      状态：{statusLabel(doc.status)} · chunks：{doc.chunkCount}
                      {doc.updatedAt ? ` · 更新：${doc.updatedAt}` : ''}
                    </small>
                    {doc.status === 'FAILED' && doc.errorMessage ? (
                      <div style={{ marginTop: '0.35rem', color: 'var(--hoshi-danger)', fontSize: '0.82rem' }}>
                        {doc.errorMessage}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="settings-btn"
                    onClick={() => void handleDelete(doc)}
                    disabled={deletingId === doc.id || uploading}
                  >
                    {deletingId === doc.id ? '删除中…' : '删除'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export { isSupportedKnowledgeFile, resolveExtension, MAX_UPLOAD_BYTES }
