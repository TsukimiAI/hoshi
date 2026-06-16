import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import * as memoryApi from '../api/memory'
import { useMemory } from '../memory/MemoryContext'
import {
  LONG_MEMORY_CATEGORIES,
  LONG_MEMORY_CATEGORY_LABELS,
  MEMORY_CATEGORY_LABELS,
  SHORT_MEMORY_CATEGORIES,
  SHORT_MEMORY_CATEGORY_LABELS,
  type CreateMemoryInput,
  type HistoryFilter,
  type LongMemoryCategory,
  type MemoryCorrection,
  type MemoryPanelSection,
  type ProactiveHistoryItem,
  type ShortMemoryCategory,
  type UserMemory
} from '../types/memory'

interface MemoryFormState {
  content: string
  category: LongMemoryCategory
  alwaysPinned: boolean
}

const EMPTY_FORM: MemoryFormState = {
  content: '',
  category: 'preference',
  alwaysPinned: false
}

const PAGE_SIZE = 10

const SECTION_LABELS: Record<MemoryPanelSection, string> = {
  long: '长期',
  short: '短期',
  history: '最近动态'
}

const HISTORY_FILTER_LABELS: Record<HistoryFilter, string> = {
  all: '全部',
  proactive: '主动消息',
  correction: '记忆更正'
}

type HistoryEntry =
  | { kind: 'proactive'; at: string; item: ProactiveHistoryItem }
  | { kind: 'correction'; at: string; item: MemoryCorrection }

