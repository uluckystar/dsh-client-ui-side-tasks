// @vitest-environment jsdom
/**
 * Side-task controller: the apply-side face that owns the shared store, the
 * mini-conversation source, and the RPC verbs. The sessions port is a fake —
 * the controller must only depend on the narrow face it declares.
 */
import { describe, expect, it, vi } from 'vitest'
import type {
  ConversationSnapshot, ISession, ObservableSnapshot, SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  createSideTasksController, type SideTasksController, type SideTasksSessions,
} from '../src/client/controller.ts'
import { conversationSnapshot } from '@deepseek-ai/dsh-client-test-runtime'

const sid = (s: string): SessionId => s as SessionId

type FakeSessionFace = ISession & ObservableSnapshot<ConversationSnapshot>

interface FakeSession {
  session: FakeSessionFace
}

function fakeSessions(): SideTasksSessions & {
  forks: { sessionId: string; increaseTitle?: boolean }[]
  archives: string[]
  deletes: string[]
  historyCalls: { sessionId: string; opts: { beforeSeq?: number; maxMessages?: number } }[]
  bindings: Map<string, FakeSession>
  current: string | undefined
  rows: Record<string, unknown>
  setCurrent(next: string | undefined): void
  setRows(next: Record<string, unknown>): void
  setHistory(events: unknown[]): void
} {
  const listeners = new Set<() => void>()
  let current: string | undefined
  let rows: Record<string, unknown> = {}
  let historyEvents: unknown[] = []
  const port = {
    forks: [] as { sessionId: string; increaseTitle?: boolean }[],
    archives: [] as string[],
    deletes: [] as string[],
    historyCalls: [] as { sessionId: string; opts: { beforeSeq?: number; maxMessages?: number } }[],
    bindings: new Map<string, FakeSession>(),
    current: undefined as string | undefined,
    rows: {} as Record<string, unknown>,
    setCurrent(next: string | undefined) {
      current = next
      port.current = next
      for (const listener of [...listeners]) listener()
    },
    setRows(next: Record<string, unknown>) {
      rows = next
      port.rows = next
      for (const listener of [...listeners]) listener()
    },
    setHistory(events: unknown[]) {
      historyEvents = events
    },
    fork: vi.fn(async (opts: { sessionId: string; increaseTitle?: boolean }) => {
      port.forks.push(opts)
      const childId = `child-${port.forks.length}`
      return sid(childId)
    }),
    archiveSession: vi.fn(async (sessionId: string) => { port.archives.push(sessionId) }),
    delete: vi.fn(async (sessionId: string) => { port.deletes.push(sessionId) }),
    history: vi.fn(async (sessionId: string, opts: { beforeSeq?: number; maxMessages?: number }) => {
      port.historyCalls.push({ sessionId, opts })
      return { ok: true as const, value: { events: historyEvents as never[], hasMore: false } }
    }),
    binding: (id: string) => port.bindings.get(id),
    list: {
      getSnapshot: () => ({ current: current as SessionId | undefined, byId: rows }),
      subscribe: (fn: () => void) => {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
    },
  }
  return port
}

function conversation(sessionId: string): ConversationSnapshot {
  return conversationSnapshot(sid(sessionId))
}

function makeBinding(sessionId: string): FakeSession {
  const snapshot = conversation(sessionId)
  const listeners = new Set<() => void>()
  return {
    session: {
      sessionId: sid(sessionId),
      projections: { faceOf: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }) },
      prompt: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
      readAttachment: vi.fn(async () => ({ ok: false as const, error: { code: 'internal', message: 'unused', details: {} } })),
      updateQueue: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
      cancel: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
      rename: vi.fn(async () => ({ ok: true as const, value: { title: 'x', seq: 1 } })),
      loadOlder: vi.fn(async () => undefined),
      command: vi.fn(async () => ({ ok: true as const, value: { matched: false } })),
      getSnapshot: () => snapshot,
      subscribe: (fn: () => void) => {
        listeners.add(fn)
        return () => { listeners.delete(fn) }
      },
    } as FakeSessionFace,
  }
}

