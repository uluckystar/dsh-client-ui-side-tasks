/**
 * Side-task panel state and per-session persistence. The panel keeps one
 * collection of side-task child session ids per owner session; the collection
 * and each task's last-activity timestamp survive refreshes through
 * localStorage under `dsh.side-tasks.<sessionId>`. The store is a bare
 * observable (no React), owned by the apply-side controller and shared with
 * both registrations through the inject hooks compartment.
 */
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** localStorage key prefix for one owner session's side-task collection. */
const TASK_KEY_PREFIX = 'dsh.side-tasks.'

/**
 * One persisted per-owner collection: task ids plus each task's last-activity
 * epoch ms (creation, send, or a completed turn), so the expiry sweep can
 * resume across refreshes.
 */
interface PersistedTaskState {
  ids: SessionId[]
  lastActivity: Record<SessionId, number>
}

/** Panel snapshot: open/closed, collapsed chip, selection, and per-owner collections. */
export interface SideTaskState {
  /** Whether the overlay panel is open. */
  open: boolean
  /**
   * Whether the open panel is collapsed to the top-right chip. The chip is
   * the resting state: the full panel appears only while a task is being
   * worked on.
   */
  collapsed: boolean
  /** The side-task child session id currently shown in the mini conversation. */
  selected: SessionId | undefined
  /** Owner session id -> its side-task child session ids (persisted per owner). */
  tasksBySession: Record<SessionId, readonly SessionId[]>
  /** Task child id -> epoch ms of its last activity (persisted per owner). */
  lastActivity: Record<SessionId, number>
  /**
   * The last verb failure the panel should surface (delete/send/stop), or
   * null while no action has failed. Cleared by the next successful or user
   * operation.
   */
  actionError: string | null
}

const INITIAL: SideTaskState = {
  open: false,
  collapsed: false,
  selected: undefined,
  tasksBySession: {},
  lastActivity: {},
  actionError: null,
}

/**
 * Create the side-task panel store.
 * @returns the bare observable store instance.
 */
export function createSideTasksStore(): SnapshotStore<SideTaskState> {
  return createSnapshotStore(INITIAL)
}

/** Parse a persisted payload, accepting the legacy bare-id-array shape. */
function parsePersisted(raw: string): PersistedTaskState | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      // Legacy shape: ids only, no activity timestamps.
      return {
        ids: parsed.filter((id): id is SessionId => typeof id === 'string'),
        lastActivity: {},
      }
    }
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const record = parsed as { ids?: unknown; lastActivity?: unknown }
    if (!Array.isArray(record.ids)) return undefined
    const ids = record.ids.filter((id): id is SessionId => typeof id === 'string')
    const lastActivity: Record<SessionId, number> = {}
    if (typeof record.lastActivity === 'object' && record.lastActivity !== null) {
      for (const [id, time] of Object.entries(record.lastActivity)) {
        if (typeof time === 'number' && Number.isFinite(time)) lastActivity[id as SessionId] = time
      }
    }
    return { ids, lastActivity }
  } catch {
    return undefined
  }
}

/**
 * Read a persisted side-task collection for one owner session.
 * @param sessionId - owner session id.
 * @returns the stored ids and per-task activity timestamps, or empty values
 *   when absent or unreadable.
 */
export function loadTaskState(sessionId: SessionId): PersistedTaskState {
  const raw = localStorage.getItem(TASK_KEY_PREFIX + sessionId)
  if (raw === null) return { ids: [], lastActivity: {} }
  return parsePersisted(raw) ?? { ids: [], lastActivity: {} }
}

/**
 * Persist a side-task collection for one owner session.
 * @param sessionId - owner session id.
 * @param ids - child session ids to store.
 * @param lastActivity - per-task activity timestamps to store.
 */
export function saveTaskState(
  sessionId: SessionId,
  ids: readonly SessionId[],
  lastActivity: Readonly<Record<SessionId, number>>,
): void {
  try {
    localStorage.setItem(TASK_KEY_PREFIX + sessionId, JSON.stringify({ ids, lastActivity }))
  } catch {
    // Quota or availability failure: persistence silently degrades to
    // in-memory only, never breaks the panel.
  }
}
