/**
 * Apply-side controller for the side-task panel: owns the shared store
 * instance, the mini-conversation source, and every RPC verb the surfaces
 * invoke. Components never touch ctx — the renderer binds the store and the
 * conversation source through the inject hooks compartment, and the verb
 * callbacks arrive through the same inject face.
 */
import type { HistoryEntry, RpcResult, SessionId } from '@deepseek-ai/dsh-api-remotes/client';
import type { ConversationSnapshot, ISession, ObservableSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
import { createSideTasksStore } from './store.ts';
/** The slices of ISessions the controller uses; kept narrow for test doubles. */
export interface SideTasksSessions {
    fork(opts: {
        sessionId: SessionId;
        increaseTitle?: boolean;
    }): Promise<SessionId>;
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
    /** Select one task for the mini conversation. */
    selectTask(sessionId: SessionId): void;
    /** Load the persisted collection for one owner session into the store. */
    hydrate(sessionId: SessionId): void;
    /** Load the current session's collection when the selection moves. */
    followCurrent(): () => void;
    /**
     * Fork a side task from an owner session and add it to the collection.
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
     * session is gone).
     * @param childId - the task child session.
     * @param text - the message text.
     */
    sendTask(childId: SessionId, text: string): Promise<void>;
    /** Cancel the running turn of a task session. */
    stopTask(childId: SessionId): Promise<void>;
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
 * @param sessions - sessions port (production passes `ctx.sessions`).
 * @returns the controller face.
 */
export declare function createSideTasksController(sessions: SideTasksSessions): SideTasksController;
//# sourceMappingURL=controller.d.ts.map