describe('controller store + verbs', () => {
  it('opens, closes, and toggles the panel', () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    controller.openPanel()
    expect(controller.store.getSnapshot().open).toBe(true)
    controller.closePanel()
    expect(controller.store.getSnapshot().open).toBe(false)
    controller.togglePanel()
    expect(controller.store.getSnapshot().open).toBe(true)
  })

  it('selects a task', () => {
    const controller = createSideTasksController(fakeSessions())
    controller.selectTask(sid('task-a'))
    expect(controller.store.getSnapshot().selected).toBe('task-a')
  })

  it('creates a task: forks from the owner, archives it out of the sidebar, adds to the collection, persists, and selects it', async () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    const childId = await controller.createTask(sid('owner-1'))

    expect(childId).toBe('child-1')
    expect(sessions.forks).toEqual([{ sessionId: 'owner-1', increaseTitle: true }])
    // The child leaves the workspace sidebar immediately: the panel is its
    // only surface, and the seed context stays invisible.
    expect(sessions.archives).toEqual(['child-1'])
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['child-1'])
    expect(controller.store.getSnapshot().selected).toBe('child-1')
    expect(controller.store.getSnapshot().lastActivity['child-1' as never]).toBeGreaterThan(0)
    // Persisted under the owner key for refresh recovery, with activity.
    const persisted = JSON.parse(localStorage.getItem('dsh.side-tasks.owner-1') ?? '{}') as {
      ids: string[]
      lastActivity: Record<string, number>
    }
    expect(persisted.ids).toEqual(['child-1'])
    expect(persisted.lastActivity['child-1']).toBeGreaterThan(0)
  })

  it('still creates the task when archiving fails (best-effort hiding)', async () => {
    const sessions = fakeSessions()
    sessions.archiveSession = vi.fn(async () => { throw new Error('archive boom') })
    const controller = createSideTasksController(sessions)
    const childId = await controller.createTask(sid('owner-1'))
    expect(childId).toBe('child-1')
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['child-1'])
  })

  it('does not duplicate a task id on a second create of the same child', async () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    await controller.createTask(sid('owner-1'))
    await controller.createTask(sid('owner-1'))
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['child-1', 'child-2'])
  })

  it('keeps an existing child id once when the fork reports it again', async () => {
    const sessions = fakeSessions()
    // Force both forks to report the same child id (a re-fork race echo).
    sessions.fork = vi.fn(async () => sid('same-child'))
    const controller = createSideTasksController(sessions)
    await controller.createTask(sid('owner-1'))
    await controller.createTask(sid('owner-1'))
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['same-child'])
  })

  it('deletes a task: host delete, collection removal, persistence, and selection clear', async () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    await controller.createTask(sid('owner-1')) // child-1 selected
    await controller.createTask(sid('owner-1')) // child-2 selected

    await controller.deleteTask(sid('owner-1'), sid('child-1'))
    expect(sessions.deletes).toEqual(['child-1'])
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['child-2'])
    // child-1 was not selected; the selection stays on child-2.
    expect(controller.store.getSnapshot().selected).toBe('child-2')
    const persisted = JSON.parse(localStorage.getItem('dsh.side-tasks.owner-1') ?? '{}') as { ids: string[] }
    expect(persisted.ids).toEqual(['child-2'])
  })

  it('clears the selection when the deleted task was selected', async () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    await controller.createTask(sid('owner-1')) // child-1 selected
    await controller.deleteTask(sid('owner-1'), sid('child-1'))
    expect(controller.store.getSnapshot().selected).toBeUndefined()
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual([])
  })

  it('deletes from an owner without a loaded collection (no-op on the list)', async () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    await controller.deleteTask(sid('empty-owner'), sid('child-x'))
    expect(sessions.deletes).toEqual(['child-x'])
    expect(controller.store.getSnapshot().tasksBySession['empty-owner' as never]).toEqual([])
  })

  it('sends a trimmed non-empty text through the bound session prompt', async () => {
    const sessions = fakeSessions()
    const binding = makeBinding('child-1')
    sessions.bindings.set('child-1', binding)
    const controller = createSideTasksController(sessions)

    await controller.sendTask(sid('child-1'), '  hello  ')
    expect(binding.session.prompt).toHaveBeenCalledWith([{ type: 'text', text: 'hello' }], 'queue')

    await controller.sendTask(sid('child-1'), '   ')
    expect(binding.session.prompt).toHaveBeenCalledTimes(1)
  })

  it('reports unavailable send/stop when the session binding is gone', async () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    await expect(controller.sendTask(sid('ghost'), 'hi')).resolves.toBe(false)
    await expect(controller.stopTask(sid('ghost'))).resolves.toBe(false)
  })

  it('stops the running turn through the bound session cancel', async () => {
    const sessions = fakeSessions()
    const binding = makeBinding('child-1')
    sessions.bindings.set('child-1', binding)
    const controller = createSideTasksController(sessions)
    await controller.stopTask(sid('child-1'))
    expect(binding.session.cancel).toHaveBeenCalledTimes(1)
  })

  it('hydrates a persisted collection on demand', () => {
    localStorage.setItem('dsh.side-tasks.owner-1', JSON.stringify(['task-a', 'task-b']))
    const controller = createSideTasksController(fakeSessions())
    controller.hydrate(sid('owner-1'))
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['task-a', 'task-b'])
    // Second hydrate is a no-op (already loaded).
    controller.hydrate(sid('owner-1'))
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['task-a', 'task-b'])
  })

  it('followCurrent hydrates the current session and stops on dispose', () => {
    localStorage.setItem('dsh.side-tasks.owner-9', JSON.stringify(['task-z']))
    const sessions = fakeSessions()
    sessions.setCurrent('owner-9')
    const controller = createSideTasksController(sessions)
    const stop = controller.followCurrent()
    expect(controller.store.getSnapshot().tasksBySession['owner-9' as never]).toEqual(['task-z'])
    stop()
    expect(() => { sessions.setCurrent('owner-9') }).not.toThrow()
  })

  it('followCurrent hydrates a newly current session on list change', () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    const stop = controller.followCurrent()
    localStorage.setItem('dsh.side-tasks.owner-7', JSON.stringify(['task-x']))
    sessions.setCurrent('owner-7')
    expect(controller.store.getSnapshot().tasksBySession['owner-7' as never]).toEqual(['task-x'])
    stop()
  })

  it('followCurrent skips hydration while no session is current', () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    const stop = controller.followCurrent()
    // A list change with no current session: the callback fires and skips.
    sessions.setCurrent(undefined)
    expect(controller.store.getSnapshot().tasksBySession).toEqual({})
    stop()
  })

  it('clears a selection that does not belong to the newly current session', () => {
    localStorage.setItem('dsh.side-tasks.owner-a', JSON.stringify(['task-a']))
    localStorage.setItem('dsh.side-tasks.owner-b', JSON.stringify(['task-b']))
    const sessions = fakeSessions()
    sessions.setRows({ 'task-a': {}, 'task-b': {} })
    sessions.setCurrent('owner-a')
    const controller = createSideTasksController(sessions)
    controller.followCurrent()
    controller.selectTask(sid('task-a'))
    expect(controller.store.getSnapshot().selected).toBe('task-a')

    // Switching to owner-b: task-a belongs to owner-a's collection only, so
    // the stale selection must not leak (it would misdirect sends).
    sessions.setCurrent('owner-b')
    expect(controller.store.getSnapshot().selected).toBeUndefined()
    expect(controller.store.getSnapshot().tasksBySession['owner-b' as never]).toEqual(['task-b'])
  })

  it('keeps the selection when it belongs to the newly current collection', () => {
    localStorage.setItem('dsh.side-tasks.owner-a', JSON.stringify(['shared-task']))
    localStorage.setItem('dsh.side-tasks.owner-b', JSON.stringify(['shared-task']))
    const sessions = fakeSessions()
    sessions.setRows({ 'shared-task': {} })
    sessions.setCurrent('owner-a')
    const controller = createSideTasksController(sessions)
    controller.followCurrent()
    controller.selectTask(sid('shared-task'))

    sessions.setCurrent('owner-b')
    expect(controller.store.getSnapshot().selected).toBe('shared-task')
  })

  it('clears the selection when the current session goes away', () => {
    const sessions = fakeSessions()
    sessions.setCurrent('owner-a')
    const controller = createSideTasksController(sessions)
    controller.followCurrent()
    controller.selectTask(sid('task-a'))

    sessions.setCurrent(undefined)
    expect(controller.store.getSnapshot().selected).toBeUndefined()
  })

  it('hydrate drops orphaned children and writes the filtered collection back', () => {
    localStorage.setItem('dsh.side-tasks.owner-1', JSON.stringify({
      ids: ['alive-1', 'dead-1', 'alive-2'],
      lastActivity: { 'alive-1': 1, 'dead-1': 2, 'alive-2': 3 },
    }))
    const sessions = fakeSessions()
    sessions.setRows({ 'alive-1': {}, 'alive-2': {} })
    const controller = createSideTasksController(sessions)
    controller.hydrate(sid('owner-1'))
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['alive-1', 'alive-2'])
    // Activity of the dropped child is forgotten; the survivors keep theirs.
    expect(controller.store.getSnapshot().lastActivity).toMatchObject({
      'alive-1': 1, 'alive-2': 3,
    })
    // The cleaned collection replaces the stale persisted one.
    const persisted = JSON.parse(localStorage.getItem('dsh.side-tasks.owner-1') ?? '{}') as {
      ids: string[]
      lastActivity: Record<string, number>
    }
    expect(persisted.ids).toEqual(['alive-1', 'alive-2'])
    expect(persisted.lastActivity['dead-1']).toBeUndefined()
  })

  it('hydrate keeps the collection untouched while the host list has not arrived', () => {
    // An empty byId means there is nothing to validate against: wiping the
    // collection would destroy data on a slow first list frame.
    localStorage.setItem('dsh.side-tasks.owner-1', JSON.stringify({ ids: ['task-a'], lastActivity: { 'task-a': 5 } }))
    const controller = createSideTasksController(fakeSessions())
    controller.hydrate(sid('owner-1'))
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['task-a'])
    expect(controller.store.getSnapshot().lastActivity['task-a' as never]).toBe(5)
    const persisted = JSON.parse(localStorage.getItem('dsh.side-tasks.owner-1') ?? '{}') as { ids: string[] }
    expect(persisted.ids).toEqual(['task-a'])
  })

  it('hydrate does not rewrite localStorage when nothing was filtered', () => {
    localStorage.setItem('dsh.side-tasks.owner-1', JSON.stringify({ ids: ['alive-1'], lastActivity: {} }))
    const sessions = fakeSessions()
    sessions.setRows({ 'alive-1': {} })
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const controller = createSideTasksController(sessions)
    controller.hydrate(sid('owner-1'))
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['alive-1'])
    expect(write).not.toHaveBeenCalled()
    write.mockRestore()
  })

  it('fetchHistory defaults to a 50-message window and passes through the wire page', async () => {
    const sessions = fakeSessions()
    const events = [{ event: { type: 'user/message', seq: 1, time: 1, data: {} } }]
    sessions.setHistory(events)
    const controller = createSideTasksController(sessions)

    const result = await controller.fetchHistory(sid('child-1'))
    expect(result).toEqual({ ok: true, value: { events, hasMore: false } })
    expect(sessions.historyCalls).toEqual([{ sessionId: 'child-1', opts: { maxMessages: 50 } }])
  })

  it('fetchHistory forwards caller page options over the default', async () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)

    await controller.fetchHistory(sid('child-1'), { beforeSeq: 9, maxMessages: 20 })
    expect(sessions.historyCalls).toEqual([{ sessionId: 'child-1', opts: { beforeSeq: 9, maxMessages: 20 } }])
  })
})