function formatMemoryTime(value: string): string {
  const updatedAt = new Date(value)
  if (Number.isNaN(updatedAt.getTime())) {
    return value
  }

  const diffMs = Date.now() - updatedAt.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return '刚刚'
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} 天前`

  return updatedAt.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric'
  })
}

function formatSourceType(sourceType: string): string {
  if (sourceType === 'memory') return '记忆触发'
  if (sourceType === 'open_loop') return '未完结话题'
  return sourceType
}

function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

function totalPages(count: number, pageSize: number): number {
  return Math.max(1, Math.ceil(count / pageSize))
}

function buildHistoryEntries(
  proactiveHistory: ProactiveHistoryItem[],
  corrections: MemoryCorrection[],
  filter: HistoryFilter
): HistoryEntry[] {
  if (filter === 'proactive') {
    return proactiveHistory.map((item) => ({ kind: 'proactive', at: item.createdAt, item }))
  }
  if (filter === 'correction') {
    return corrections.map((item) => ({ kind: 'correction', at: item.occurredAt, item }))
  }

  const merged: HistoryEntry[] = [
    ...proactiveHistory.map((item) => ({ kind: 'proactive' as const, at: item.createdAt, item })),
    ...corrections.map((item) => ({ kind: 'correction' as const, at: item.occurredAt, item }))
  ]
  return merged.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
}

function MemoryPagination({
  page,
  pageSize,
  totalItems,
  hasNext,
  onPageChange
}: {
  page: number
  pageSize: number
  onPageChange: (page: number) => void
} & (
  | { totalItems: number; hasNext?: never }
  | { totalItems?: never; hasNext: boolean }
)): React.JSX.Element | null {
  if (totalItems != null) {
    const pages = totalPages(totalItems, pageSize)
    if (pages <= 1) {
      return null
    }

    const safePage = Math.min(Math.max(page, 1), pages)

    return (
      <nav className="memory-panel__pagination" aria-label="分页">
        <button type="button" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
          上一页
        </button>
        <span>
          第 {safePage} / {pages} 页
        </span>
        <button
          type="button"
          disabled={safePage >= pages}
          onClick={() => onPageChange(safePage + 1)}
        >
          下一页
        </button>
      </nav>
    )
  }

  if (page <= 1 && !hasNext) {
    return null
  }

  return (
    <nav className="memory-panel__pagination" aria-label="分页">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        上一页
      </button>
      <span>第 {page} 页</span>
      <button type="button" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
        下一页
      </button>
    </nav>
  )
}

function MemoryListSection({
  hint,
  items,
  memoryById,
  supersededBy,
  editable,
  onEdit,
  onDelete,
  onTogglePin
}: {
  hint: string
  items: UserMemory[]
  memoryById: Map<string, UserMemory>
  supersededBy: Map<string, string>
  editable: boolean
  onEdit?: (memory: UserMemory) => void
  onDelete: (memory: UserMemory) => Promise<void>
  onTogglePin?: (memory: UserMemory) => Promise<void>
}): React.JSX.Element {
  return (
    <section className="memory-panel__section">
      <p className="memory-panel__section-hint">{hint}</p>
      {items.length === 0 ? (
        <p className="memory-panel__status">当前筛选下暂无记忆。</p>
      ) : (
        items.map((memory) => {
          const supersededContent = memory.supersedesMemoryId
            ? memoryById.get(memory.supersedesMemoryId)?.content
            : null
          const replacedBy = supersededBy.get(memory.id)

          return (
            <article key={memory.id} className="memory-item">
              <div className="memory-item__main">
                <div className="memory-item__title-row">
                  {memory.alwaysPinned ? <span className="memory-item__pin">📌</span> : null}
                  {memory.supersedesMemoryId ? (
                    <span className="memory-item__badge memory-item__badge--updated">已更新</span>
                  ) : null}
                  {replacedBy ? (
                    <span className="memory-item__badge memory-item__badge--replaced">已被替代</span>
                  ) : null}
                  <p className="memory-item__content">{memory.content}</p>
                </div>
                <p className="memory-item__meta">
                  {MEMORY_CATEGORY_LABELS[memory.category]} · {formatMemoryTime(memory.createdAt)}
                </p>
                {supersededContent ? (
                  <p className="memory-item__trace">替代了：{supersededContent}</p>
                ) : memory.supersedesMemoryId && !supersededContent ? (
                  <p className="memory-item__trace">替代了较早的一条记忆</p>
                ) : null}
                {replacedBy ? (
                  <p className="memory-item__trace">当前有效记忆：{replacedBy}</p>
                ) : null}
              </div>
              <div className="memory-item__actions">
                {editable && onTogglePin ? (
                  <button type="button" onClick={() => void onTogglePin(memory)}>
                    {memory.alwaysPinned ? '取消固定' : '固定'}
                  </button>
                ) : null}
                {editable && onEdit ? (
                  <button type="button" onClick={() => onEdit(memory)}>
                    编辑
                  </button>
                ) : null}
                <button type="button" onClick={() => void onDelete(memory)}>
                  删除
                </button>
              </div>
            </article>
          )
        })
      )}
    </section>
  )
}

function MemoryHistorySection({
  entries,
  filter,
  onFilterChange
}: {
  entries: HistoryEntry[]
  filter: HistoryFilter
  onFilterChange: (filter: HistoryFilter) => void
}): React.JSX.Element {
  return (
    <section className="memory-panel__section">
      <p className="memory-panel__section-hint">
        星奈主动开口与记忆更正的记录，方便你了解「为什么这么说」。
      </p>
      <div className="memory-panel__section-filters" role="tablist" aria-label="最近动态筛选">
        {(Object.keys(HISTORY_FILTER_LABELS) as HistoryFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? 'is-active' : ''}
            onClick={() => onFilterChange(value)}
          >
            {HISTORY_FILTER_LABELS[value]}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <p className="memory-panel__status">当前筛选下暂无记录。</p>
      ) : (
        entries.map((entry) => {
          if (entry.kind === 'proactive') {
            const item = entry.item
            return (
              <article key={`proactive-${item.id}`} className="memory-history-item">
                <p className="memory-history-item__label">主动消息 · {formatSourceType(item.sourceType)}</p>
                <p className="memory-history-item__content">{item.content}</p>
                <p className="memory-history-item__meta">{formatMemoryTime(item.createdAt)}</p>
              </article>
            )
          }

          const item = entry.item
          return (
            <article key={`correction-${item.id}`} className="memory-history-item">
              <p className="memory-history-item__label">
                {item.action === 'supersede' ? '记忆更新' : '记忆归档'}
              </p>
              <p className="memory-history-item__content">{item.content}</p>
              {item.supersededContent ? (
                <p className="memory-history-item__trace">原内容：{item.supersededContent}</p>
              ) : null}
              <p className="memory-history-item__meta">{formatMemoryTime(item.occurredAt)}</p>
            </article>
          )
        })
      )}
    </section>
  )
}

export function MemoryPanel(): React.JSX.Element {
  const { user } = useAuth()
  const {
    memories,
    loading,
    error,
    setCategoryFilter,
    createMemory,
    updateMemory,
    removeMemory
  } = useMemory()
  const [activeSection, setActiveSection] = useState<MemoryPanelSection>('long')
  const [longCategory, setLongCategory] = useState<LongMemoryCategory | null>(null)
  const [shortCategory, setShortCategory] = useState<ShortMemoryCategory | null>(null)
  const [longPage, setLongPage] = useState(1)
  const [shortPage, setShortPage] = useState(1)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [historyHasNext, setHistoryHasNext] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingMemory, setEditingMemory] = useState<UserMemory | null>(null)
  const [form, setForm] = useState<MemoryFormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setCategoryFilter(null)
  }, [setCategoryFilter])

  useEffect(() => {
    setLongPage(1)
  }, [longCategory])

  useEffect(() => {
    setShortPage(1)
  }, [shortCategory])

  useEffect(() => {
    setHistoryPage(1)
  }, [historyFilter])

  const loadHistoryPage = useCallback(async (): Promise<void> => {
    if (!user) {
      setHistoryEntries([])
      setHistoryHasNext(false)
      return
    }

    setHistoryLoading(true)
    try {
      if (historyFilter === 'proactive') {
        const offset = (historyPage - 1) * PAGE_SIZE
        const res = await memoryApi.fetchProactiveHistory(PAGE_SIZE, offset)
        const entries = buildHistoryEntries(res.data, [], 'proactive')
        setHistoryEntries(entries)
        setHistoryHasNext(res.data.length === PAGE_SIZE)
        return
      }

      if (historyFilter === 'correction') {
        const offset = (historyPage - 1) * PAGE_SIZE
        const res = await memoryApi.fetchMemoryCorrections(PAGE_SIZE, offset)
        const entries = buildHistoryEntries([], res.data, 'correction')
        setHistoryEntries(entries)
        setHistoryHasNext(res.data.length === PAGE_SIZE)
        return
      }

      const fetchSize = historyPage * PAGE_SIZE
      const [proactiveRes, correctionRes] = await Promise.all([
        memoryApi.fetchProactiveHistory(fetchSize, 0),
        memoryApi.fetchMemoryCorrections(fetchSize, 0)
      ])
      const merged = buildHistoryEntries(proactiveRes.data, correctionRes.data, 'all')
      const pageItems = paginate(merged, historyPage, PAGE_SIZE)
      setHistoryEntries(pageItems)
      setHistoryHasNext(
        pageItems.length === PAGE_SIZE &&
          (proactiveRes.data.length === fetchSize || correctionRes.data.length === fetchSize)
      )
    } catch {
      setHistoryEntries([])
      setHistoryHasNext(false)
    } finally {
      setHistoryLoading(false)
    }
  }, [historyFilter, historyPage, user])

  useEffect(() => {
    if (activeSection !== 'history') {
      return
    }
    void loadHistoryPage()
  }, [activeSection, loadHistoryPage])

  const longMemories = useMemo(
    () => memories.filter((memory) => memory.memoryType === 'long'),
    [memories]
  )
  const shortMemories = useMemo(
    () => memories.filter((memory) => memory.memoryType === 'short'),
    [memories]
  )

  const filteredLongMemories = useMemo(
    () =>
      longCategory
        ? longMemories.filter((memory) => memory.category === longCategory)
        : longMemories,
    [longCategory, longMemories]
  )
  const filteredShortMemories = useMemo(
    () =>
      shortCategory
        ? shortMemories.filter((memory) => memory.category === shortCategory)
        : shortMemories,
    [shortCategory, shortMemories]
  )

  const longPageItems = useMemo(
    () => paginate(filteredLongMemories, longPage, PAGE_SIZE),
    [filteredLongMemories, longPage]
  )
  const shortPageItems = useMemo(
    () => paginate(filteredShortMemories, shortPage, PAGE_SIZE),
    [filteredShortMemories, shortPage]
  )
  const longTotalPages = totalPages(filteredLongMemories.length, PAGE_SIZE)
  const shortTotalPages = totalPages(filteredShortMemories.length, PAGE_SIZE)

  useEffect(() => {
    if (longPage > longTotalPages) {
      setLongPage(longTotalPages)
    }
  }, [longPage, longTotalPages])

  useEffect(() => {
    if (shortPage > shortTotalPages) {
      setShortPage(shortTotalPages)
    }
  }, [shortPage, shortTotalPages])

  const memoryById = useMemo(() => {
    const map = new Map<string, UserMemory>()
    for (const memory of memories) {
      map.set(memory.id, memory)
    }
    return map
  }, [memories])

  const supersededBy = useMemo(() => {
    const map = new Map<string, string>()
    for (const memory of memories) {
      if (memory.supersedesMemoryId) {
        const target = memoryById.get(memory.supersedesMemoryId)
        if (target) {
          map.set(memory.supersedesMemoryId, memory.content)
        }
      }
    }
    return map
  }, [memories, memoryById])

  const openCreateForm = (): void => {
    setEditingMemory(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setFormOpen(true)
  }

  const openEditForm = (memory: UserMemory): void => {
    if (memory.memoryType !== 'long') {
      return
    }
    setEditingMemory(memory)
    setForm({
      content: memory.content,
      category: memory.category as LongMemoryCategory,
      alwaysPinned: memory.alwaysPinned
    })
    setFormError(null)
    setFormOpen(true)
  }

  const closeForm = (): void => {
    setFormOpen(false)
    setEditingMemory(null)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const content = form.content.trim()
    if (!content) {
      setFormError('记忆内容不能为空')
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      const input: CreateMemoryInput = {
        content,
        category: form.category,
        alwaysPinned: form.alwaysPinned
      }
      if (editingMemory) {
        await updateMemory(editingMemory.id, input)
      } else {
        await createMemory(input)
      }
      closeForm()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '保存失败了…')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (memory: UserMemory): Promise<void> => {
    if (!window.confirm('确定要删除这条记忆吗？')) {
      return
    }
    try {
      await removeMemory(memory.id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败了…')
    }
  }

  const handleTogglePin = async (memory: UserMemory): Promise<void> => {
    try {
      await updateMemory(memory.id, { alwaysPinned: !memory.alwaysPinned })
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '更新失败了…')
    }
  }

  const longPagination =
    user && !loading && !error && activeSection === 'long' ? (
      <MemoryPagination
        page={longPage}
        pageSize={PAGE_SIZE}
        totalItems={filteredLongMemories.length}
        onPageChange={setLongPage}
      />
    ) : null

  const shortPagination =
    user && !loading && !error && activeSection === 'short' ? (
      <MemoryPagination
        page={shortPage}
        pageSize={PAGE_SIZE}
        totalItems={filteredShortMemories.length}
        onPageChange={setShortPage}
      />
    ) : null

  const historyPagination =
    user && activeSection === 'history' && !historyLoading ? (
      <MemoryPagination
        page={historyPage}
        pageSize={PAGE_SIZE}
        hasNext={historyHasNext}
        onPageChange={setHistoryPage}
      />
    ) : null

  const footerPagination = longPagination ?? shortPagination ?? historyPagination

  return (
    <div className="memory-panel">
      <div className="memory-panel__tabs">
        {(Object.keys(SECTION_LABELS) as MemoryPanelSection[]).map((section) => (
          <button
            key={section}
            type="button"
            className={activeSection === section ? 'active' : ''}
            onClick={() => setActiveSection(section)}
          >
            {SECTION_LABELS[section]}
          </button>
        ))}
        {activeSection === 'long' ? (
          <button
            type="button"
            className="memory-panel__add-btn"
            onClick={openCreateForm}
            disabled={!user}
          >
            + 添加
          </button>
        ) : null}
      </div>

      <div className="memory-panel__body">
        <div className="memory-panel__scroll">
          {!user ? (
            <p className="memory-panel__status">登录后查看记忆</p>
          ) : loading && activeSection !== 'history' ? (
            <p className="memory-panel__status">正在加载记忆…</p>
          ) : error && activeSection !== 'history' ? (
            <p className="memory-panel__status memory-panel__status--error">{error}</p>
          ) : activeSection === 'long' ? (
            <>
              <div className="memory-panel__section-filters" role="tablist" aria-label="长期记忆分类">
                <button
                  type="button"
                  role="tab"
                  aria-selected={longCategory === null}
                  className={longCategory === null ? 'is-active' : ''}
                  onClick={() => setLongCategory(null)}
                >
                  全部
                </button>
                {LONG_MEMORY_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={longCategory === category}
                    className={longCategory === category ? 'is-active' : ''}
                    onClick={() => setLongCategory(category)}
                  >
                    {LONG_MEMORY_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
              <MemoryListSection
                hint="星奈会长期记住这些关于你的事实。"
                items={longPageItems}
                memoryById={memoryById}
                supersededBy={supersededBy}
                editable
                onEdit={openEditForm}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
              />
            </>
          ) : activeSection === 'short' ? (
            <>
              <div className="memory-panel__section-filters" role="tablist" aria-label="短期记忆分类">
                <button
                  type="button"
                  role="tab"
                  aria-selected={shortCategory === null}
                  className={shortCategory === null ? 'is-active' : ''}
                  onClick={() => setShortCategory(null)}
                >
                  全部
                </button>
                {SHORT_MEMORY_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={shortCategory === category}
                    className={shortCategory === category ? 'is-active' : ''}
                    onClick={() => setShortCategory(category)}
                  >
                    {SHORT_MEMORY_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
              <MemoryListSection
                hint="近期聊到的计划、情绪和关注点，会随时间自然淡化。"
                items={shortPageItems}
                memoryById={memoryById}
                supersededBy={supersededBy}
                editable={false}
                onDelete={handleDelete}
              />
            </>
          ) : historyLoading ? (
            <p className="memory-panel__status">正在加载最近动态…</p>
          ) : (
            <MemoryHistorySection
              entries={historyEntries}
              filter={historyFilter}
              onFilterChange={setHistoryFilter}
            />
          )}
        </div>
        {footerPagination ? (
          <div className="memory-panel__footer">{footerPagination}</div>
        ) : null}
      </div>

      {formOpen ? (
        <div className="memory-form-overlay" role="presentation" onClick={closeForm}>
          <form
            className="memory-form"
            onSubmit={(event) => void handleSubmit(event)}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{editingMemory ? '编辑记忆' : '添加长期记忆'}</h3>
            <label className="memory-form__field">
              <span>内容</span>
              <textarea
                rows={4}
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                maxLength={500}
                placeholder="例如：我更喜欢后端开发"
              />
            </label>
            <label className="memory-form__field">
              <span>分类</span>
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    category: event.target.value as LongMemoryCategory
                  }))
                }
              >
                {LONG_MEMORY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {LONG_MEMORY_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label className="memory-form__checkbox">
              <input
                type="checkbox"
                checked={form.alwaysPinned}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, alwaysPinned: event.target.checked }))
                }
              />
              <span>固定这条记忆</span>
            </label>
            {formError ? <p className="memory-form__error">{formError}</p> : null}
            <div className="memory-form__actions">
              <button type="button" onClick={closeForm} disabled={submitting}>
                取消
              </button>
              <button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
