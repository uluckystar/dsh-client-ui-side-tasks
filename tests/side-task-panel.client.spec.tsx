// @vitest-environment jsdom
/**
 * Side-task panel: open/close lifecycle, task list rendering with running
 * state, create (fork) via the injected verb, pull-based mini-conversation
 * (fetch on selection, refresh on settle/send, loading and error states),
 * send/stop, and delete with two-step confirm. All framework hooks are
 * stubbed and every verb is a spy — the panel is pure presentation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { HistoryEntry, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { createSideTasksStore } from '../src/client/store.ts'
import { SideTaskPanel, type SideTaskPanelProps } from '../src/client/SideTaskPanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const sid = (s: string): SessionId => s as SessionId
const t: SideTaskPanelProps['t'] = makeTranslate(zh)

function sessionList(
  rows: Record<string, { title?: string; running?: boolean }>,
  current: string | undefined,
): SessionListState {
  return {
    ids: Object.keys(rows) as SessionId[],
    byId: Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, {
      id: sid(id),
      // No fallback: the panel itself owns the id fallback, so an absent
      // title here exercises the component's displayTitle ?? childId branch.
      displayTitle: row.title,
      running: row.running ?? false,
      blank: false,
      updatedAt: 1,
    }])) as SessionListState['byId'],
    current: current as SessionId | undefined,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

/** Build one durable-log history entry of the given message type. */
function messageEntry(type: 'user/message' | 'assistant/message', text: string, seq: number): HistoryEntry {
  return {
    event: {
      type,
      seq,
      time: seq,
      data: type === 'user/message'
        ? { content: [{ type: 'text', text }] }
        : { message: { content: [{ type: 'text', text }] } },
    },
  } as never
}

function renderPanel(options: {
  open?: boolean
  lifecycleSupported?: boolean
  tasks?: string[]
  selected?: string
  running?: boolean
  /** An action error to surface in the error bar. */
  actionError?: string | null
  /** History entries the fetchHistory stub resolves with. */
  history?: HistoryEntry[]
  /** If set, fetchHistory rejects/returns the failure message. */
  historyError?: string
  /** Resolve fetchHistory after this many microtasks (loading-state test). */
  deferred?: boolean
  /** Epoch-ms last activity per task (drives the expiry countdown). */
  lastActivity?: Record<string, number>
  current?: string | undefined
  /** Session-list rows; defaults to one row per task, override to omit some. */
  rows?: Record<string, { title?: string; running?: boolean }>
} = {}) {
  const store = createSideTasksStore()
  store.update(draft => {
    draft.open = options.open ?? true
    draft.selected = options.selected as never
    draft.actionError = options.actionError ?? null
    if (options.tasks !== undefined) {
      draft.tasksBySession['session-1' as never] = options.tasks as never
    }
    if (options.lastActivity !== undefined) {
      draft.lastActivity = options.lastActivity as never
    }
  })

  // `current` defaults to 'session-1' unless explicitly passed (undefined is a
  // meaningful value here: it drives the no-session hidden state).
  const current = 'current' in options ? options.current : 'session-1'
  const list = sessionList(
    options.rows ?? Object.fromEntries(
      (options.tasks ?? []).map(id => [id, {
        title: `Task ${id}`,
        running: options.running === true && id === options.selected,
      }]),
    ),
    current,
  )
  function useSessions<T>(select: (snapshot: SessionListState) => T): T {
    return select(list)
  }

  const createTask = vi.fn(async () => undefined)
  const deleteTask = vi.fn(async () => undefined)
  const sendTask = vi.fn(async () => true)
  const stopTask = vi.fn(async () => true)
  const selectTask = vi.fn()
  const collapsePanel = vi.fn()
  const expandPanel = vi.fn()
  const dismissError = vi.fn()
  const closePanel = vi.fn()
  const fetchHistory = vi.fn(async (): Promise<{ ok: true; events: HistoryEntry[] } | { ok: false; message: string }> => {
    if (options.historyError !== undefined) return { ok: false, message: options.historyError }
    if (options.deferred === true) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    return { ok: true, events: options.history ?? [] }
  })

  const view = render(<SideTaskPanel {...({
    useSessions,
    lifecycleSupported: options.lifecycleSupported,
    useSideTasks: bindSnapshotSelector(store),
    createTask,
    deleteTask,
    sendTask,
    stopTask,
    selectTask,
    collapsePanel,
    expandPanel,
    dismissError,
    closePanel,
    fetchHistory,
    t,
  } as unknown as SideTaskPanelProps)} />)
  return {
    store, createTask, deleteTask, sendTask, stopTask, selectTask, collapsePanel, expandPanel,
    dismissError, closePanel, fetchHistory,
    /** Re-render with a mutated session list (drives running-bit flips). */
    rerenderWithList(next: SessionListState) {
      function useSessionsNext<T>(select: (snapshot: SessionListState) => T): T {
        return select(next)
      }
      view.rerender(<SideTaskPanel {...({
        useSessions: useSessionsNext,
        useSideTasks: bindSnapshotSelector(store),
        createTask,
        deleteTask,
        sendTask,
        stopTask,
        selectTask,
        collapsePanel,
        expandPanel,
        dismissError,
        closePanel,
        fetchHistory,
        t,
      } as unknown as SideTaskPanelProps)} />)
    },
  }
}

