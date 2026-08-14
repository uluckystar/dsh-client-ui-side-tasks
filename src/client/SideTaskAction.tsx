/**
 * Session-header action: opens the side-task panel and shows the current
 * session's side-task count as a badge. Session-scope entry — everything it
 * reads arrives through the framework session kit and the inject hooks
 * compartment; the owner passes nothing.
 */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SideTaskState } from './store.ts'
import type { NS } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './SideTaskAction.module.css'

/** Registration-side business face of the header action. */
export interface SideTaskActionInjected {
  hooks: {
    /** The shared panel store, bound by the renderer as `useSideTasks`. */
    sideTasks: SnapshotStore<SideTaskState>
  }
  /** Toggle the panel. */
  togglePanel(): void
}

/** Full props of the session-header side-task action. */
export type SideTaskActionProps =
  PropsRuntime<'conversation.session.header.actions'>
  & InjectFace<SideTaskActionInjected>
  & PropsLocale<typeof NS>

/**
 * Render the header trigger with a live count badge.
 * @param props - session kit, the injected store hook, and the toggle verb.
 */
export function SideTaskAction({ sessionId, useSideTasks, togglePanel, t }: SideTaskActionProps) {
  const count = useSideTasks(state => state.tasksBySession[sessionId]?.length ?? 0)
  return (
    <button
      type="button"
      className={css.trigger}
      aria-label={t('action.aria')}
      onClick={togglePanel}
    >
      <span className={css.label}>{t('action.aria')}</span>
      {count > 0 && <span className={css.count} aria-hidden="true">{count}</span>}
    </button>
  )
}