describe('controller actionError surface', () => {
  it('starts with no action error', () => {
    const controller = createSideTasksController(fakeSessions())
    expect(controller.store.getSnapshot().actionError).toBeNull()
  })

  it('records a delete failure and leaves the collection and selection intact', async () => {
    const sessions = fakeSessions()
    sessions.delete = vi.fn(async () => { throw new Error('session-not-found') })
    const controller = createSideTasksController(sessions)
    await controller.createTask(sid('owner-1'))

    await controller.deleteTask(sid('owner-1'), sid('child-1'))
    expect(controller.store.getSnapshot().actionError).toBe('session-not-found')
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['child-1'])
    expect(controller.store.getSnapshot().selected).toBe('child-1')
  })

  it('records a send failure from the bound session prompt', async () => {
    const sessions = fakeSessions()
    const binding = makeBinding('child-1')
    vi.mocked(binding.session.prompt).mockRejectedValueOnce(new Error('network down'))
    sessions.bindings.set('child-1', binding)
    const controller = createSideTasksController(sessions)

    await controller.sendTask(sid('child-1'), 'hello')
    expect(controller.store.getSnapshot().actionError).toBe('network down')
  })

  it('records a stop failure from the bound session cancel', async () => {
    const sessions = fakeSessions()
    const binding = makeBinding('child-1')
    vi.mocked(binding.session.cancel).mockRejectedValueOnce(new Error('cancel exploded'))
    sessions.bindings.set('child-1', binding)
    const controller = createSideTasksController(sessions)

    await controller.stopTask(sid('child-1'))
    expect(controller.store.getSnapshot().actionError).toBe('cancel exploded')
  })

  it('stringifies a non-Error failure into the error surface', async () => {
    const sessions = fakeSessions()
    sessions.delete = vi.fn(async () => { throw 'plain string boom' })
    const controller = createSideTasksController(sessions)
    await controller.deleteTask(sid('owner-1'), sid('child-x'))
    expect(controller.store.getSnapshot().actionError).toBe('plain string boom')
  })

  it('clears the error on a later successful delete', async () => {
    const sessions = fakeSessions()
    sessions.delete = vi.fn(async () => { throw new Error('boom') })
    const controller = createSideTasksController(sessions)
    await controller.createTask(sid('owner-1'))
    await controller.deleteTask(sid('owner-1'), sid('child-1'))
    expect(controller.store.getSnapshot().actionError).toBe('boom')

    sessions.delete = vi.fn(async () => undefined)
    await controller.deleteTask(sid('owner-1'), sid('child-1'))
    expect(controller.store.getSnapshot().actionError).toBeNull()
  })

  it('clears the error on successful send and stop', async () => {
    const sessions = fakeSessions()
    const binding = makeBinding('child-1')
    sessions.bindings.set('child-1', binding)
    const controller = createSideTasksController(sessions)
    controller.store.update(draft => { draft.actionError = 'stale' })

    await controller.sendTask(sid('child-1'), 'hello')
    expect(controller.store.getSnapshot().actionError).toBeNull()

    controller.store.update(draft => { draft.actionError = 'stale' })
    await controller.stopTask(sid('child-1'))
    expect(controller.store.getSnapshot().actionError).toBeNull()
  })

  it('clears the error on user operations and dismisses on demand', async () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    await controller.createTask(sid('owner-1'))
    controller.store.update(draft => { draft.actionError = 'stale' })
    controller.openPanel()
    expect(controller.store.getSnapshot().actionError).toBeNull()

    controller.store.update(draft => { draft.actionError = 'stale' })
    controller.closePanel()
    expect(controller.store.getSnapshot().actionError).toBeNull()

    controller.store.update(draft => { draft.actionError = 'stale' })
    controller.togglePanel()
    expect(controller.store.getSnapshot().actionError).toBeNull()

    controller.store.update(draft => { draft.actionError = 'stale' })
    controller.selectTask(sid('child-1'))
    expect(controller.store.getSnapshot().actionError).toBeNull()

    controller.store.update(draft => { draft.actionError = 'stale' })
    controller.dismissError()
    expect(controller.store.getSnapshot().actionError).toBeNull()
  })

  it('clears the error on a successful create', async () => {
    const sessions = fakeSessions()
    const controller = createSideTasksController(sessions)
    controller.store.update(draft => { draft.actionError = 'stale' })
    await controller.createTask(sid('owner-1'))
    expect(controller.store.getSnapshot().actionError).toBeNull()
  })
})

