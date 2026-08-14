import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** localStorage key prefix for one owner session's side-task collection. */
const TASK_KEY_PREFIX = 'dsh.side-tasks.';
const INITIAL = { open: false, selected: undefined, tasksBySession: {} };
/**
 * Create the side-task panel store.
 * @returns the bare observable store instance.
 */
export function createSideTasksStore() {
    return createSnapshotStore(INITIAL);
}
/**
 * Read a persisted side-task collection for one owner session.
 * @param sessionId - owner session id.
 * @returns the stored child ids, or an empty list when absent or unreadable.
 */
export function loadTaskIds(sessionId) {
    try {
        const raw = localStorage.getItem(TASK_KEY_PREFIX + sessionId);
        if (raw === null)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed.filter((id) => typeof id === 'string');
    }
    catch {
        // Storage unavailable (private mode) or corrupt payload: treat as empty.
        return [];
    }
}
/**
 * Persist a side-task collection for one owner session.
 * @param sessionId - owner session id.
 * @param taskIds - child session ids to store.
 */
export function saveTaskIds(sessionId, taskIds) {
    try {
        localStorage.setItem(TASK_KEY_PREFIX + sessionId, JSON.stringify(taskIds));
    }
    catch {
        // Quota or availability failure: persistence silently degrades to
        // in-memory only, never breaks the panel.
    }
}
//# sourceMappingURL=store.js.map