describe('SideTaskPanel lifecycle', () => {
  it('renders nothing while closed', () => {
    renderPanel({ open: false })
    expect(screen.queryByText('侧边任务')).toBeNull()
  })

  it('renders the collapsed chip as the resting state, with the task count', () => {
    const { store, expandPanel } = renderPanel({ tasks: ['task-a', 'task-b'] })
    act(() => { store.update(draft => { draft.collapsed = true }) })
    // The chip is compact: title + count, no task list and no composer.
    const chip = screen.getByRole('button', { name: '展开侧边任务面板' })
    expect(chip).toBeTruthy()
    expect(chip.textContent).toContain('2')
    expect(screen.queryByRole('button', { name: '新建侧边任务' })).toBeNull()
    fireEvent.click(chip)
    expect(expandPanel).toHaveBeenCalled()
  })

  it('collapses the full panel through the header collapse button', () => {
    const { collapsePanel } = renderPanel({ tasks: [] })
    fireEvent.click(screen.getByRole('button', { name: '收起面板' }))
    expect(collapsePanel).toHaveBeenCalled()
  })

  it('renders nothing without a current session', () => {
    renderPanel({ tasks: ['task-a'], current: undefined })
    expect(screen.queryByText('侧边任务')).toBeNull()
  })

  it('renders the panel with title and empty state when no tasks exist', () => {
    renderPanel({ tasks: [] })
    expect(screen.getByText('侧边任务')).toBeTruthy()
    expect(screen.getByText('暂无侧边任务')).toBeTruthy()
    expect(screen.getByRole('button', { name: '新建侧边任务' })).toBeTruthy()
  })

  it('renders an empty task area when the current session has no collection entry', () => {
    // The store carries no entry for the current session (never hydrated).
    renderPanel({ tasks: undefined as never })
    expect(screen.getByText('暂无侧边任务')).toBeTruthy()
  })

  it('closes via the close button without touching tasks', () => {
    const { closePanel, store } = renderPanel({ tasks: ['task-a'] })
    fireEvent.click(screen.getByRole('button', { name: '关闭面板' }))
    expect(closePanel).toHaveBeenCalledTimes(1)
    // The close verb is a UI-only action; the collection is untouched here.
    expect(store.getSnapshot().tasksBySession['session-1' as never]).toEqual(['task-a'])
  })
})

