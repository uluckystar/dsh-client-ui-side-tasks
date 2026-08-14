/**
 * Side-task overlay panel: a fixed right-hand surface beside the main
 * conversation, owned by the current session. The panel collapses to a
 * compact top-right chip — the resting state — and expands while a task is
 * being worked on. Lists the session's temporary task children (persisted
 * per owner), shows a mini conversation of the selected task's OWN messages
 * (the forked seed context stays invisible: the task carries it, the panel
 * never dumps it), and sends/cancels prompts. Closing the panel only hides
 * the UI — tasks and their agents stay alive until their expiry sweep;
 * deleting a task disposes the host agent and erases its stored log through
 * `session.delete`.
 *
 * The mini conversation is pull-based: the event window only backfills the
 * current session, so the panel fetches the selected task's durable history
 * (`fetchHistory` -> `session.history`) on selection, refreshes when a
 * running turn settles, and refreshes after each send.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { HistoryEntry, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import { taskOwnMessageRows } from './messages.ts'
import type { SideTaskState } from './store.ts'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import css from './SideTaskPanel.module.css'

/** Registration-side business face of the panel. */
export interface SideTaskPanelInjected {
  hooks: {
    /** The shared panel store, bound by the renderer as `useSideTasks`. */
    sideTasks: { getSnapshot(): SideTaskState; subscribe(fn: () => void): () => void }
  }
  /** Fork a new task from the current session. */
  createTask(ownerSessionId: SessionId): Promise<void>
  /** Durably delete one task (host dispose + persistence delete). */
  deleteTask(ownerSessionId: SessionId, childId: SessionId): Promise<void>
  /** Send a text message into a task (queued). */
  sendTask(childId: SessionId, text: string): Promise<void>
  /** Cancel the running turn of a task. */
  stopTask(childId: SessionId): Promise<void>
  /** Select one task for the mini conversation. */
  selectTask(childId: SessionId): void
  /** Collapse the panel to the top-right chip. */
  collapsePanel(): void
  /** Expand the collapsed chip back to the full panel. */
  expandPanel(): void
  /** Dismiss the current action error shown in the panel. */
  dismissError(): void
  /** Close the panel without touching tasks. */
  closePanel(): void
  /**
   * Pull a task's durable transcript from the Host (the event window only
   * backfills the current session, so the panel reads history directly).
   */
  fetchHistory(childId: SessionId): Promise<{ ok: true; events: HistoryEntry[] } | { ok: false; message: string }>
}

/** Full props of the side-task panel. */
export type SideTaskPanelProps =
  PropsRuntime<'shell.overlay'>
  & InjectFace<SideTaskPanelInjected>
  & PropsLocale<typeof NS>

/** A task row's display facts pulled from the session list mirror. */
interface TaskRow {
  childId: SessionId
  title: string
  running: boolean
}

/**
 * Derive the current session's task rows from the list mirror. Rows whose
 * child session is no longer listed on the host (deleted elsewhere, pruned
 * host restart) are dropped: their collection ids may survive in localStorage
 * until the next hydrate, but a dead row must not render or stay selectable.
 * @param current - current session id.
 * @param state - the panel store snapshot.
 * @param byId - session list rows by id.
 * @returns ordered task rows.
 */
function taskRows(
  current: SessionId | undefined,
  state: SideTaskState,
  byId: Record<string, { displayTitle?: string; running?: boolean } | undefined>,
): TaskRow[] {
  if (current === undefined) return []
  const children = state.tasksBySession[current] ?? []
  const rows: TaskRow[] = []
  for (const childId of children) {
    const row = byId[childId]
    if (row === undefined) continue
    rows.push({
      childId,
      title: row.displayTitle ?? childId,
      running: row.running === true,
    })
  }
  return rows
}

/** Load one history page, guarding against a stale (superseded) selection. */
async function loadHistory(
  childId: SessionId,
  fetchHistory: SideTaskPanelInjected['fetchHistory'],
): Promise<{ ok: true; events: HistoryEntry[] } | { ok: false; message: string }> {
  return fetchHistory(childId)
}

/**
 * Render the side-task panel.
 * @param props - composed slot props.
 * @returns the panel, or null while closed or no session is current.
 */
