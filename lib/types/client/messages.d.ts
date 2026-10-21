/**
 * Mini-conversation projection: reduce a pulled history page to the text
 * user/assistant rows the side-task panel renders. Tool calls, context
 * injections, and other surface events are intentionally ignored — the panel
 * is a compact task scratchpad, not the full transcript.
 *
 * Event shapes follow the durable JSONL log: a `user/message` carries its
 * content blocks directly under `data.content`; an `assistant/message`
 * carries them under `data.message.content`. Both `data.content` and
 * `data.message.content` variants are tolerated for each type so the reader
 * stays robust against log-format evolution.
 */
import type { HistoryEntry } from '@deepseek-ai/dsh-api-remotes/client';
/** One text row of the mini conversation. */
export interface TaskMessageRow {
    role: 'user' | 'assistant';
    text: string;
}
/**
 * Extract user/assistant text rows from a history page, in log order. Empty
 * text rows are dropped.
 * @param entries - pulled history entries, or undefined while none are loaded.
 * @returns the ordered text rows.
 */
export declare function taskMessageRows(entries: readonly HistoryEntry[] | undefined): TaskMessageRow[];
/**
 * Extract the task's OWN message rows, hiding the forked seed context: the
 * side task carries the owner's full history in its log, but the panel is a
 * scratchpad — it shows only messages written after the task's OWN seed
 * boundary. The boundary is the LAST `session/end-seed`: the seed may itself
 * nest earlier end-seed markers (the owner was resumed or forked before),
 * and only the task's own marker sits after all seeded messages. A page that
 * does not reach the boundary (a task with more messages than one page)
 * falls back to the whole page.
 * @param entries - pulled history entries, or undefined while none are loaded.
 * @returns the ordered text rows of the task's own conversation.
 */
export declare function taskOwnMessageRows(entries: readonly HistoryEntry[] | undefined): TaskMessageRow[];
//# sourceMappingURL=messages.d.ts.map