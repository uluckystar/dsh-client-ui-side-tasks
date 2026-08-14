/**
 * Mini-conversation projection: the history-page reader tolerates both event
 * shapes (user/message data.content direct, assistant/message
 * data.message.content), drops non-text blocks and non-message events, and
 * keeps the wire order.
 */
import { describe, expect, it } from 'vitest'
import type { HistoryEntry } from '@deepseek-ai/dsh-api-remotes/client'
import { taskMessageRows, taskOwnMessageRows } from '../src/client/messages.ts'

const entry = (type: string, data: unknown, seq = 1): HistoryEntry =>
  ({ event: { type, seq, time: seq, data } }) as never

describe('taskMessageRows', () => {
  it('returns an empty list while no page is loaded', () => {
    expect(taskMessageRows(undefined)).toEqual([])
  })

  it('extracts user text from data.content (direct shape)', () => {
    const rows = taskMessageRows([
      entry('user/message', { content: [{ type: 'text', text: 'hello' }] }),
    ])
    expect(rows).toEqual([{ role: 'user', text: 'hello' }])
  })

  it('extracts user text from data.message.content (message-wrapped shape)', () => {
    const rows = taskMessageRows([
      entry('user/message', { message: { content: [{ type: 'text', text: 'wrapped' }] } }),
    ])
    expect(rows).toEqual([{ role: 'user', text: 'wrapped' }])
  })

  it('extracts assistant text from data.message.content (log shape)', () => {
    const rows = taskMessageRows([
      entry('assistant/message', { message: { content: [{ type: 'text', text: 'hi there' }] } }),
    ])
    expect(rows).toEqual([{ role: 'assistant', text: 'hi there' }])
  })

  it('extracts assistant text from data.content (direct shape)', () => {
    const rows = taskMessageRows([
      entry('assistant/message', { content: [{ type: 'text', text: 'direct' }] }),
    ])
    expect(rows).toEqual([{ role: 'assistant', text: 'direct' }])
  })

  it('joins multiple text blocks of one message', () => {
    const rows = taskMessageRows([
      entry('user/message', { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }),
    ])
    expect(rows).toEqual([{ role: 'user', text: 'ab' }])
  })

  it('ignores non-text content blocks (image, reasoning, tool-call)', () => {
    const rows = taskMessageRows([
      entry('user/message', { content: [{ type: 'image', attachment: {} }, { type: 'text', text: 'keep' }] }),
      entry('assistant/message', { message: { content: [{ type: 'reasoning', text: 'think' }, { type: 'tool-call', id: 'c1', name: 'bash', arguments: '{}' }] } }),
    ])
    expect(rows).toEqual([{ role: 'user', text: 'keep' }])
  })

  it('drops messages with no text blocks', () => {
    const rows = taskMessageRows([
      entry('user/message', { content: [{ type: 'image', attachment: {} }] }),
      entry('assistant/message', { message: { content: [] } }),
    ])
    expect(rows).toEqual([])
  })

  it('drops messages whose data is not an object or has no content array', () => {
    const rows = taskMessageRows([
      entry('user/message', null),
      entry('assistant/message', { message: { content: 'not-an-array' } }),
      entry('user/message', { message: { content: undefined } }),
      entry('assistant/message', { unrelated: true }),
    ])
    expect(rows).toEqual([])
  })

  it('ignores non-message events while keeping message order', () => {
    const rows = taskMessageRows([
      entry('turn/start', { turn: 1 }),
      entry('user/message', { content: [{ type: 'text', text: 'first' }] }),
      entry('tool/call', { name: 'bash' }),
      entry('assistant/message', { message: { content: [{ type: 'text', text: 'second' }] } }),
    ])
    expect(rows).toEqual([
      { role: 'user', text: 'first' },
      { role: 'assistant', text: 'second' },
    ])
  })
})

describe('taskOwnMessageRows (seed-hidden)', () => {
  it('hides the forked seed history behind the session/end-seed boundary', () => {
    const entries = [
      entry('user/message', { content: [{ type: 'text', text: 'seed prompt' }] }, 1),
      entry('assistant/message', { message: { content: [{ type: 'text', text: 'seed reply' }] } }, 2),
      entry('session/end-seed', {}, 3),
      entry('user/message', { content: [{ type: 'text', text: 'task prompt' }] }, 4),
      entry('assistant/message', { message: { content: [{ type: 'text', text: 'task reply' }] } }, 5),
    ]
    expect(taskOwnMessageRows(entries)).toEqual([
      { role: 'user', text: 'task prompt' },
      { role: 'assistant', text: 'task reply' },
    ])
  })

  it('falls back to the whole page when the seed boundary is not in the page', () => {
    const entries = [
      entry('user/message', { content: [{ type: 'text', text: 'a' }] }, 1),
      entry('assistant/message', { message: { content: [{ type: 'text', text: 'b' }] } }, 2),
    ]
    expect(taskOwnMessageRows(entries)).toEqual([
      { role: 'user', text: 'a' },
      { role: 'assistant', text: 'b' },
    ])
  })

  it('returns an empty list while no page is loaded', () => {
    expect(taskOwnMessageRows(undefined)).toEqual([])
  })
})
