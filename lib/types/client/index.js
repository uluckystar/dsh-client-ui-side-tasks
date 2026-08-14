import { createSideTasksController } from "./controller.js";
import { SideTaskAction } from "./SideTaskAction.js";
import { SideTaskPanel } from "./SideTaskPanel.js";
import { en, NS, zh } from "./locales.js";
/** Required services: slot registration, sessions port, and copy. */
export const inject = ['slots', 'sessions', 'locale'];
/**
 * Client plugin body: register the dictionaries and both entries.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    const controller = createSideTasksController(ctx.sessions);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-side-tasks: dictionaries');
    // Keep the current session's collection hydrated from localStorage while
    // the selection moves (the panel and the count badge both read the store).
    ctx.effect(() => controller.followCurrent(), 'ui-side-tasks: current collection hydration');
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'side-task',
        order: 30,
        locale: NS,
        inject: () => ({
            hooks: { sideTasks: controller.store },
            togglePanel: () => controller.togglePanel(),
        }),
    }, SideTaskAction));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'side-task-panel',
        order: 10,
        locale: NS,
        inject: () => ({
            hooks: {
                sideTasks: controller.store,
            },
            createTask: async (ownerSessionId) => { await controller.createTask(ownerSessionId); },
            deleteTask: (ownerSessionId, childId) => controller.deleteTask(ownerSessionId, childId),
            sendTask: (childId, text) => controller.sendTask(childId, text),
            stopTask: childId => controller.stopTask(childId),
            selectTask: childId => controller.selectTask(childId),
            closePanel: () => controller.closePanel(),
            fetchHistory: async (childId) => {
                const result = await controller.fetchHistory(childId);
                return result.ok
                    ? { ok: true, events: result.value.events }
                    : { ok: false, message: result.error.message };
            },
        }),
    }, SideTaskPanel));
}
//# sourceMappingURL=index.js.map