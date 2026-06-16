/**
 * Normalize LLM markdown so fenced code blocks parse reliably.
 */
export function normalizeChatMarkdown(content: string): string {
  if (!content) {
    return ''
  }

  let normalized = content.replace(/\r\n/g, '\n')

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
