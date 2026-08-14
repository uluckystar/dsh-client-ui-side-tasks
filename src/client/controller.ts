/**
 * Apply-side controller for the side-task panel: owns the shared store
 * instance, the mini-conversation source, and every RPC verb the surfaces
 * invoke. Components never touch ctx — the renderer binds the store and the
 * conversation source through the inject hooks compartment, and the verb
 * callbacks arrive through the same inject face.
 *
 * Side tasks are TEMPORARY by contract: each fork child is archived right
 * after creation so it never shows in the workspace sidebar (the panel is its
 * only surface), and a task with no activity for {@link SIDE_TASK_TTL_MS}
 * is deleted automatically by {@link SideTasksController.sweepExpired} — the
 * apply-side timer drives it while the page is open, and the persisted
 * last-activity timestamps let a refresh resume the same expiry.
 */
import type { HistoryEntry, RpcResult, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConversationSnapshot, ISession, ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import {
  createSideTasksStore, loadTaskState, saveTaskState,
} from './store.ts'

/**
 * A side task with no activity (creation, send, or a settled turn) for this
 * long is deleted automatically. The panel is a scratchpad, not storage: a
 * task left untouched for an hour has no value left to keep.
 */
export const SIDE_TASK_TTL_MS = 60 * 60 * 1000

/** The slices of ISessions the controller uses; kept narrow for test doubles. */
export interface SideTasksSessions {
  fork(opts: { sessionId: SessionId; increaseTitle?: boolean }): Promise<SessionId>
  /** Archive one session: side-task children leave the workspace sidebar. */
  archiveSession(sessionId: SessionId): Promise<void>
  delete(sessionId: SessionId): Promise<void>
  history(
    sessionId: SessionId,
    opts: { beforeSeq?: number; maxMessages?: number },
  ): Promise<RpcResult<{ events: HistoryEntry[]; hasMore: boolean }>>
  binding(id: SessionId): { session: ISession & ObservableSnapshot<ConversationSnapshot> } | undefined
  list: ObservableSnapshot<{
    current: SessionId | undefined
    /** Live session rows by id; hydrate uses it to drop orphaned task children. */
    byId: Record<SessionId, { running?: boolean } | undefined>
  }>
}

/**
 * A stable observable that follows `store.selected`: it resolves the selected
 * task's session binding and mirrors its conversation snapshot, re-pointing
 * whenever the selection moves. One source object for the entry lifetime, so
 * the renderer's per-source hook cache stays valid.
 * @param store - the panel store.
 * @param sessions - sessions port used to resolve bindings.
 * @returns the derived conversation source.
 */
function taskConversationSource(
  store: ReturnType<typeof createSideTasksStore>,
  sessions: SideTasksSessions,
): HostObservable<ConversationSnapshot | undefined> {
  const listeners = new Set<() => void>()
  let current: ISession & ObservableSnapshot<ConversationSnapshot> | undefined
  let unsubSession: (() => void) | undefined
  const notify = (): void => {
    for (const listener of [...listeners]) listener()
  }
  const follow = (): void => {
    const selected = store.getSnapshot().selected
    const next = selected === undefined ? undefined : sessions.binding(selected)?.session
    if (next === current) return
    unsubSession?.()
    current = next
    unsubSession = next?.subscribe(notify)
  }
  // Subscription kept for the controller lifetime: selection moves re-point
  // the source, so no disposal is exposed while the controller is alive.
  store.subscribe(() => {
    follow()
    notify()
  })
  follow()
  return {
    getSnapshot: () => current?.getSnapshot(),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/** The panel's full behavior face, handed to both registrations via inject. */
export interface SideTasksController {
  /** The shared panel store (bare observable; bound as `useSideTasks`). */
  readonly store: ReturnType<typeof createSideTasksStore>
  /** The selected task's conversation (bound as `useTaskConversation`). */
  readonly taskConversation: HostObservable<ConversationSnapshot | undefined>
  /** Open the panel (a no-op while already open). */
  openPanel(): void
  /** Close the panel; tasks and their agents are untouched. */
  closePanel(): void
  /** Toggle the panel. */
  togglePanel(): void
  /** Collapse the open panel to the top-right chip (the resting state). */
  collapsePanel(): void
  /** Expand the collapsed chip back to the full panel. */
  expandPanel(): void
  /** Select one task for the mini conversation. */
  selectTask(sessionId: SessionId): void
  /** Load the persisted collection for one owner session into the store. */
  hydrate(sessionId: SessionId): void
  /** Load the current session's collection when the selection moves. */
  followCurrent(): () => void
  /** Dismiss the current action error shown in the panel. */
  dismissError(): void
  /**
   * Delete every task whose last activity is older than `ttlMs` and that is
   * not currently running. Expired deletions are silent: a background sweep
   * must never surface an error bar, it simply retries next round.
   * @param now - the sweep clock (test injection).
   * @param ttlMs - expiry window; defaults to {@link SIDE_TASK_TTL_MS}.
   * @returns how many tasks were deleted.
   */
  sweepExpired(now?: number, ttlMs?: number): Promise<number>
  /**
   * Fork a side task from an owner session, archive it out of the workspace
   * sidebar, and add it to the collection. The child carries the owner's full
   * context (the fork seed) but the panel never shows that history — the task
   * starts ready to talk.
   * @param ownerSessionId - the session the task is forked from.
   * @returns the new child session id.
   */
  createTask(ownerSessionId: SessionId): Promise<SessionId>
  /**
   * Durably delete a task: the host disposes its agent, removes its
   * workspace accounts, and deletes its stored log; the collection entry and
   * the selection go with it.
   * @param ownerSessionId - the owner session the task belongs to.
   * @param childId - the task child session to delete.
   */
  deleteTask(ownerSessionId: SessionId, childId: SessionId): Promise<void>
  /**
   * Send one text message into a task session (queued; no-op while the
   * session is gone). Records the send as the task's last activity.
   * @param childId - the task child session.
   * @param text - the message text.
   */
  sendTask(childId: SessionId, text: string): Promise<void>
  /** Cancel the running turn of a task session. */
  stopTask(childId: SessionId): Promise<void>
  /**
   * Pull a task session's durable transcript from the Host (the event window
   * only backfills the current session, so the panel reads history directly).
   * @param childId - the task child session.
   * @param opts - backward page window (seq-exclusive start, message count).
   * @returns the wire page.
   */
  fetchHistory(
    childId: SessionId,
    opts?: { beforeSeq?: number; maxMessages?: number },
  ): Promise<RpcResult<{ events: HistoryEntry[]; hasMore: boolean }>>
}

/**
 * Extract a user-displayable message from a thrown verb failure.
 * @param error - the thrown value.
 * @returns the message text.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Build the side-task controller.
 * @param sessions - sessions port (production passes `ctx.sessions` and
 *   `ctx.workspaces.archiveSession`).
 * @returns the controller face.
 */
export function createSideTasksController(sessions: SideTasksSessions): SideTasksController {
  const store = createSideTasksStore()
  const taskConversation = taskConversationSource(store, sessions)

  const persist = (ownerSessionId: SessionId): void => {
    const snapshot = store.getSnapshot()
    saveTaskState(
      ownerSessionId,
      /* v8 ignore next -- every persist call site sets the collection key first; the guard exists for the noUncheckedIndexedAccess type only */
      snapshot.tasksBySession[ownerSessionId] ?? [],
      snapshot.lastActivity,
    )
  }

  const touch = (childId: SessionId, now: number): void => {
    store.update(draft => { draft.lastActivity[childId] = now })
  }

  const hydrate = (sessionId: SessionId): void => {
    if (store.getSnapshot().tasksBySession[sessionId] !== undefined) return
    const loaded = loadTaskState(sessionId)
    const byId = sessions.list.getSnapshot().byId
    // Drop children whose session no longer exists on the host. While the
    // host list has not arrived (empty byId) there is nothing to validate
    // against, so the collection is kept untouched rather than wiped.
    const alive = Object.keys(byId).length === 0
      ? loaded.ids
      : loaded.ids.filter(childId => byId[childId] !== undefined)
    if (alive.length !== loaded.ids.length) {
      store.update(draft => {
        draft.tasksBySession[sessionId] = alive
        for (const id of loaded.ids) {
          if (!alive.includes(id)) delete draft.lastActivity[id]
        }
      })
      persist(sessionId)
    } else {
      store.update(draft => { draft.tasksBySession[sessionId] = alive })
    }
    store.update(draft => {
      for (const [childId, time] of Object.entries(loaded.lastActivity)) {
        if (alive.includes(childId as SessionId)) draft.lastActivity[childId as SessionId] = time
      }
    })
  }

  const clearError = (): void => {
    store.update(draft => {
      if (draft.actionError !== null) draft.actionError = null
    })
  }

  return {
    store,
    taskConversation,
    openPanel: () => store.update(draft => {
      draft.open = true
      if (draft.actionError !== null) draft.actionError = null
    }),
    closePanel: () => store.update(draft => {
      draft.open = false
      if (draft.actionError !== null) draft.actionError = null
    }),
    togglePanel: () => store.update(draft => {
      draft.open = !draft.open
      if (draft.actionError !== null) draft.actionError = null
    }),
    collapsePanel: () => store.update(draft => {
      draft.collapsed = true
      if (draft.actionError !== null) draft.actionError = null
    }),
    expandPanel: () => store.update(draft => {
      draft.collapsed = false
      if (draft.actionError !== null) draft.actionError = null
    }),
    selectTask: (sessionId) => store.update(draft => {
      draft.selected = sessionId
      draft.collapsed = false
      if (draft.actionError !== null) draft.actionError = null
    }),
    dismissError: clearError,
    hydrate,
    followCurrent: () => {
      const align = (): void => {
        const current = sessions.list.getSnapshot().current
        if (current === undefined) {
          // No current session: no collection the selection could belong to.
          store.update(draft => { draft.selected = undefined })
          return
        }
        hydrate(current)
        const selected = store.getSnapshot().selected
        // hydrate above defines the collection key; the fallback is a
        // noUncheckedIndexedAccess guard only.
        /* v8 ignore next -- the collection key is guaranteed by hydrate(current). */
        const collection = store.getSnapshot().tasksBySession[current] ?? []
        // A selection carried over from another session must not survive:
        // the panel would show that task's conversation and sends would
        // target it. createTask never trips this — it selects a child of the
        // current collection and the current does not change meanwhile.
        if (selected !== undefined && !collection.includes(selected)) {
          store.update(draft => { draft.selected = undefined })
        }
      }
      const stop = sessions.list.subscribe(align)
      align()
      return stop
    },
    sweepExpired: async (now = Date.now(), ttlMs = SIDE_TASK_TTL_MS) => {
      const snapshot = store.getSnapshot()
      const byId = sessions.list.getSnapshot().byId
      const expired: Array<{ owner: SessionId; childId: SessionId }> = []
      for (const [owner, ids] of Object.entries(snapshot.tasksBySession)) {
        for (const childId of ids) {
          // A running turn is activity: the expiry clock starts after it
          // settles (its completion touches the timestamp on the next send
          // or on this sweep once it stops).
          if (byId[childId]?.running === true) continue
          const last = snapshot.lastActivity[childId]
          if (last !== undefined && now - last >= ttlMs) {
            expired.push({ owner: owner as SessionId, childId })
          }
        }
      }
      for (const { owner, childId } of expired) {
        try {
          await sessions.delete(childId)
          store.update(draft => {
            /* v8 ignore next -- sweep iterates existing collection keys; the guard exists for the noUncheckedIndexedAccess type only */
            const ids = draft.tasksBySession[owner] ?? []
            draft.tasksBySession[owner] = ids.filter(id => id !== childId)
            delete draft.lastActivity[childId]
            if (draft.selected === childId) draft.selected = undefined
          })
          persist(owner)
        } catch {
          // A background expiry must stay silent: the next sweep retries.
        }
      }
      return expired.length
    },
    createTask: async (ownerSessionId) => {
      const childId = await sessions.fork({ sessionId: ownerSessionId, increaseTitle: true })
      // Archive the child out of the workspace sidebar immediately: a side
      // task is temporary and its only surface is the panel.
      try {
        await sessions.archiveSession(childId)
      } catch {
        // Archiving is best-effort presentation hiding; a failure leaves the
        // child visible in the sidebar but fully functional, and the next
        // sweep still owns its lifecycle.
      }
      const existing = store.getSnapshot().tasksBySession[ownerSessionId] ?? []
      const next = existing.includes(childId) ? existing : [...existing, childId]
      const now = Date.now()
      store.update(draft => {
        draft.tasksBySession[ownerSessionId] = next
        draft.selected = childId
        draft.lastActivity[childId] = now
        draft.collapsed = false
        if (draft.actionError !== null) draft.actionError = null
      })
      persist(ownerSessionId)
      return childId
    },
    deleteTask: async (ownerSessionId, childId) => {
      try {
        await sessions.delete(childId)
        const existing = store.getSnapshot().tasksBySession[ownerSessionId] ?? []
        const next = existing.filter(id => id !== childId)
        store.update(draft => {
          draft.tasksBySession[ownerSessionId] = next
          delete draft.lastActivity[childId]
          if (draft.selected === childId) draft.selected = undefined
          if (draft.actionError !== null) draft.actionError = null
        })
        persist(ownerSessionId)
      } catch (error) {
        // The host delete failed: the collection stays untouched and the
        // panel surfaces the reason instead of silently swallowing it.
        store.update(draft => { draft.actionError = errorMessage(error) })
      }
    },
    sendTask: async (childId, text) => {
      const trimmed = text.trim()
      if (trimmed === '') return
      try {
        await sessions.binding(childId)?.session.prompt([{ type: 'text', text: trimmed }], 'queue')
        touch(childId, Date.now())
        persistForOwnerOf(childId, store)
        clearError()
      } catch (error) {
        store.update(draft => { draft.actionError = errorMessage(error) })
      }
    },
    stopTask: async (childId) => {
      try {
        await sessions.binding(childId)?.session.cancel()
        clearError()
      } catch (error) {
        store.update(draft => { draft.actionError = errorMessage(error) })
      }
    },
    fetchHistory: (childId, opts) =>
      sessions.history(childId, { maxMessages: 50, ...opts }),
  }
}

/** Persist the owner collection that accounts for one child. */
function persistForOwnerOf(
  childId: SessionId,
  store: ReturnType<typeof createSideTasksStore>,
): void {
  const snapshot = store.getSnapshot()
  for (const owner of Object.keys(snapshot.tasksBySession)) {
    const ids = snapshot.tasksBySession[owner as SessionId]
    if (ids !== undefined && ids.includes(childId)) {
      saveTaskState(owner as SessionId, ids, snapshot.lastActivity)
      return
    }
  }
}
