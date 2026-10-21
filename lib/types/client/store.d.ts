/**
 * Side-task panel state and per-session persistence. The panel keeps one
 * collection of side-task child session ids per owner session; the collection
 * and each task's last-activity timestamp survive refreshes through
 * localStorage under `dsh.side-tasks.<sessionId>`. The store is a bare
 * observable (no React), owned by the apply-side controller and shared with
 * both registrations through the inject hooks compartment.
 */
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client';
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * One persisted per-owner collection: task ids plus each task's last-activity
 * epoch ms (creation, send, or a completed turn), so the expiry sweep can
 * resume across refreshes.
 */
interface PersistedTaskState {
    ids: SessionId[];
    lastActivity: Record<SessionId, number>;
}
/** Panel snapshot: open/closed, collapsed chip, selection, and per-owner collections. */
export interface SideTaskState {
    /** Whether the overlay panel is open. */
    open: boolean;
    /**
     * Whether the open panel is collapsed to the top-right chip. The chip is
     * the resting state: the full panel appears only while a task is being
     * worked on.
     */
    collapsed: boolean;
    /** The side-task child session id currently shown in the mini conversation. */
    selected: SessionId | undefined;
    /** Owner session id -> its side-task child session ids (persisted per owner). */
    tasksBySession: Record<SessionId, readonly SessionId[]>;
    /** Task child id -> epoch ms of its last activity (persisted per owner). */
    lastActivity: Record<SessionId, number>;
    /**
     * The last verb failure the panel should surface (delete/send/stop), or
     * null while no action has failed. Cleared by the next successful or user
     * operation.
     */
    actionError: string | null;
}
/**
 * Create the side-task panel store.
 * @returns the bare observable store instance.
 */
export declare function createSideTasksStore(): SnapshotStore<SideTaskState>;
/**
 * Read a persisted side-task collection for one owner session.
 * @param sessionId - owner session id.
 * @returns the stored ids and per-task activity timestamps, or empty values
 *   when absent or unreadable.
 */
export declare function loadTaskState(sessionId: SessionId): PersistedTaskState;
/**
 * Persist a side-task collection for one owner session.
 * @param sessionId - owner session id.
 * @param ids - child session ids to store.
 * @param lastActivity - per-task activity timestamps to store.
 */
export declare function saveTaskState(sessionId: SessionId, ids: readonly SessionId[], lastActivity: Readonly<Record<SessionId, number>>): void;
export {};
//# sourceMappingURL=store.d.ts.map