describe('controller conversation source', () => {
  function setup(): { controller: SideTasksController; sessions: ReturnType<typeof fakeSessions> } {
    const sessions = fakeSessions()
    sessions.bindings.set('child-1', makeBinding('child-1'))
    const controller = createSideTasksController(sessions)
    return { controller, sessions }
  }

  it('snapshots undefined while nothing is selected', () => {
    const { controller } = setup()
    expect(controller.taskConversation.getSnapshot()).toBeUndefined()
  })

  it('follows the selected task binding after selection moves', () => {
    const { controller } = setup()
    controller.selectTask(sid('child-1'))
    expect(controller.taskConversation.getSnapshot()?.sessionId).toBe('child-1')
  })

  it('re-points when the selection moves to another task', () => {
    const { controller, sessions } = setup()
    sessions.bindings.set('child-2', makeBinding('child-2'))
    controller.selectTask(sid('child-1'))
    controller.selectTask(sid('child-2'))
    expect(controller.taskConversation.getSnapshot()?.sessionId).toBe('child-2')
  })

  it('no-ops a follow when the selection did not change', () => {
    const { controller } = setup()
    controller.selectTask(sid('child-1'))
    controller.selectTask(sid('child-1'))
    expect(controller.taskConversation.getSnapshot()?.sessionId).toBe('child-1')
  })

  it('returns undefined when the selection is cleared (task deleted)', () => {
    const { controller, sessions } = setup()
    sessions.bindings.set('child-1', makeBinding('child-1'))
    controller.selectTask(sid('child-1'))
    expect(controller.taskConversation.getSnapshot()?.sessionId).toBe('child-1')
    // The delete path clears the selection; the source drops the stale session.
    sessions.bindings.delete('child-1')
    controller.store.update(draft => { draft.selected = undefined })
    expect(controller.taskConversation.getSnapshot()).toBeUndefined()
  })

  it('notifies subscribers on selection change', () => {
    const { controller } = setup()
    const notified = vi.fn()
    const stop = controller.taskConversation.subscribe(notified)
    controller.selectTask(sid('child-1'))
    expect(notified).toHaveBeenCalled()
    stop()
    controller.selectTask(sid('child-2'))
    expect(notified).toHaveBeenCalledTimes(1)
  })
})

