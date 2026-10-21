/** Read-only history adaptation; never infers a destructive API from its name. */
import type { SideTasksSessions } from './controller.ts';
type History = SideTasksSessions['history'];
type Result = Awaited<ReturnType<History>>;
type Id = Parameters<History>[0];
export interface WireHistory {
    history?(payload: {
        sessionId: Id;
        beforeSeq?: number;
        maxMessages?: number;
    }): Promise<{
        result: Result;
    }>;
}
/** Prefer the legacy service where present; otherwise use the declared public wire history method. */
export declare function historyReader(legacy: {
    history?: History;
}, wire?: WireHistory): {
    available: () => boolean;
    read: (sessionId: import("@deepseek-ai/dsh-session/types").SessionId, opts: {
        beforeSeq?: number;
        maxMessages?: number;
    }) => Promise<import("@deepseek-ai/dsh-client-connection/client").RpcResult<{
        events: import("@deepseek-ai/dsh-client-connection/client").HistoryEntry[];
        hasMore: boolean;
    }>>;
};
export {};
//# sourceMappingURL=history.d.ts.map