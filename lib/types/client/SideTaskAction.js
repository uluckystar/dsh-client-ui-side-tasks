import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import css from './SideTaskAction.module.css';
/**
 * Render the header trigger with a live count badge.
 * @param props - session kit, the injected store hook, and the toggle verb.
 */
export function SideTaskAction({ sessionId, useSideTasks, togglePanel, t }) {
    const count = useSideTasks(state => state.tasksBySession[sessionId]?.length ?? 0);
    return (_jsxs("button", { type: "button", className: css.trigger, "aria-label": t('action.aria'), onClick: togglePanel, children: [_jsx("span", { className: css.label, children: t('action.aria') }), count > 0 && _jsx("span", { className: css.count, "aria-hidden": "true", children: count })] }));
}
//# sourceMappingURL=SideTaskAction.js.map