describe('expiry sweep', () => {
  it('deletes tasks idle past the TTL and cleans the collection', async () => {
    const sessions = fakeSessions()
    sessions.setRows({ 'child-1': {}, 'child-2': {} })
    const controller = createSideTasksController(sessions)
    // Seed the collection with two tasks, one freshly active and one idle.
    controller.store.update(draft => {
      draft.tasksBySession['owner-1' as never] = ['child-1', 'child-2']
      draft.lastActivity['child-1' as never] = 1000
      draft.lastActivity['child-2' as never] = 1000
      draft.selected = 'child-1' as never
    })
    await controller.sweepExpired(1000 + 60 * 60 * 1000 + 1, 60 * 60 * 1000)
    expect(sessions.deletes).toEqual(['child-1', 'child-2'])
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual([])
    expect(controller.store.getSnapshot().selected).toBeUndefined()
    expect(controller.store.getSnapshot().lastActivity).toEqual({})
    const persisted = JSON.parse(localStorage.getItem('dsh.side-tasks.owner-1') ?? '{}') as { ids: string[] }
    expect(persisted.ids).toEqual([])
  })

  it('skips tasks still within the TTL and running tasks', async () => {
    const sessions = fakeSessions()
    sessions.setRows({ 'fresh': {}, 'running': { running: true }, 'stale': {} })
    const controller = createSideTasksController(sessions)
    const now = 1_000_000
    const ttl = 60 * 60 * 1000
    controller.store.update(draft => {
      draft.tasksBySession['owner-1' as never] = ['fresh', 'running', 'stale']
      draft.lastActivity['fresh' as never] = now - 1000
      draft.lastActivity['running' as never] = now - ttl - 1000
      draft.lastActivity['stale' as never] = now - ttl - 1000
    })
    await controller.sweepExpired(now, ttl)
    // 'running' is excluded while its turn is in flight; 'stale' goes.
    expect(sessions.deletes).toEqual(['stale'])
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['fresh', 'running'])
  })

  it('keeps a failed expiry deletion in the collection for the next sweep', async () => {
    const sessions = fakeSessions()
    sessions.setRows({ 'stale': {} })
    sessions.delete = vi.fn(async () => { throw new Error('host down') })
    const controller = createSideTasksController(sessions)
    controller.store.update(draft => {
      draft.tasksBySession['owner-1' as never] = ['stale']
      draft.lastActivity['stale' as never] = 1
    })
    await controller.sweepExpired(2 * 60 * 60 * 1000, 60 * 60 * 1000)
    // Silent retry semantics: the collection stays, no error bar appears.
    expect(controller.store.getSnapshot().tasksBySession['owner-1' as never]).toEqual(['stale'])
    expect(controller.store.getSnapshot().actionError).toBeNull()
  })

  it('records a send as last activity so the TTL restarts', async () => {
    const sessions = fakeSessions()
    sessions.setRows({ 'child-1': {} })
    const binding = makeBinding('child-1')
    sessions.bindings.set('child-1', binding)
    const controller = createSideTasksController(sessions)
    controller.store.update(draft => {
      draft.tasksBySession['owner-1' as never] = ['child-1']
      draft.lastActivity['child-1' as never] = 1000
    })
    await controller.sendTask(sid('child-1'), 'ping')
    const touched = controller.store.getSnapshot().lastActivity['child-1' as never]
    expect(touched).toBeGreaterThan(1000)
  })

  it('collapses and expands the panel', () => {
    const controller = createSideTasksController(fakeSessions())
    controller.openPanel()
    controller.collapsePanel()
    expect(controller.store.getSnapshot().collapsed).toBe(true)
    controller.expandPanel()
    expect(controller.store.getSnapshot().collapsed).toBe(false)
  })

  it('selecting a task expands a collapsed panel', () => {
    const controller = createSideTasksController(fakeSessions())
    controller.openPanel()
    controller.collapsePanel()
    controller.selectTask(sid('task-a'))
    expect(controller.store.getSnapshot().collapsed).toBe(false)
  })
})

