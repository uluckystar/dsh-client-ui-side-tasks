/**
 * Side-task plugin, browser half: a session-header action that toggles a
 * right-hand overlay panel of temporary task children for the current
 * session. Tasks are forked with the owner's full context but archived out
 * of the workspace sidebar immediately, so the panel is their only surface;
 * a task with no activity for the TTL is deleted automatically by the
 * apply-side sweep. The header entry is session-scoped (it needs the current
 * session id for the count badge); the panel is root-scoped (it lives in the
 * frame-wide overlay layer). Both share one apply-owned controller: its
 * store instance travels through the inject hooks compartment, so the two
 * entries observe the same panel state without a register-declared store (a
 * store handle mounts under exactly one scope).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { historyReader } from './history.ts'
import { createSideTasksController, type SideTasksSessions } from './controller.ts'
import { SideTaskAction, type SideTaskActionInjected } from './SideTaskAction.tsx'
import { SideTaskPanel, type SideTaskPanelInjected } from './SideTaskPanel.tsx'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { en, NS, zh, type SideTaskKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Side-task panel copy. */
    'sideTask': SideTaskKey
  }
}

export type { SideTaskActionInjected } from './SideTaskAction.tsx'
export type { SideTaskPanelInjected } from './SideTaskPanel.tsx'
export type { SideTaskKey } from './locales.ts'

/** Required services: slot registration, sessions + workspaces ports, and copy. */
export const inject = ['slots', 'sessions', 'workspaces', 'locale', 'connection']

/** Expiry sweep cadence: a lazy check, never a busy one. */
const SWEEP_INTERVAL_MS = 30_000

/**
 * Client plugin body: register the dictionaries, both entries, and the
 * background expiry sweep.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // Explicit forwarding, never a spread: ctx.sessions carries its methods on
  // the prototype, so `{...ctx.sessions}` would strip every verb.
  const legacy = ctx.sessions as unknown as Pick<SideTasksSessions, 'delete' | 'history'>
  const history = historyReader(legacy, ctx.connection.api.sessions)
  const unsupported = '当前 DSH 未提供侧边任务所需的历史/删除能力；未创建任务。 Required session history/delete capability unavailable; no task was created.'
  const sessions: SideTasksSessions = {
    fork: opts => ctx.sessions.fork(opts),
    archiveSession: sessionId => ctx.workspaces.archiveSession(sessionId),
    delete: async sessionId => {
      if (typeof legacy.delete !== 'function') throw new Error(unsupported)
      await legacy.delete.call(ctx.sessions, sessionId)
    },
    history: history.read,
    binding: sessionId => ctx.sessions.binding(sessionId),
    list: ctx.sessions.list,
  }
  const controller = createSideTasksController(sessions)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-side-tasks: dictionaries')
  // Keep the current session's collection hydrated from localStorage while
  // the selection moves (the panel and the count badge both read the store).
  ctx.effect(() => controller.followCurrent(), 'ui-side-tasks: current collection hydration')
  // Temporary-task contract: sweep expired tasks while the page is open.
  // Hydration restored the persisted activity timestamps, so a refresh
  // resumes the same expiry instead of restarting it.
  ctx.effect(() => {
    // The interval never fires inside a test window; the boot sweep below is
    // the behavior under test there.
    /* v8 ignore next -- 30s cadence is outside any test window; teardown clearing is asserted */
    const timer = setInterval(() => { void controller.sweepExpired() }, SWEEP_INTERVAL_MS)
    void controller.sweepExpired()
    return () => { clearInterval(timer) }
  }, 'ui-side-tasks: expiry sweep')

  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'side-task',
    order: 30,
    locale: NS,
    inject: (): SideTaskActionInjected => ({
      hooks: { sideTasks: controller.store },
      togglePanel: () => controller.togglePanel(),
    }),
  }, SideTaskAction))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'side-task-panel',
    order: 10,
    locale: NS,
    inject: (): SideTaskPanelInjected => ({
      lifecycleSupported: typeof legacy.delete === 'function' && history.available(),
      hooks: {
        sideTasks: controller.store,
      },
      createTask: async ownerSessionId => {
        try {
          if (typeof legacy.delete !== 'function' || !history.available()) throw new Error(unsupported)
          await controller.createTask(ownerSessionId)
        } catch (error) {
          controller.store.update(draft => { draft.actionError = error instanceof Error ? error.message : String(error) })
        }
      },
      deleteTask: (ownerSessionId, childId) => controller.deleteTask(ownerSessionId, childId),
      sendTask: (childId, text) => controller.sendTask(childId, text),
      stopTask: childId => controller.stopTask(childId),
      selectTask: childId => controller.selectTask(childId),
      collapsePanel: () => controller.collapsePanel(),
      expandPanel: () => controller.expandPanel(),
      dismissError: () => controller.dismissError(),
      closePanel: () => controller.closePanel(),
      fetchHistory: async childId => {
        const result = await controller.fetchHistory(childId)
        return result.ok
          ? { ok: true, events: result.value.events }
          : { ok: false, message: result.error.message }
      },
    }),
  }, SideTaskPanel))
}