describe('SideTaskPanel task list', () => {
  it('lists tasks with their display titles and running state', () => {
    renderPanel({ tasks: ['task-a', 'task-b'], selected: 'task-a', running: true })
    expect(screen.getByText('Task task-a')).toBeTruthy()
    expect(screen.getByText('Task task-b')).toBeTruthy()
    // The running task row carries the running dot; the idle row the idle dot.
    expect(document.querySelector('[class*="dotRunning"]')).toBeTruthy()
    expect(document.querySelector('[class*="dot"]')).toBeTruthy()
  })

  it('selects a task on row click', () => {
    const { selectTask } = renderPanel({ tasks: ['task-a', 'task-b'] })
    fireEvent.click(screen.getAllByRole('button', { name: '切换到任务' })[0]!)
    expect(selectTask).toHaveBeenCalledWith('task-a')
  })

  it('hides a task whose child session is absent from the session list', () => {
    renderPanel({ tasks: ['ghost-task'], rows: {} })
    // A child deleted elsewhere or pruned by a host restart must not render
    // as a dead row: the collection may lag until the next hydrate, but the
    // surface shows the empty state instead.
    expect(screen.queryByText('ghost-task')).toBeNull()
    expect(screen.getByText('暂无侧边任务')).toBeTruthy()
  })

  it('falls back to the child id for a listed task without a display title', () => {
    renderPanel({ tasks: ['untitled-task'], rows: { 'untitled-task': {} } })
    // The row exists on the host but carries no title yet (title arrival
    // lags creation): the id names the task until the title lands.
    expect(screen.getByText('untitled-task')).toBeTruthy()
  })

  it('creates a task through the injected verb', () => {
    const { createTask } = renderPanel({ tasks: [] })
    fireEvent.click(screen.getByRole('button', { name: '新建侧边任务' }))
    expect(createTask).toHaveBeenCalledWith('session-1')
  })
})

