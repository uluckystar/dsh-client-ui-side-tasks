/**
 * Side-task panel state and per-session persistence. The panel keeps one
 * collection of side-task child session ids per owner session; the collection
 * survives refreshes through localStorage under `dsh.side-tasks.<sessionId>`.
 * The store is a bare observable (no React), owned by the apply-side
 * controller and shared with both registrations through the inject hooks
 * compartment.
 */
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client';
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/** Panel snapshot: open/closed, the selected task, and per-owner collections. */
export interface SideTaskState {
    /** Whether the overlay panel is open. */
    open: boolean;
    /** The side-task child session id currently shown in the mini conversation. */
    selected: SessionId | undefined;
    /** Owner session id -> its side-task child session ids (persisted per owner). */
    tasksBySession: Record<SessionId, readonly SessionId[]>;
}
/**
 * Create the side-task panel store.
 * @returns the bare observable store instance.
 */
export declare function createSideTasksStore(): SnapshotStore<SideTaskState>;
/**
 * Read a persisted side-task collection for one owner session.
 * @param sessionId - owner session id.
 * @returns the stored child ids, or an empty list when absent or unreadable.
 */
export declare function loadTaskIds(sessionId: SessionId): SessionId[];
/**
 * Persist a side-task collection for one owner session.
 * @param sessionId - owner session id.
 * @param taskIds - child session ids to store.
 */
export declare function saveTaskIds(sessionId: SessionId, taskIds: readonly SessionId[]): void;
//# sourceMappingURL=store.d.ts.map