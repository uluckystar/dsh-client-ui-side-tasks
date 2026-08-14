import { createSideTasksStore, loadTaskIds, saveTaskIds, } from "./store.js";
/**
 * A stable observable that follows `store.selected`: it resolves the selected
 * task's session binding and mirrors its conversation snapshot, re-pointing
 * whenever the selection moves. One source object for the entry lifetime, so
 * the renderer's per-source hook cache stays valid.
 * @param store - the panel store.
 * @param sessions - sessions port used to resolve bindings.
 * @returns the derived conversation source.
 */
function taskConversationSource(store, sessions) {
    const listeners = new Set();
    let current;
    let unsubSession;
    const notify = () => {
        for (const listener of [...listeners])
            listener();
    };
    const follow = () => {
        const selected = store.getSnapshot().selected;
        const next = selected === undefined ? undefined : sessions.binding(selected)?.session;
        if (next === current)
            return;
        unsubSession?.();
        current = next;
        unsubSession = next?.subscribe(notify);
    };
    // Subscription kept for the controller lifetime: selection moves re-point
    // the source, so no disposal is exposed while the controller is alive.
    store.subscribe(() => {
        follow();
        notify();
    });
    follow();
    return {
        getSnapshot: () => current?.getSnapshot(),
        subscribe: (listener) => {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
    };
}
/**
 * Build the side-task controller.
 * @param sessions - sessions port (production passes `ctx.sessions`).
 * @returns the controller face.
 */
export function createSideTasksController(sessions) {
    const store = createSideTasksStore();
    const taskConversation = taskConversationSource(store, sessions);
    const hydrate = (sessionId) => {
        if (store.getSnapshot().tasksBySession[sessionId] !== undefined)
            return;
        const loaded = loadTaskIds(sessionId);
        store.update(draft => { draft.tasksBySession[sessionId] = loaded; });
    };
    return {
        store,
        taskConversation,
        openPanel: () => store.update(draft => { draft.open = true; }),
        closePanel: () => store.update(draft => { draft.open = false; }),
        togglePanel: () => store.update(draft => { draft.open = !draft.open; }),
        selectTask: (sessionId) => store.update(draft => { draft.selected = sessionId; }),
        hydrate,
        followCurrent: () => {
            const stop = sessions.list.subscribe(() => {
                const current = sessions.list.getSnapshot().current;
                if (current !== undefined)
                    hydrate(current);
            });
            const current = sessions.list.getSnapshot().current;
            if (current !== undefined)
                hydrate(current);
            return stop;
        },
        createTask: async (ownerSessionId) => {
            const childId = await sessions.fork({ sessionId: ownerSessionId, increaseTitle: true });
            const existing = store.getSnapshot().tasksBySession[ownerSessionId] ?? [];
            const next = existing.includes(childId) ? existing : [...existing, childId];
            store.update(draft => {
                draft.tasksBySession[ownerSessionId] = next;
                draft.selected = childId;
            });
            saveTaskIds(ownerSessionId, next);
            return childId;
        },
        deleteTask: async (ownerSessionId, childId) => {
            await sessions.delete(childId);
            const existing = store.getSnapshot().tasksBySession[ownerSessionId] ?? [];
            const next = existing.filter(id => id !== childId);
            store.update(draft => {
                draft.tasksBySession[ownerSessionId] = next;
                if (draft.selected === childId)
                    draft.selected = undefined;
            });
            saveTaskIds(ownerSessionId, next);
        },
        sendTask: async (childId, text) => {
            const trimmed = text.trim();
            if (trimmed === '')
                return;
            await sessions.binding(childId)?.session.prompt([{ type: 'text', text: trimmed }], 'queue');
        },
        stopTask: async (childId) => {
            await sessions.binding(childId)?.session.cancel();
        },
        fetchHistory: (childId, opts) => sessions.history(childId, { maxMessages: 50, ...opts }),
    };
}
//# sourceMappingURL=controller.js.map