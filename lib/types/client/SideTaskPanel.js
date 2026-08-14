import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Side-task overlay panel: a fixed right-hand surface beside the main
 * conversation, owned by the current session. Lists the session's forked
 * task children (persisted per owner), shows a mini conversation for the
 * selected task, and sends/cancels prompts. Closing the panel only hides the
 * UI — tasks and their agents stay alive; deleting a task disposes the host
 * agent and erases its stored log through `session.delete`.
 *
 * The mini conversation is pull-based: the event window only backfills the
 * current session, so the panel fetches the selected task's durable history
 * (`fetchHistory` -> `session.history`) on selection, refreshes when a
 * running turn settles, and refreshes after each send.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { taskMessageRows } from "./messages.js";
import css from './SideTaskPanel.module.css';
/**
 * Derive the current session's task rows from the list mirror.
 * @param current - current session id.
 * @param state - the panel store snapshot.
 * @param byId - session list rows by id.
 * @returns ordered task rows.
 */
function taskRows(current, state, byId) {
    if (current === undefined)
        return [];
    const children = state.tasksBySession[current] ?? [];
    return children.map(childId => ({
        childId,
        title: byId[childId]?.displayTitle ?? childId,
        running: byId[childId]?.running === true,
    }));
}
/** Load one history page, guarding against a stale (superseded) selection. */
async function loadHistory(childId, fetchHistory) {
    return fetchHistory(childId);
}
/**
 * Render the side-task panel.
 * @param props - composed slot props.
 * @returns the panel, or null while closed or no session is current.
 */
export function SideTaskPanel({ useSessions, useSideTasks, createTask, deleteTask, sendTask, stopTask, selectTask, closePanel, fetchHistory, t, }) {
    const current = useSessions(state => state.current);
    const state = useSideTasks(snapshot => snapshot);
    const byId = useSessions(snapshot => snapshot.byId);
    const [draft, setDraft] = useState('');
    const [confirming, setConfirming] = useState(null);
    const [entries, setEntries] = useState(null);
    const [historyError, setHistoryError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const prevRunningRef = useRef(false);
    const rows = useMemo(() => taskRows(current, state, byId), [current, state, byId]);
    const selected = state.selected;
    const messages = useMemo(() => taskMessageRows(entries ?? undefined), [entries]);
    const running = selected !== undefined && byId[selected]?.running === true;
    const busy = running || loading;
    // Pull the selected task's transcript on selection (and on each refresh).
    useEffect(() => {
        if (selected === undefined) {
            setEntries(null);
            setHistoryError(null);
            return;
        }
        let stale = false;
        setLoading(true);
        setHistoryError(null);
        void loadHistory(selected, fetchHistory).then(result => {
            if (stale)
                return;
            setLoading(false);
            if (result.ok)
                setEntries(result.events);
            else {
                setEntries(null);
                setHistoryError(result.message);
            }
        });
        return () => { stale = true; };
    }, [selected, fetchHistory, reloadKey]);
    // A settled running turn means new assistant output: refresh once.
    useEffect(() => {
        if (prevRunningRef.current && !running && selected !== undefined) {
            setReloadKey(key => key + 1);
        }
        prevRunningRef.current = running;
    }, [running, selected]);
    if (!state.open || current === undefined)
        return null;
    const onNew = () => { void createTask(current); };
    const onSend = (event) => {
        event.preventDefault();
        const text = draft.trim();
        if (text === '' || selected === undefined || busy)
            return;
        void sendTask(selected, text).then(() => {
            setDraft('');
            // The send landed in the durable log: re-pull to show the echo.
            setReloadKey(key => key + 1);
        });
    };
    const onDelete = (childId) => {
        if (confirming !== childId) {
            setConfirming(childId);
            return;
        }
        setConfirming(null);
        void deleteTask(current, childId);
    };
    return (_jsxs("aside", { className: css.panel, "aria-label": t('panel.title'), children: [_jsxs("header", { className: css.header, children: [_jsx("h2", { className: css.title, children: t('panel.title') }), _jsx("button", { type: "button", className: css.close, "aria-label": t('panel.close'), onClick: closePanel, children: "\u00D7" })] }), _jsxs("div", { className: css.tasks, children: [rows.length === 0 ? (_jsx("p", { className: css.empty, children: t('panel.empty') })) : (_jsx("ul", { className: css.taskList, children: rows.map(row => (_jsxs("li", { className: css.taskRow, children: [_jsxs("button", { type: "button", className: selected === row.childId ? `${css.taskButton} ${css.taskSelected}` : css.taskButton, "aria-label": t('task.select'), onClick: () => selectTask(row.childId), children: [_jsx("span", { className: row.running ? css.dotRunning : css.dot, "aria-hidden": "true" }), _jsx("span", { className: css.taskTitle, children: row.title })] }), _jsx("button", { type: "button", className: css.delete, "aria-label": confirming === row.childId ? t('task.delete.confirm') : t('task.delete'), onClick: () => onDelete(row.childId), children: confirming === row.childId ? t('task.delete.confirm') : t('task.delete') })] }, row.childId))) })), _jsx("button", { type: "button", className: css.newTask, onClick: onNew, children: t('task.new') })] }), _jsx("div", { className: css.conversation, children: selected === undefined ? (_jsx("p", { className: css.empty, children: t('conversation.empty') })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.messages, children: [loading && _jsx("p", { className: css.loading, children: t('conversation.loading') }), !loading && historyError !== null && (_jsx("p", { className: css.error, children: historyError })), !loading && historyError === null && messages.length === 0 && (_jsx("p", { className: css.empty, children: t('conversation.none') })), !loading && messages.map((message, index) => (_jsx("p", { className: message.role === 'user' ? css.user : css.assistant, children: message.text }, index))), running && _jsx("p", { className: css.running, children: t('task.running') })] }), _jsxs("form", { className: css.composer, onSubmit: onSend, children: [_jsx("input", { className: css.input, value: draft, disabled: busy, placeholder: t('conversation.placeholder'), "aria-label": t('conversation.placeholder'), onChange: event => setDraft(event.target.value) }), running
                                    ? (_jsx("button", { type: "button", className: css.stop, onClick: () => { void stopTask(selected); }, children: t('conversation.stop') }))
                                    : (_jsx("button", { type: "submit", className: css.send, disabled: busy || draft.trim() === '' || selected === undefined, children: t('conversation.send') }))] })] })) })] }));
}
//# sourceMappingURL=SideTaskPanel.js.map