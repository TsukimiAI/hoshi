const SECTION_TITLE_SUFFIX =
  /(?:概念|方法|步骤|示例|总结|介绍|说明|原理|特点|优势|注意|要点|流程|用法|定义)$/

/**
 * Normalize LLM markdown so lists, headings, and fenced code blocks parse reliably.
 */
export function normalizeChatMarkdown(content: string): string {
  if (!content) {
    return ''
  }

  let normalized = content.replace(/\r\n/g, '\n')
  normalized = transformOutsideCodeFences(normalized, normalizeMarkdownBody)
  normalized = normalizeCodeFences(normalized)

  return normalized
}

function normalizeMarkdownBody(content: string): string {
  let normalized = content

  normalized = normalizeBoldSectionTitles(normalized)
  normalized = normalizeInlineOrderedLists(normalized)
  normalized = normalizeSectionTitlesBeforeLists(normalized)
  normalized = promoteStandaloneTitleLines(normalized)
  normalized = normalizeMarkdownHeaders(normalized)

  return normalized
}

function isSectionTitle(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length >= 2 && trimmed.length <= 20 && SECTION_TITLE_SUFFIX.test(trimmed)
}

function normalizeBoldSectionTitles(content: string): string {
  let normalized = content

  normalized = normalized.replace(/^\*\*([^*\n]{2,24})\*\*\s*$/gm, (match, title: string) => {
    if (!isSectionTitle(title)) {
      return match
    }
    return `### ${title.trim()}\n\n`
  })

  normalized = normalized.replace(
    /([。！？!?；;])(\s*)(\*\*([^*]+)\*\*)(\s*)(?=\n?\d+\.\s)/g,
    (match, ender, _spaces, _bold, title) => {
      if (!isSectionTitle(title)) {
        return match
      }
      return `${ender}\n\n### ${title.trim()}\n\n`
    }
  )

  normalized = normalized.replace(
    /([^\n*])(\*\*([^*]{2,20})\*\*)(\s*)(?=\n?\d+\.\s)/g,
    (match, before, _bold, title) => {
      if (!isSectionTitle(title)) {
        return match
      }
      return `${before}\n\n### ${title.trim()}\n\n`
    }
  )

  return normalized
}

function transformOutsideCodeFences(content: string, transform: (segment: string) => string): string {
  const parts = content.split(/(```[\s\S]*?```)/g)
  return parts.map((part, index) => (index % 2 === 1 ? part : transform(part))).join('')
}

function normalizeInlineOrderedLists(content: string): string {
  let normalized = content

  // "...。2. 下一步" — list item glued after a sentence ender.
  normalized = normalized.replace(/([。！？!?；;])(\s*)(\d+\.\s)/g, '$1\n\n$3')

  // "通常是：1. 第一点" — list item glued after a colon introducer.
  normalized = normalized.replace(/([：:])(\s*)(\d+\.\s)/g, '$1\n\n$3')

  // "步骤 2. 编译" — inline numbered items separated by spaces in the same paragraph.
  normalized = normalized.replace(/([^\n\d])([ \t]+)(\d+\.\s)/g, '$1\n$3')

  return normalized
}

function normalizeSectionTitlesBeforeLists(content: string): string {
  return content.replace(
    /([。！？!?；;])(\s*)([^\n\d#。！？，,；;：:\n]{2,16})(?=\s+\d+\.\s)/g,
    (match, ender, _spaces, title) => {
      const trimmed = title.trim()
      if (!SECTION_TITLE_SUFFIX.test(trimmed)) {
        return match
      }
      return `${ender}\n\n### ${trimmed}\n\n`
    }
  )
}

function promoteStandaloneTitleLines(content: string): string {
  return content.replace(/^([^\n#*`>\-\d].{1,24})$\n(?=\S)/gm, (match, line: string) => {
    const title = line.trim()
    if (title.length < 2 || /[。！？，,；;：:、]/.test(title)) {
      return match
    }
    if (/^\d+\./.test(title)) {
      return match
    }
    if (!SECTION_TITLE_SUFFIX.test(title) && title.length > 12) {
      return match
    }
    if (/[的是了在有不很也]$/.test(title) && title.length > 8) {
      return match
    }
    return `### ${title}\n\n`
  })
}

function normalizeMarkdownHeaders(content: string): string {
  return content.replace(/([^\n#])(#{1,6}\s)/g, '$1\n\n$2')
}

function normalizeCodeFences(content: string): string {
  let normalized = content

  // Ensure opening ``` starts on its own line (CommonMark requirement).
  normalized = normalized.replace(/([^\n])([ \t]*```)/g, '$1\n\n$2')

  // Ensure language tag is followed by a newline before code body.
  normalized = normalized.replace(/```([a-zA-Z0-9+#.-]*)\s*(?=\S)/g, '```$1\n')

  return normalized
}

/**
 * During streaming, close an unterminated fence so preview renders as a code block.
 */
export function stabilizeStreamingMarkdown(content: string, streaming: boolean): string {
  const normalized = normalizeChatMarkdown(content)
  if (!streaming) {
    return normalized
  }

  const fenceCount = (normalized.match(/```/g) ?? []).length
  if (fenceCount % 2 === 1) {
    return `${normalized}\n\`\`\``
  }
  return normalized
}
