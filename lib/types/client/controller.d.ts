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
import type { HistoryEntry, RpcResult, SessionId } from '@deepseek-ai/dsh-api-remotes/client';
import type { ConversationSnapshot, ISession, ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
import { createSideTasksStore } from './store.ts';
/**
 * A side task with no activity (creation, send, or a settled turn) for this
 * long is deleted automatically. The panel is a scratchpad, not storage: a
 * task left untouched for an hour has no value left to keep.
 */
export declare const SIDE_TASK_TTL_MS: number;
/** The slices of ISessions the controller uses; kept narrow for test doubles. */
export interface SideTasksSessions {
    fork(opts: {
        sessionId: SessionId;
        increaseTitle?: boolean;
    }): Promise<SessionId>;
    /** Archive one session: side-task children leave the workspace sidebar. */
    archiveSession(sessionId: SessionId): Promise<void>;
    delete(sessionId: SessionId): Promise<void>;
    history(sessionId: SessionId, opts: {
        beforeSeq?: number;
        maxMessages?: number;
    }): Promise<RpcResult<{
        events: HistoryEntry[];
        hasMore: boolean;
    }>>;
    binding(id: SessionId): {
        session: ISession & ObservableSnapshot<ConversationSnapshot>;
    } | undefined;
    list: ObservableSnapshot<{
        current: SessionId | undefined;
        /** Live session rows by id; hydrate uses it to drop orphaned task children. */
        byId: Record<SessionId, {
            running?: boolean;
        } | undefined>;
    }>;
}
/** The panel's full behavior face, handed to both registrations via inject. */
export interface SideTasksController {
    /** The shared panel store (bare observable; bound as `useSideTasks`). */
    readonly store: ReturnType<typeof createSideTasksStore>;
    /** The selected task's conversation (bound as `useTaskConversation`). */
    readonly taskConversation: HostObservable<ConversationSnapshot | undefined>;
    /** Open the panel (a no-op while already open). */
    openPanel(): void;
    /** Close the panel; tasks and their agents are untouched. */
    closePanel(): void;
    /** Toggle the panel. */
    togglePanel(): void;
    /** Collapse the open panel to the top-right chip (the resting state). */
    collapsePanel(): void;
    /** Expand the collapsed chip back to the full panel. */
    expandPanel(): void;
    /** Select one task for the mini conversation. */
    selectTask(sessionId: SessionId): void;
    /** Load the persisted collection for one owner session into the store. */
    hydrate(sessionId: SessionId): void;
    /** Load the current session's collection when the selection moves. */
    followCurrent(): () => void;
    /** Dismiss the current action error shown in the panel. */
    dismissError(): void;
    /**
     * Delete every task whose last activity is older than `ttlMs` and that is
     * not currently running. Expired deletions are silent: a background sweep
     * must never surface an error bar, it simply retries next round.
     * @param now - the sweep clock (test injection).
     * @param ttlMs - expiry window; defaults to {@link SIDE_TASK_TTL_MS}.
     * @returns how many tasks were deleted.
     */
    sweepExpired(now?: number, ttlMs?: number): Promise<number>;
    /**
     * Fork a side task from an owner session, archive it out of the workspace
     * sidebar, and add it to the collection. The child carries the owner's full
     * context (the fork seed) but the panel never shows that history — the task
     * starts ready to talk.
     * @param ownerSessionId - the session the task is forked from.
     * @returns the new child session id.
     */
    createTask(ownerSessionId: SessionId): Promise<SessionId>;
    /**
     * Durably delete a task: the host disposes its agent, removes its
     * workspace accounts, and deletes its stored log; the collection entry and
     * the selection go with it.
     * @param ownerSessionId - the owner session the task belongs to.
     * @param childId - the task child session to delete.
     */
    deleteTask(ownerSessionId: SessionId, childId: SessionId): Promise<void>;
    /**
     * Send one text message into a task session (queued; no-op while the
     * session is gone). Records the send as the task's last activity.
     * @param childId - the task child session.
     * @param text - the message text.
     */
    sendTask(childId: SessionId, text: string): Promise<boolean>;
    /** Cancel the running turn of a task session. */
    stopTask(childId: SessionId): Promise<boolean>;
    /**
     * Pull a task session's durable transcript from the Host (the event window
     * only backfills the current session, so the panel reads history directly).
     * @param childId - the task child session.
     * @param opts - backward page window (seq-exclusive start, message count).
     * @returns the wire page.
     */
    fetchHistory(childId: SessionId, opts?: {
        beforeSeq?: number;
        maxMessages?: number;
    }): Promise<RpcResult<{
        events: HistoryEntry[];
        hasMore: boolean;
    }>>;
}
/**
 * Build the side-task controller.
 * @param sessions - sessions port (production passes `ctx.sessions` and
 *   `ctx.workspaces.archiveSession`).
 * @returns the controller face.
 */
export declare function createSideTasksController(sessions: SideTasksSessions): SideTasksController;
//# sourceMappingURL=controller.d.ts.map