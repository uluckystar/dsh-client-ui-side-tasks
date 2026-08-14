/** `sideTask` namespace dictionaries. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'sideTask'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'action.aria': '侧边任务',
  'panel.title': '侧边任务',
  'panel.close': '关闭面板',
  'panel.collapse': '收起面板',
  'panel.collapsed': '展开侧边任务面板',
  'panel.empty': '暂无侧边任务',
  'panel.error': '操作失败',
  'panel.error.close': '关闭错误提示',
  'task.new': '新建侧边任务',
  'task.select': '切换到任务',
  'task.delete': '删除任务',
  'task.delete.confirm': '确认删除',
  'task.delete.confirm.running': '任务运行中,删除将中断它',
  'task.deleted': '任务已删除',
  'task.running': '运行中',
  'task.expiresIn': '还剩 {minutes} 分钟自动删除',
  'task.ttl': '侧边任务为临时任务,1 小时无新对话将自动删除',
  'conversation.empty': '选择任务开始对话',
  'conversation.loading': '加载中…',
  'conversation.none': '新任务,直接对话',
  'conversation.placeholder': '输入消息…',
  'conversation.send': '发送',
  'conversation.stop': '停止',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<SideTaskKey, string> = {
  'action.aria': 'Side tasks',
  'panel.title': 'Side tasks',
  'panel.close': 'Close panel',
  'panel.collapse': 'Collapse panel',
  'panel.collapsed': 'Expand side-task panel',
  'panel.empty': 'No side tasks yet',
  'panel.error': 'Action failed',
  'panel.error.close': 'Dismiss error',
  'task.new': 'New side task',
  'task.select': 'Switch to task',
  'task.delete': 'Delete task',
  'task.delete.confirm': 'Confirm delete',
  'task.delete.confirm.running': 'Task is running; deleting will interrupt it',
  'task.deleted': 'Task deleted',
  'task.running': 'running',
  'task.expiresIn': 'deletes in {minutes} min',
  'task.ttl': 'Side tasks are temporary: they are deleted automatically after 1 hour without new messages',
  'conversation.empty': 'Select a task to start chatting',
  'conversation.loading': 'Loading…',
  'conversation.none': 'New task — start chatting',
  'conversation.placeholder': 'Type a message…',
  'conversation.send': 'Send',
  'conversation.stop': 'Stop',
}

/** Keys of the `sideTask` namespace (derived from the Chinese source of truth). */
export type SideTaskKey = keyof typeof zh
