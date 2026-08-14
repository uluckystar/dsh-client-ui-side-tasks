// @vitest-environment jsdom
/**
 * Session-header side-task action: renders the trigger with the current
 * session's live task count badge and toggles the panel on click. The store
 * is a real engine instance fed through bindSnapshotSelector; the toggle
 * verb is a spy — the controller wiring is covered by the controller spec.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { createSideTasksStore } from '../src/client/store.ts'
import { SideTaskAction, type SideTaskActionProps } from '../src/client/SideTaskAction.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: SideTaskActionProps['t'] = makeTranslate(zh)

function renderAction(tasks: string[] = [], owner: string = 'session-1') {
  const store = createSideTasksStore()
  store.update(draft => {
    draft.tasksBySession[owner as never] = tasks as never
  })
  const togglePanel = vi.fn()
  render(<SideTaskAction {...({
    sessionId: 'session-1',
    useSideTasks: bindSnapshotSelector(store),
    togglePanel,
    t,
  } as unknown as SideTaskActionProps)} />)
  return { togglePanel, store }
}

describe('SideTaskAction', () => {
  it('renders the aria label and no badge without tasks', () => {
    renderAction()
    const button = screen.getByRole('button', { name: '侧边任务' })
    expect(button).toBeTruthy()
    expect(button.querySelector('.count')).toBeNull()
  })

  it('renders no badge when the session has no collection entry', () => {
    // Store without any tasksBySession entry for the header's session.
    const store = createSideTasksStore()
    render(<SideTaskAction {...({
      sessionId: 'session-1',
      useSideTasks: bindSnapshotSelector(store),
      togglePanel: vi.fn(),
      t,
    } as unknown as SideTaskActionProps)} />)
    const button = screen.getByRole('button', { name: '侧边任务' })
    expect(button.querySelector('.count')).toBeNull()
  })

  it('shows the task count badge when the session has tasks', () => {
    renderAction(['task-a', 'task-b'])
    const button = screen.getByRole('button', { name: '侧边任务' })
    expect(button.textContent).toContain('2')
  })

  it('toggles the panel on click', () => {
    const { togglePanel } = renderAction()
    fireEvent.click(screen.getByRole('button', { name: '侧边任务' }))
    expect(togglePanel).toHaveBeenCalledTimes(1)
  })

  it('re-renders the badge when the collection changes', () => {
    const { store } = renderAction()
    const button = screen.getByRole('button', { name: '侧边任务' })
    expect(button.textContent).not.toContain('1')
    act(() => {
      store.update(draft => {
        draft.tasksBySession['session-1' as never] = ['task-a'] as never
      })
    })
    expect(button.textContent).toContain('1')
  })
})
