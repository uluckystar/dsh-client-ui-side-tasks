# @deepseek-ai/dsh-client-ui-side-tasks

[English](README.md) | 中文

侧边任务插件，浏览器端：主对话右侧的临时任务面板。会话头部新增「侧边任务」按钮，带实时数量徽标；点击后打开归属当前会话的右侧浮层面板。每个侧边任务都是**fork 出的子会话**（`session.fork` 并递增标题）——它运行自己的 agent，在面板里拥有自己的迷你对话，与主线程相互独立。任务按会话维护，并通过 localStorage（`dsh.side-tasks.<sessionId>`）在刷新后恢复；面板展示任务子会话列表、所选任务的精简用户/助手文本对话，并可发送排队提示或取消运行中的回合。

生命周期是本插件的核心卖点：**删除任务不留任何残留**。删除按钮（两次点击确认）调用 `session.delete(childId)`——host 会 dispose 该 agent、从每个 workspace 账户移除该 id、并删除其存储日志；任务行、面板选中态与持久化的集合条目一并消失。关闭面板只收起 UI：任务与其空闲 agent 继续存活，重新打开即恢复。

## 槽位与数据架构

两个注册共享一个 apply 侧的 controller（register 声明的 store 只能挂载在一个 scope 下，跨 scope 共享走 controller）：

- **`conversation.session.header.actions`**（session scope，id `side-task`，order 30）：触发按钮 + 数量徽标。通过注入的 `useSideTasks` hook 读取 store；owner 不传任何 props。
- **`shell.overlay`**（root scope，id `side-task-panel`）：右侧固定面板。读取 store（`useSideTasks`）、所选任务的对话（`useTaskConversation`——跟随 store 的 `selected` binding 的派生源）、会话列表（`useSessions`）以及注入的动词（create/delete/send/stop/select/close）。

controller 持有 `createSnapshotStore` 实例、对话源、按会话的 localStorage 持久化与 RPC 动词；组件只通过 inject face 拿到数据，绝不接触 `ctx`。

## 模型体验

间接，经由面板调用的 `session.fork`、`session.prompt`、`session.cancel` 与 `session.delete` 动词：新建任务会从当前会话的已完成回合前缀 fork 出子会话并递增标题；发送提示会在任务自身会话中排队一个用户回合；停止会取消其运行中的回合；删除会移除子会话的日志与 workspace 账户。面板自身不产生任何 prompt 内容；模型看到的一切都来自用户在任务内的真实发送。

#### KV Cache 影响

插件本身无影响。在任务内发送会像普通 prompt 一样延长该子会话的历史尾部，被接受的上下文可能改变其 provider 侧缓存复用；删除任务则彻底移除其日志。

## 已知限制与暂缓事项

- **迷你对话仅文本**——工具调用、上下文注入、推理块等其他 surface 节点有意不出现在精简面板中；完整 transcript 在主线对话中打开该任务会话即可查看。
- **迷你对话为拉取式（非流式）**——事件窗口只回填当前会话，因此面板在选中任务时拉取该任务的持久历史（`session.history`），并在运行回合结束或发送后刷新。进行中的回复显示「运行中」指示，回合结束后一次性完整显示。
- **面板单归属**——面板跟随当前会话（`useSessions.current`）；切换会话时面板重新指向新归属者的集合。暂无多面板侧边任务视图。
- **运行中禁用排队发送**——回合运行期间输入框锁定，不提供主输入框的排队语义；任务需先结束才能发送下一条。

## 安装

```sh
git clone https://github.com/uluckystar/dsh-client-ui-side-tasks
cd dsh-client-ui-side-tasks
pnpm install
pnpm build
dsh plugin --profile web add ./dsh-client-ui-side-tasks   # 或你的实际 profile
# 重启该 profile 使 bundle 元数据生效
```

**依赖说明**:本插件依赖官方的 `session.delete` 与 `session.history` 能力
（2026 年 8 月之后的源码构建才包含）。如果宿主 DSH 版本更早，面板历史渲染
与「删除零残留」将不可用——请使用包含这些能力的新版。

## 出品

由 [MyDSH](https://mydsh.dev) 社区开发维护——一个围绕 DeepSeek Harness 的
非官方中文社区：插件大全、源码教程、经验交流。欢迎反馈与共建。
