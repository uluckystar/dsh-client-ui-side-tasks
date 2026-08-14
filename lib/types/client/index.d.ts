/**
 * Side-task plugin, browser half: a session-header action that toggles a
 * right-hand overlay panel of forked task children for the current session.
 * The header entry is session-scoped (it needs the current session id for the
 * count badge); the panel is root-scoped (it lives in the frame-wide overlay
 * layer). Both share one apply-owned controller: its store instance travels
 * through the inject hooks compartment, so the two entries observe the same
 * panel state without a register-declared store (a store handle mounts under
 * exactly one scope).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type SideTaskKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Side-task panel copy. */
        'sideTask': SideTaskKey;
    }
}
export type { SideTaskActionInjected } from './SideTaskAction.tsx';
export type { SideTaskPanelInjected } from './SideTaskPanel.tsx';
export type { SideTaskKey } from './locales.ts';
/** Required services: slot registration, sessions port, and copy. */
export declare const inject: string[];
/**
 * Client plugin body: register the dictionaries and both entries.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map