/**
 * Mini-conversation projection: reduce a pulled history page to the text
 * user/assistant rows the side-task panel renders. Tool calls, context
 * injections, and other surface events are intentionally ignored — the panel
 * is a compact task scratchpad, not the full transcript.
 *
 * Event shapes follow the durable JSONL log: a `user/message` carries its
 * content blocks directly under `data.content`; an `assistant/message`
 * carries them under `data.message.content`. Both `data.content` and
 * `data.message.content` variants are tolerated for each type so the reader
 * stays robust against log-format evolution.
 */
import type { HistoryEntry } from '@deepseek-ai/dsh-api-remotes/client'

/** One text row of the mini conversation. */
export interface TaskMessageRow {
  role: 'user' | 'assistant'
  text: string
}

/** Text blocks of a message (ContentBlock text parts under either key). */
function messageText(data: unknown): string {
  if (typeof data !== 'object' || data === null) return ''
  const record = data as Record<string, unknown>
  const content = Array.isArray(record.content)
    ? record.content
    : typeof record.message === 'object' && record.message !== null
      ? (record.message as Record<string, unknown>).content
      : undefined
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { type?: string; text?: unknown } => typeof block === 'object' && block !== null)
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
}

/**
 * Extract user/assistant text rows from a history page, in log order. Empty
 * text rows are dropped.
 * @param entries - pulled history entries, or undefined while none are loaded.
 * @returns the ordered text rows.
 */
export function taskMessageRows(entries: readonly HistoryEntry[] | undefined): TaskMessageRow[] {
  if (entries === undefined) return []
  const rows: TaskMessageRow[] = []
  for (const entry of entries) {
    if (entry.event.type === 'user/message') {
      const text = messageText(entry.event.data)
      if (text !== '') rows.push({ role: 'user', text })
    } else if (entry.event.type === 'assistant/message') {
      const text = messageText(entry.event.data)
      if (text !== '') rows.push({ role: 'assistant', text })
    }
  }
  return rows
}

/**
 * Extract the task's OWN message rows, hiding the forked seed context: the
 * side task carries the owner's full history in its log, but the panel is a
 * scratchpad — it shows only messages written after the task's OWN seed
 * boundary. The boundary is the LAST `session/end-seed`: the seed may itself
 * nest earlier end-seed markers (the owner was resumed or forked before),
 * and only the task's own marker sits after all seeded messages. A page that
 * does not reach the boundary (a task with more messages than one page)
 * falls back to the whole page.
 * @param entries - pulled history entries, or undefined while none are loaded.
 * @returns the ordered text rows of the task's own conversation.
 */
export function taskOwnMessageRows(entries: readonly HistoryEntry[] | undefined): TaskMessageRow[] {
  if (entries === undefined) return []
  let seedBoundary: number | undefined
  for (const entry of entries) {
    if (entry.event.type === 'session/end-seed') {
      seedBoundary = entry.event.seq
    }
  }
  const own = seedBoundary === undefined
    ? entries
    : entries.filter(entry => entry.event.seq > seedBoundary)
  return taskMessageRows(own)
}
