/** `sideTask` namespace dictionaries. */
/** Dictionary namespace owned by this plugin. */
export declare const NS = "sideTask";
/** Simplified Chinese dictionary (the key-set source of truth). */
export declare const zh: {
    readonly 'action.aria': "侧边任务";
    readonly 'panel.title': "侧边任务";
    readonly 'panel.close': "关闭面板";
    readonly 'panel.empty': "暂无侧边任务";
    readonly 'task.new': "新建侧边任务";
    readonly 'task.select': "切换到任务";
    readonly 'task.delete': "删除任务";
    readonly 'task.delete.confirm': "确认删除";
    readonly 'task.deleted': "任务已删除";
    readonly 'task.running': "运行中";
    readonly 'conversation.empty': "选择任务开始对话";
    readonly 'conversation.loading': "加载中…";
    readonly 'conversation.none': "暂无消息";
    readonly 'conversation.placeholder': "输入消息…";
    readonly 'conversation.send': "发送";
    readonly 'conversation.stop': "停止";
};
/** English dictionary, key-identical to the Chinese source of truth. */
export declare const en: Record<SideTaskKey, string>;
/** Keys of the `sideTask` namespace (derived from the Chinese source of truth). */
export type SideTaskKey = keyof typeof zh;
//# sourceMappingURL=locales.d.ts.map