describe('SideTaskPanel mini conversation (pull-based)', () => {
  it('prompts for selection when no task is selected', () => {
    renderPanel({ tasks: ['task-a'] })
    expect(screen.getByText('选择任务开始对话')).toBeTruthy()
  })

  it('fetches the selected task history once on selection and renders the transcript', async () => {
    const { fetchHistory } = renderPanel({
      tasks: ['task-a'],
      selected: 'task-a',
      history: [
        messageEntry('user/message', 'hello', 1),
        messageEntry('assistant/message', 'hi there', 2),
      ],
    })
    expect(fetchHistory).toHaveBeenCalledWith('task-a')
    await waitFor(() => expect(screen.getByText('hello')).toBeTruthy())
    expect(screen.getByText('hi there')).toBeTruthy()
  })

  it('shows a loading state while the page is in flight', async () => {
    renderPanel({ tasks: ['task-a'], selected: 'task-a', deferred: true })
    expect(screen.getByText('加载中…')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('加载中…')).toBeNull())
  })

  it('shows the failure message when the fetch rejects', async () => {
    renderPanel({ tasks: ['task-a'], selected: 'task-a', historyError: 'fetch exploded' })
    await waitFor(() => expect(screen.getByText('fetch exploded')).toBeTruthy())
  })

  it('ignores a superseded fetch when the selection moves', async () => {
    // First selection pulls a deferred page; the panel switches away before it
    // lands, so the stale result must not render.
    const { store, fetchHistory } = renderPanel({
      tasks: ['task-a', 'task-b'],
      selected: 'task-a',
      deferred: true,
      history: [messageEntry('user/message', 'stale text', 1)],
    })
    expect(screen.getByText('加载中…')).toBeTruthy()
    act(() => {
      store.update(draft => { draft.selected = 'task-b' as never })
    })
    // The second selection starts its own pull; the superseded one's text
    // never renders once it lands.
    await waitFor(() => expect(fetchHistory.mock.calls.length).toBeGreaterThan(1))
    expect(screen.queryByText('stale text')).toBeNull()
  })

  it('shows the no-messages hint for an empty transcript', async () => {
    renderPanel({ tasks: ['task-a'], selected: 'task-a', history: [] })
    await waitFor(() => expect(screen.getByText('新任务,直接对话')).toBeTruthy())
  })

  it('ignores non-message history events', async () => {
    const toolEvent = { event: { type: 'tool/call', seq: 1, time: 1, data: { name: 'bash' } } } as never
    renderPanel({
      tasks: ['task-a'],
      selected: 'task-a',
      history: [toolEvent, messageEntry('user/message', 'only text', 2)],
    })
    await waitFor(() => expect(screen.getByText('only text')).toBeTruthy())
    expect(screen.queryByText('bash')).toBeNull()
  })

  it('shows the running indicator and a stop button while running', async () => {
    const { stopTask } = renderPanel({
      tasks: ['task-a'],
      selected: 'task-a',
      running: true,
      history: [messageEntry('user/message', 'go', 1)],
    })
    await waitFor(() => expect(screen.getAllByText('运行中').length).toBeGreaterThanOrEqual(2))
    fireEvent.click(screen.getByRole('button', { name: '停止' }))
    expect(stopTask).toHaveBeenCalledWith('task-a')
  })

  it('refreshes the transcript when a running turn settles', async () => {
    const { fetchHistory, rerenderWithList } = renderPanel({
      tasks: ['task-a'],
      selected: 'task-a',
      running: true,
      history: [messageEntry('user/message', 'question', 1)],
    })
    await waitFor(() => expect(screen.getByText('question')).toBeTruthy())
    const callsBefore = fetchHistory.mock.calls.length

    // The task settles: flip the running bit off and re-render the panel.
    const idleList = sessionList(
      { 'task-a': { title: 'Task task-a', running: false } },
      'session-1',
    )
    act(() => { rerenderWithList(idleList) })
    await waitFor(() => expect(fetchHistory.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('refreshes the transcript after a send lands', async () => {
    const { fetchHistory } = renderPanel({
      tasks: ['task-a'],
      selected: 'task-a',
      history: [messageEntry('user/message', 'before', 1)],
    })
    await waitFor(() => expect(screen.getByText('before')).toBeTruthy())
    const callsBefore = fetchHistory.mock.calls.length

    const input = screen.getByRole('textbox', { name: '输入消息…' })
    fireEvent.change(input, { target: { value: 'after' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(fetchHistory.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})

describe('SideTaskPanel composer', () => {
  it('sends the draft text and clears it on success', async () => {
    const { sendTask } = renderPanel({ tasks: ['task-a'], selected: 'task-a', history: [] })
    // Wait for the initial history pull to settle so the input is enabled.
    await waitFor(() => expect(screen.getByText('新任务,直接对话')).toBeTruthy())
    const input = screen.getByRole('textbox', { name: '输入消息…' })
    fireEvent.change(input, { target: { value: 'go build' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(sendTask).toHaveBeenCalledWith('task-a', 'go build'))
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('disables the input while the task runs', () => {
    renderPanel({ tasks: ['task-a'], selected: 'task-a', running: true })
    expect((screen.getByRole('textbox', { name: '输入消息…' }) as HTMLInputElement).disabled).toBe(true)
  })

  it('does not send an empty draft', async () => {
    const { sendTask } = renderPanel({ tasks: ['task-a'], selected: 'task-a', history: [] })
    await waitFor(() => expect(screen.getByText('新任务,直接对话')).toBeTruthy())
    fireEvent.submit(screen.getByRole('textbox', { name: '输入消息…' }).closest('form')!)
    expect(sendTask).not.toHaveBeenCalled()
  })
})

describe('SideTaskPanel delete', () => {
  it('requires a second click to confirm a delete', () => {
    const { deleteTask } = renderPanel({ tasks: ['task-a'], selected: 'task-a' })
    const button = screen.getByRole('button', { name: '删除任务' })
    fireEvent.click(button)
    // First click arms the confirm state; the task is not deleted yet.
    expect(deleteTask).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '确认删除' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(deleteTask).toHaveBeenCalledWith('session-1', 'task-a')
  })

  it('re-arms the confirm on a different task row', () => {
    const { deleteTask } = renderPanel({ tasks: ['task-a', 'task-b'] })
    fireEvent.click(screen.getAllByRole('button', { name: '删除任务' })[0]!)
    expect(screen.getByRole('button', { name: '确认删除' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    expect(deleteTask).toHaveBeenCalledWith('session-1', 'task-a')
  })

  it('uses the running-specific confirm copy when deleting a running task', () => {
    renderPanel({ tasks: ['task-a'], selected: 'task-a', running: true })
    fireEvent.click(screen.getByRole('button', { name: '删除任务' }))
    // Deleting a running task interrupts its agent: the confirm warns about it.
    expect(screen.getByRole('button', { name: '任务运行中,删除将中断它' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '任务运行中,删除将中断它' }))
    expect(screen.queryByRole('button', { name: '任务运行中,删除将中断它' })).toBeNull()
  })

  it('keeps the plain confirm copy for an idle task', () => {
    renderPanel({ tasks: ['task-a'], selected: 'task-a' })
    fireEvent.click(screen.getByRole('button', { name: '删除任务' }))
    expect(screen.getByRole('button', { name: '确认删除' })).toBeTruthy()
  })
})

describe('SideTaskPanel action error bar', () => {
  it('renders the error bar with the failure message when an action failed', () => {
    renderPanel({ tasks: ['task-a'], selected: 'task-a', actionError: 'session-not-found' })
    expect(screen.getByText(/操作失败/)).toBeTruthy()
    expect(screen.getByText(/session-not-found/)).toBeTruthy()
  })

  it('renders no error bar without an action error', () => {
    renderPanel({ tasks: ['task-a'] })
    expect(screen.queryByText(/操作失败/)).toBeNull()
  })

  it('dismisses the error bar through the injected verb', () => {
    const { dismissError } = renderPanel({ tasks: ['task-a'], actionError: 'boom' })
    fireEvent.click(screen.getByRole('button', { name: '关闭错误提示' }))
    expect(dismissError).toHaveBeenCalledTimes(1)
  })
})

describe('SideTaskPanel expiry countdown', () => {
  it('shows the remaining time for each task based on its last activity', () => {
    // A task touched 30 minutes ago with a 60-minute TTL has ~30 minutes left.
    renderPanel({
      tasks: ['task-a'],
      lastActivity: { 'task-a': Date.now() - 30 * 60 * 1000 },
    })
    expect(screen.getByText(/还剩 \d+ 分钟自动删除/)).toBeTruthy()
  })

  it('ticks the countdown clock each second', () => {
    vi.useFakeTimers()
    try {
      renderPanel({
        tasks: ['task-a'],
        lastActivity: { 'task-a': Date.now() - 30 * 60 * 1000 },
      })
      act(() => { vi.advanceTimersByTime(1000) })
      expect(screen.getByText(/还剩 \d+ 分钟自动删除/)).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows no countdown for a task without a recorded activity timestamp', () => {
    renderPanel({ tasks: ['task-a'] })
    // The row carries no per-task expiry readout (the static footer hint is
    // not a countdown).
    expect(screen.queryByText(/还剩 \d+ 分钟自动删除/)).toBeNull()
  })
})


it('unsupported lifecycle disables creation/deletion and does not promise automatic expiry', () => {
  const face=renderPanel({tasks:['task-1'],selected:'task-1',lifecycleSupported:false,lastActivity:{'task-1':Date.now()}})
  const create=screen.getByRole('button',{name:zh['task.new']}) as HTMLButtonElement
  const remove=screen.getByRole('button',{name:zh['task.delete']}) as HTMLButtonElement
  expect(create.disabled).toBe(true);expect(remove.disabled).toBe(true)
  fireEvent.click(create);fireEvent.click(remove)
  expect(face.createTask).not.toHaveBeenCalled();expect(face.deleteTask).not.toHaveBeenCalled()
  expect(screen.queryByText(zh['task.ttl'])).toBeNull()
  expect(screen.getAllByText(zh['task.unsupported']).length).toBeGreaterThan(0)
})

describe('composer RPC acknowledgements', () => {
  it('keeps the draft and does not reload history after a rejected send', async () => {
    const {sendTask,fetchHistory} = renderPanel({tasks:['task-a'],selected:'task-a',history:[]})
    await waitFor(() => expect(screen.getByText('新任务,直接对话')).toBeTruthy())
    sendTask.mockResolvedValueOnce(false)
    const calls = fetchHistory.mock.calls.length
    const input = screen.getByRole('textbox',{name:'输入消息…'}) as HTMLInputElement
    fireEvent.change(input,{target:{value:'do not lose me'}})
    await act(async () => {fireEvent.submit(input.closest('form')!)})
    expect(sendTask).toHaveBeenCalledWith('task-a','do not lose me')
    expect(input.value).toBe('do not lose me')
    expect(fetchHistory.mock.calls.length).toBe(calls)
  })
})

describe('composer in-flight safety', () => {
  it('does not duplicate a pending send or clear a newer edit on acknowledgement', async () => {
    const {sendTask} = renderPanel({tasks:['task-a'],selected:'task-a',history:[]})
    await waitFor(() => expect(screen.getByText('新任务,直接对话')).toBeTruthy())
    let finish!: (accepted:boolean) => void
    sendTask.mockImplementationOnce(() => new Promise<boolean>(resolve => {finish=resolve}))
    const input=screen.getByRole('textbox',{name:'输入消息…'}) as HTMLInputElement
    fireEvent.change(input,{target:{value:'first'}})
    fireEvent.submit(input.closest('form')!)
    fireEvent.submit(input.closest('form')!)
    expect(sendTask).toHaveBeenCalledTimes(1)
    fireEvent.change(input,{target:{value:'second draft'}})
    await act(async () => {finish(true)})
    expect(input.value).toBe('second draft')
  })

  it('keeps the draft and surfaces an unexpected promise rejection', async () => {
    const {sendTask} = renderPanel({tasks:['task-a'],selected:'task-a',history:[]})
    await waitFor(() => expect(screen.getByText('新任务,直接对话')).toBeTruthy())
    sendTask.mockRejectedValueOnce(new Error('transport disconnected'))
    const input=screen.getByRole('textbox',{name:'输入消息…'}) as HTMLInputElement
    fireEvent.change(input,{target:{value:'retry this'}})
    await act(async () => {fireEvent.submit(input.closest('form')!)})
    expect(input.value).toBe('retry this')
    expect(screen.getByRole('alert').textContent).toContain('transport disconnected')
  })

  it('does not clear the new selection draft when an earlier task finishes sending', async () => {
    const {sendTask,store} = renderPanel({tasks:['task-a','task-b'],selected:'task-a',history:[]})
    await waitFor(() => expect(screen.getByText('新任务,直接对话')).toBeTruthy())
    let finish!: (accepted:boolean) => void
    sendTask.mockImplementationOnce(() => new Promise<boolean>(resolve => {finish=resolve}))
    const input=screen.getByRole('textbox',{name:'输入消息…'}) as HTMLInputElement
    fireEvent.change(input,{target:{value:'same text'}})
    fireEvent.submit(input.closest('form')!)
    act(() => {store.update(draft => {draft.selected='task-b' as never})})
    await waitFor(() => expect(input.disabled).toBe(false))
    await act(async () => {finish(true)})
    expect(input.value).toBe('same text')
  })
})
