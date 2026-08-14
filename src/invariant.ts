/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-side-tasks`.
 * @module @deepseek-ai/dsh-client-ui-side-tasks/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-side-tasks'

/** Cordis companion plugin name. */
export const name = 'client-ui-side-tasks-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the side-task collection is registrant-private
 * localStorage state keyed by session id, surfaced through two slot
 * registrations whose disposal is proven by the HMR-safety spec. The plugin
 * emits no cordis events and holds no cross-plugin mutable state; the fork
 * children it tracks are ordinary listed sessions, so every durable
 * relationship rides existing session-list machinery.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