describe('collapse/expand error clearing', () => {
  it('collapse and expand clear a pending action error', () => {
    const controller = createSideTasksController(fakeSessions())
    controller.openPanel()
    controller.store.update(draft => { draft.actionError = 'boom' })
    controller.collapsePanel()
    expect(controller.store.getSnapshot().actionError).toBeNull()
    controller.store.update(draft => { draft.actionError = 'boom' })
    controller.expandPanel()
    expect(controller.store.getSnapshot().actionError).toBeNull()
  })
})

describe('RPC acknowledgements', () => {
  it('does not treat a missing binding as a successful send or stop', async () => {
    const controller = createSideTasksController(fakeSessions())
    expect(await controller.sendTask(sid('gone'), 'keep this draft')).toBe(false)
    expect(controller.store.getSnapshot().lastActivity['gone' as never]).toBeUndefined()
    expect(controller.store.getSnapshot().actionError).toMatch(/unavailable|不可用/i)
    expect(await controller.stopTask(sid('gone'))).toBe(false)
    expect(controller.store.getSnapshot().actionError).toMatch(/unavailable|不可用/i)
  })

  it('does not touch activity or clear errors when prompt returns a rejected RPC result', async () => {
    const sessions = fakeSessions(); const binding = makeBinding('child-1')
    vi.mocked(binding.session.prompt).mockResolvedValueOnce({ok:false,error:{code:'internal',message:'quota denied',details:{}}})
    sessions.bindings.set('child-1',binding)
    const controller = createSideTasksController(sessions)
    controller.store.update(draft => { draft.lastActivity['child-1' as never] = 123 })
    expect(await controller.sendTask(sid('child-1'),'hello')).toBe(false)
    expect(controller.store.getSnapshot().lastActivity['child-1' as never]).toBe(123)
    expect(controller.store.getSnapshot().actionError).toBe('quota denied')
  })

  it('surfaces cancel RPC errors instead of reporting successful stop', async () => {
    const sessions = fakeSessions(); const binding = makeBinding('child-1')
    vi.mocked(binding.session.cancel).mockResolvedValueOnce({ok:false,error:{code:'internal',message:'cancel denied',details:{}}})
    sessions.bindings.set('child-1',binding)
    const controller = createSideTasksController(sessions)
    expect(await controller.stopTask(sid('child-1'))).toBe(false)
    expect(controller.store.getSnapshot().actionError).toBe('cancel denied')
  })

  it('fails closed for malformed or unaccepted successful-looking replies', async () => {
    for (const response of [undefined,null,{}, {ok:true}, {ok:true,value:{}}, {ok:true,value:{accepted:false}}, {ok:'true',value:{accepted:true}}]) {
      const sessions = fakeSessions(); const binding = makeBinding('child-1')
      vi.mocked(binding.session.prompt).mockResolvedValueOnce(response as never)
      sessions.bindings.set('child-1',binding)
      const controller = createSideTasksController(sessions)
      expect(await controller.sendTask(sid('child-1'),'hello')).toBe(false)
      expect(controller.store.getSnapshot().lastActivity['child-1' as never]).toBeUndefined()
      expect(controller.store.getSnapshot().actionError).toBeTruthy()
    }
  })

  it('returns true only for acknowledged sends and stops, and false for empty text', async () => {
    const sessions = fakeSessions(); const binding = makeBinding('child-1')
    sessions.bindings.set('child-1',binding)
    const controller = createSideTasksController(sessions)
    expect(await controller.sendTask(sid('child-1'),'  ')).toBe(false)
    expect(binding.session.prompt).not.toHaveBeenCalled()
    expect(await controller.sendTask(sid('child-1'),'hello')).toBe(true)
    expect(await controller.stopTask(sid('child-1'))).toBe(true)
  })
})
