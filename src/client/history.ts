/** Read-only history adaptation; never infers a destructive API from its name. */
import type {SideTasksSessions} from './controller.ts'
type History = SideTasksSessions['history']
type Result = Awaited<ReturnType<History>>
type Id = Parameters<History>[0]
type Options = Parameters<History>[1]
export interface WireHistory {
  history?(payload: {sessionId: Id; beforeSeq?: number; maxMessages?: number}): Promise<{result: Result}>
}
/** Prefer the legacy service where present; otherwise use the declared public wire history method. */
export function historyReader(legacy: {history?: History}, wire?: WireHistory) {
  const available = () => typeof legacy.history === 'function' || typeof wire?.history === 'function'
  const read: History = async (sessionId: Id, opts: Options) => {
    try {
      let result: Result
      if (typeof legacy.history === 'function') result = await legacy.history.call(legacy, sessionId, opts)
      else if (typeof wire?.history === 'function') {
        const response = await wire.history.call(wire, {sessionId,
          ...(opts.beforeSeq === undefined ? {} : {beforeSeq: opts.beforeSeq}),
          ...(opts.maxMessages === undefined ? {} : {maxMessages: opts.maxMessages})})
        result = response?.result
      } else throw new Error('This DSH does not provide session history / 当前 DSH 未提供历史读取能力')
      if (!result || typeof result.ok !== 'boolean' || (result.ok && !Array.isArray(result.value?.events)) || (!result.ok && typeof result.error?.message !== 'string')) throw new Error('Invalid session history response')
      return result
    } catch (error) {
      return {ok: false, error: {code: 'internal', message: error instanceof Error ? error.message : String(error), details: {}}}
    }
  }
  return {available, read}
}
