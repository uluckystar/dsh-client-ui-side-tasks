// @vitest-environment jsdom
/**
 * ui-side-tasks plugin halves: the browser entry's dictionary, header-slot
 * and overlay registrations against the real SlotRegistry (with fiber
 * teardown proving removal — HMR safety), the inject verbs against a real
 * controller, the inert node entry, and the invariant companion's ownership
 * reservation.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as SideTaskInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'

const sid = (s: string): SessionId => s as SessionId

/** Entry ids currently registered in the header list. */
function headerEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('conversation.session.header.actions')
    .map(entry => entry.options.id)
}

/** Entry ids currently registered in the frame overlay list. */
function overlayEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('shell.overlay')
    .map(entry => entry.options.id)
}

/** Invoke an entry's inject factory, mirroring the renderer's cached call. */
function runInject(entry: { inject?: unknown }, args: unknown[] = []): unknown {
  const factory = entry.inject as ((...rest: unknown[]) => unknown) | undefined
  if (factory === undefined) throw new Error('entry declares no inject factory')
  return factory(...args)
}

/** Boot the browser half over a real slot tree that declares both seats. */
async function bench(options: { historyError?: string } = {}): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.actions': { kind: 'list', scope: 'session' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('sessions', {
    fork: async () => sid('task-child'),
    archiveSession: async () => undefined,
    delete: async () => undefined,
    history: async () => options.historyError === undefined
      ? { ok: true, value: { events: [], hasMore: false } }
      : { ok: false, error: { code: 'internal', message: options.historyError, details: {} } },
    binding: () => undefined,
    list: {
      getSnapshot: () => ({ current: sid('owner-1'), byId: {} }),
      subscribe: () => () => {},
    },
  } as never)
  ctx.provide('workspaces', {
    archiveSession: async () => undefined,
  } as never)
  // The locale plugin binds a settings scope, which reads the connection handle
  // and the forwarded-event port.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  ctx.provide('remote', { $on: () => () => {} } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('ui-side-tasks browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'sessions', 'workspaces', 'locale'])
  })

  it('registers the header action and the overlay panel; fiber teardown removes both (HMR safety)', async () => {
    const { ctx, fiber } = await bench()
    expect(headerEntryIds(ctx)).toContain('side-task')
    expect(overlayEntryIds(ctx)).toContain('side-task-panel')
    await fiber.dispose()
    expect(headerEntryIds(ctx)).not.toContain('side-task')
    expect(overlayEntryIds(ctx)).not.toContain('side-task-panel')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await bench()
    const translate = ctx.locale.bind(NS)
    ctx.locale.setLocale('zh')
    expect(translate('action.aria')).toBe(zh['action.aria'])
    ctx.locale.setLocale('en')
    expect(translate('action.aria')).toBe(en['action.aria'])

    // Withdrawn dictionaries leave the key unresolved rather than translated.
    await fiber.dispose()
    expect(translate('action.aria')).not.toBe(en['action.aria'])
  })

  it('wires the inject faces to the shared controller (verbs reachable from components)', async () => {
    const { ctx, fiber } = await bench()
    const header = ctx.slots.entries('conversation.session.header.actions')[0]!
    const panel = ctx.slots.entries('shell.overlay')[0]!
    const headerFace = runInject(header, []) as {
      hooks: { sideTasks: unknown }
      togglePanel: () => void
    }
    const panelFace = runInject(panel) as {
      hooks: { sideTasks: unknown }
      createTask: (owner: SessionId) => Promise<void>
      deleteTask: (owner: SessionId, child: SessionId) => Promise<void>
      sendTask: (child: SessionId, text: string) => Promise<void>
      stopTask: (child: SessionId) => Promise<void>
      selectTask: (child: SessionId) => void
      collapsePanel: () => void
      expandPanel: () => void
      dismissError: () => void
      closePanel: () => void
      fetchHistory: (child: SessionId) => Promise<{ ok: true; events: unknown[] } | { ok: false; message: string }>
    }
    // Both faces expose the same shared store source (the controller instance).
    expect(headerFace.hooks.sideTasks).toBe(panelFace.hooks.sideTasks)
    expect(typeof headerFace.togglePanel).toBe('function')
    expect(typeof panelFace.createTask).toBe('function')
    expect(typeof panelFace.deleteTask).toBe('function')
    expect(typeof panelFace.sendTask).toBe('function')
    expect(typeof panelFace.stopTask).toBe('function')
    expect(typeof panelFace.selectTask).toBe('function')
    expect(typeof panelFace.collapsePanel).toBe('function')
    expect(typeof panelFace.expandPanel).toBe('function')
    expect(typeof panelFace.dismissError).toBe('function')
    expect(typeof panelFace.closePanel).toBe('function')
    // The panel pulls task transcripts through the history-backed verb.
    await expect(panelFace.fetchHistory(sid('task-a'))).resolves.toEqual({ ok: true, events: [] })
    // A host rejection reaches the panel as the failure branch.
    const { ctx: failCtx, fiber: failFiber } = await bench({ historyError: 'boom' })
    const failPanel = failCtx.slots.entries('shell.overlay')[0]!
    const failFace = runInject(failPanel) as { fetchHistory: (child: SessionId) => Promise<unknown> }
    await expect(failFace.fetchHistory(sid('task-a'))).resolves.toEqual({ ok: false, message: 'boom' })
    await failFiber.dispose()
    // The verbs run against the fake sessions port without throwing.
    panelFace.selectTask(sid('task-a'))
    panelFace.dismissError()
    panelFace.collapsePanel()
    panelFace.expandPanel()
    await expect(panelFace.sendTask(sid('task-a'), 'hi')).resolves.toBeUndefined()
    await expect(panelFace.stopTask(sid('task-a'))).resolves.toBeUndefined()
    await expect(panelFace.createTask(sid('owner-1'))).resolves.toBeUndefined()
    await expect(panelFace.deleteTask(sid('owner-1'), sid('task-a'))).resolves.toBeUndefined()
    headerFace.togglePanel()
    panelFace.closePanel()
    await fiber.dispose()
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-side-tasks node half', () => {
  it('contributes no host behavior', () => {
    // The node half exists only so the plugin appears in the Loader tree.
    expect(() => applyNode()).not.toThrow()
  })
})

describe('ui-side-tasks invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(SideTaskInvariant)
    await fiber.await()
    expect(SideTaskInvariant.name).toBe('client-ui-side-tasks-invariant')
    expect(SideTaskInvariant.inject).toEqual(['invariants'])
  })
})

describe('ui-side-tasks expiry sweep boot', () => {
  it('boots the background sweep with the plugin fiber and stops it on teardown', async () => {
    const { ctx, fiber } = await bench()
    // The sweep effect runs once at boot (the interval is idle); it must not
    // throw against the empty collections.
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(1)
    await fiber.dispose()
  })
})