export function SideTaskPanel({
  useSessions, useSideTasks,
  createTask, deleteTask, sendTask, stopTask, selectTask, collapsePanel, expandPanel, dismissError, closePanel,
  fetchHistory, t,
}: SideTaskPanelProps) {
  const current = useSessions(state => state.current)
  const state = useSideTasks(snapshot => snapshot)
  const byId = useSessions(snapshot => snapshot.byId as Record<string, { displayTitle?: string; running?: boolean } | undefined>)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<SessionId | null>(null)
  const [entries, setEntries] = useState<readonly HistoryEntry[] | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const prevRunningRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const rows = useMemo(() => taskRows(current, state, byId), [current, state, byId])
  // A selection whose child is no longer rendered (deleted elsewhere, pruned
  // host) reads as unselected: the empty state shows instead of a dead
  // conversation, and the composer cannot target the gone session. The store
  // value is left untouched — the next hydrate/align pass retires it.
  const selected = rows.some(row => row.childId === state.selected) ? state.selected : undefined
  // Only the task's OWN messages render: the forked seed context is the
  // task's working memory, not its transcript.
  const messages = useMemo(() => taskOwnMessageRows(entries ?? undefined), [entries])
  const running = selected !== undefined && byId[selected]?.running === true
  const busy = running || loading

  // Pull the selected task's transcript on selection (and on each refresh).
  useEffect(() => {
    if (selected === undefined) {
      setEntries(null)
      setHistoryError(null)
      return
    }
    let stale = false
    setLoading(true)
    setHistoryError(null)
    void loadHistory(selected, fetchHistory).then(result => {
      if (stale) return
      setLoading(false)
      if (result.ok) setEntries(result.events)
      else {
        setEntries(null)
        setHistoryError(result.message)
      }
    })
    return () => { stale = true }
  }, [selected, fetchHistory, reloadKey])

  // A settled running turn means new assistant output: refresh once.
  useEffect(() => {
    if (prevRunningRef.current && !running && selected !== undefined) {
      setReloadKey(key => key + 1)
    }
    prevRunningRef.current = running
  }, [running, selected])

  // A freshly created/selected task is ready to talk: focus the composer.
  useEffect(() => {
    if (selected !== undefined && !busy) inputRef.current?.focus()
  }, [selected, busy])

  if (!state.open || current === undefined) return null

  // Collapsed resting state: a compact top-right chip that re-expands on
  // click. The chip carries the task count so a collapsed panel still tells
  // the user work exists.
  if (state.collapsed) {
    return (
      <button
        type="button"
        className={css.chip}
        aria-label={t('panel.collapsed')}
        onClick={expandPanel}
      >
        <span className={css.chipLabel}>{t('panel.title')}</span>
        {rows.length > 0 && <span className={css.chipCount} aria-hidden="true">{rows.length}</span>}
      </button>
    )
  }

  const onNew = (): void => { void createTask(current) }
  const onSend = (event: FormEvent): void => {
    event.preventDefault()
    const text = draft.trim()
    if (text === '' || selected === undefined || busy) return
    void sendTask(selected, text).then(() => {
      setDraft('')
      // The send landed in the durable log: re-pull to show the echo.
      setReloadKey(key => key + 1)
    })
  }
  const onDelete = (childId: SessionId): void => {
    if (confirming !== childId) {
      setConfirming(childId)
      return
    }
    setConfirming(null)
    void deleteTask(current, childId)
  }

  return (
    <aside className={css.panel} aria-label={t('panel.title')}>
      <header className={css.header}>
        <h2 className={css.title}>{t('panel.title')}</h2>
        <div className={css.headerActions}>
          <button type="button" className={css.collapse} aria-label={t('panel.collapse')} onClick={collapsePanel}>–</button>
          <button type="button" className={css.close} aria-label={t('panel.close')} onClick={closePanel}>×</button>
        </div>
      </header>
      {state.actionError !== null && (
        <div className={css.errorBar} role="alert">
          <span className={css.errorText}>{t('panel.error')}: {state.actionError}</span>
          <button
            type="button"
            className={css.errorClose}
            aria-label={t('panel.error.close')}
            onClick={dismissError}
          >
            ×
          </button>
        </div>
      )}
      <div className={css.tasks}>
        {rows.length === 0 ? (
          <p className={css.empty}>{t('panel.empty')}</p>
        ) : (
          <ul className={css.taskList}>
            {rows.map(row => (
              <li key={row.childId} className={css.taskRow}>
                <button
                  type="button"
                  className={selected === row.childId ? `${css.taskButton} ${css.taskSelected}` : css.taskButton}
                  aria-label={t('task.select')}
                  onClick={() => selectTask(row.childId)}
                >
                  <span className={row.running ? css.dotRunning : css.dot} aria-hidden="true" />
                  <span className={css.taskTitle}>{row.title}</span>
                </button>
                <button
                  type="button"
                  className={css.delete}
                  aria-label={confirming === row.childId
                    ? (row.running ? t('task.delete.confirm.running') : t('task.delete.confirm'))
                    : t('task.delete')}
                  onClick={() => onDelete(row.childId)}
                >
                  {confirming === row.childId
                    ? (row.running ? t('task.delete.confirm.running') : t('task.delete.confirm'))
                    : t('task.delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={css.newTask} onClick={onNew}>{t('task.new')}</button>
      </div>
      <div className={css.conversation}>
        {selected === undefined ? (
          <p className={css.empty}>{t('conversation.empty')}</p>
        ) : (
          <>
            <div className={css.messages}>
              {loading && <p className={css.loading}>{t('conversation.loading')}</p>}
              {!loading && historyError !== null && (
                <p className={css.error}>{historyError}</p>
              )}
              {!loading && historyError === null && messages.length === 0 && (
                <p className={css.empty}>{t('conversation.none')}</p>
              )}
              {!loading && messages.map((message, index) => (
                <p key={index} className={message.role === 'user' ? css.user : css.assistant}>
                  {message.text}
                </p>
              ))}
              {running && <p className={css.running}>{t('task.running')}</p>}
            </div>
            <form className={css.composer} onSubmit={onSend}>
              <input
                ref={inputRef}
                className={css.input}
                value={draft}
                disabled={busy}
                placeholder={t('conversation.placeholder')}
                aria-label={t('conversation.placeholder')}
                onChange={event => setDraft(event.target.value)}
              />
              {running
                ? (
                  <button type="button" className={css.stop} onClick={() => { void stopTask(selected) }}>
                    {t('conversation.stop')}
                  </button>
                )
                : (
                  <button type="submit" className={css.send} disabled={busy || draft.trim() === '' || selected === undefined}>
                    {t('conversation.send')}
                  </button>
                )}
            </form>
          </>
        )}
      </div>
      <footer className={css.footer}>{t('task.ttl')}</footer>
    </aside>
  )
}
