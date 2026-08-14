import type { HistoryEntry, SessionId } from '@deepseek-ai/dsh-api-remotes/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { NS } from './locales.ts';
import type { SideTaskState } from './store.ts';
/** Registration-side business face of the panel. */
export interface SideTaskPanelInjected {
    hooks: {
        /** The shared panel store, bound by the renderer as `useSideTasks`. */
        sideTasks: {
            getSnapshot(): SideTaskState;
            subscribe(fn: () => void): () => void;
        };
    };
    /** Fork a new task from the current session. */
    createTask(ownerSessionId: SessionId): Promise<void>;
    /** Durably delete one task (host dispose + persistence delete). */
    deleteTask(ownerSessionId: SessionId, childId: SessionId): Promise<void>;
    /** Send a text message into a task (queued). */
    sendTask(childId: SessionId, text: string): Promise<void>;
    /** Cancel the running turn of a task. */
    stopTask(childId: SessionId): Promise<void>;
    /** Select one task for the mini conversation. */
    selectTask(childId: SessionId): void;
    /** Close the panel without touching tasks. */
    closePanel(): void;
    /**
     * Pull a task's durable transcript from the Host (the event window only
     * backfills the current session, so the panel reads history directly).
     */
    fetchHistory(childId: SessionId): Promise<{
        ok: true;
        events: HistoryEntry[];
    } | {
        ok: false;
        message: string;
    }>;
}
/** Full props of the side-task panel. */
export type SideTaskPanelProps = PropsRuntime<'shell.overlay'> & InjectFace<SideTaskPanelInjected> & PropsLocale<typeof NS>;
/**
 * Render the side-task panel.
 * @param props - composed slot props.
 * @returns the panel, or null while closed or no session is current.
 */
export declare function SideTaskPanel({ useSessions, useSideTasks, createTask, deleteTask, sendTask, stopTask, selectTask, closePanel, fetchHistory, t, }: SideTaskPanelProps): import("react").JSX.Element | null;
//# sourceMappingURL=SideTaskPanel.d.ts.map