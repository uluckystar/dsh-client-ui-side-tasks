// @vitest-environment jsdom
/**
 * Side-task store and per-session persistence: state transitions (open,
 * collapsed, selected, collections, activity timestamps) and the localStorage
 * round-trip keyed by owner session. Persistence failures degrade to
 * in-memory without throwing.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSideTasksStore, loadTaskState, saveTaskState,
} from '../src/client/store.ts'

const sid = (s: string) => s as never

afterEach(() => {
  localStorage.clear()
})

describe('store', () => {
  it('starts closed, expanded, with no selection, collections, activity, or action error', () => {
    const store = createSideTasksStore()
    expect(store.getSnapshot()).toEqual({
      open: false,
      collapsed: false,
      selected: undefined,
      tasksBySession: {},
      lastActivity: {},
      actionError: null,
    })
  })

  it('records an action error and clears it through updates', () => {
    const store = createSideTasksStore()
    store.update(draft => { draft.actionError = 'session-not-found' })
    expect(store.getSnapshot()).toMatchObject({ actionError: 'session-not-found' })
    store.update(draft => { draft.actionError = null })
    expect(store.getSnapshot()).toMatchObject({ actionError: null })
  })

  it('records open/close/selection/collapse through updates', () => {
    const store = createSideTasksStore()
    store.update(draft => { draft.open = true })
    store.update(draft => { draft.selected = 'task-a' as never })
    store.update(draft => { draft.collapsed = true })
    expect(store.getSnapshot()).toMatchObject({
      open: true, selected: 'task-a', collapsed: true,
    })

    store.update(draft => { draft.open = false })
    store.update(draft => { draft.selected = undefined })
    store.update(draft => { draft.collapsed = false })
    expect(store.getSnapshot()).toMatchObject({
      open: false, selected: undefined, collapsed: false,
    })
  })

  it('notifies subscribers on every mutation', () => {
    const store = createSideTasksStore()
    const seen: boolean[] = []
    store.subscribe(() => { seen.push(true) })
    store.update(draft => { draft.open = true })
    store.update(draft => { draft.selected = 'task-a' as never })
    expect(seen).toEqual([true, true])
  })
})

describe('persistence', () => {
  it('round-trips a collection with activity timestamps under the owner session key', () => {
    saveTaskState(sid('owner-1'), ['task-a', 'task-b'] as never, { 'task-a': 1000, 'task-b': 2000 })
    expect(loadTaskState(sid('owner-1'))).toEqual({
      ids: ['task-a', 'task-b'],
      lastActivity: { 'task-a': 1000, 'task-b': 2000 },
    })
  })

  it('reads a legacy bare-id-array payload as ids without activity', () => {
    localStorage.setItem('dsh.side-tasks.legacy', JSON.stringify(['task-a', 'task-b']))
    expect(loadTaskState(sid('legacy'))).toEqual({ ids: ['task-a', 'task-b'], lastActivity: {} })
  })

  it('keeps owner sessions independent', () => {
    saveTaskState(sid('owner-1'), ['task-a'] as never, {})
    saveTaskState(sid('owner-2'), ['task-b', 'task-c'] as never, {})
    expect(loadTaskState(sid('owner-1')).ids).toEqual(['task-a'])
    expect(loadTaskState(sid('owner-2')).ids).toEqual(['task-b', 'task-c'])
  })

  it('returns empty values for an absent key', () => {
    expect(loadTaskState(sid('absent'))).toEqual({ ids: [], lastActivity: {} })
  })

  it('ignores a corrupt payload instead of throwing', () => {
    localStorage.setItem('dsh.side-tasks.corrupt', '{not json')
    expect(loadTaskState(sid('corrupt'))).toEqual({ ids: [], lastActivity: {} })
  })

  it('ignores a malformed payload and filters non-string entries', () => {
    localStorage.setItem('dsh.side-tasks.object', JSON.stringify({ a: 1 }))
    expect(loadTaskState(sid('object'))).toEqual({ ids: [], lastActivity: {} })
    localStorage.setItem('dsh.side-tasks.mixed', JSON.stringify({ ids: ['ok', 42, null], lastActivity: { nope: 'x' } }))
    expect(loadTaskState(sid('mixed'))).toEqual({ ids: ['ok'], lastActivity: {} })
  })

  it('survives a write followed by a fresh read (refresh recovery)', () => {
    saveTaskState(sid('owner-1'), ['task-a'] as never, { 'task-a': 42 })
    // Simulate a reload: a new store has no in-memory state; persistence is the source.
    expect(loadTaskState(sid('owner-1'))).toEqual({ ids: ['task-a'], lastActivity: { 'task-a': 42 } })
  })
})

describe('persistence edge shapes', () => {
  it('treats a non-object lastActivity as empty', () => {
    localStorage.setItem('dsh.side-tasks.bad-activity', JSON.stringify({ ids: ['a'], lastActivity: 42 }))
    expect(loadTaskState(sid('bad-activity'))).toEqual({ ids: ['a'], lastActivity: {} })
  })

  it('filters non-numeric activity timestamps', () => {
    localStorage.setItem('dsh.side-tasks.partial-activity', JSON.stringify({
      ids: ['a', 'b'],
      lastActivity: { a: 1, b: 'nope', c: NaN },
    }))
    expect(loadTaskState(sid('partial-activity'))).toEqual({ ids: ['a', 'b'], lastActivity: { a: 1 } })
  })

  it('filters non-string ids inside the legacy array shape', () => {
    localStorage.setItem('dsh.side-tasks.legacy-mixed', JSON.stringify(['a', 7, null]))
    expect(loadTaskState(sid('legacy-mixed'))).toEqual({ ids: ['a'], lastActivity: {} })
  })
})

describe('persistence null/primitive payloads', () => {
  it('treats a JSON null payload as absent', () => {
    localStorage.setItem('dsh.side-tasks.null-payload', 'null')
    expect(loadTaskState(sid('null-payload'))).toEqual({ ids: [], lastActivity: {} })
  })

  it('treats a JSON string payload as absent', () => {
    localStorage.setItem('dsh.side-tasks.string-payload', JSON.stringify('oops'))
    expect(loadTaskState(sid('string-payload'))).toEqual({ ids: [], lastActivity: {} })
  })
})
