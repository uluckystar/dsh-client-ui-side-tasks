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

仓库自带预构建产物（`lib/`），普通用户两步安装，无需任何构建工具链：

```sh
git clone https://github.com/uluckystar/dsh-client-ui-side-tasks
dsh plugin --profile web add ./dsh-client-ui-side-tasks   # 或你的当前 profile
# 重启 profile 使 bundle 元数据生效
```

**独立挂载（MyDSH rc.6）**：安装包包含 `dsh.bundle` 补丁，挂载无业务逻辑的 host 入口后，DSH 才能发现浏览器模块。仅安装为普通依赖不代表功能已激活。重启后应确认浏览器加载了 `@deepseek-ai/dsh-client-ui-side-tasks/client.js`，并在会话标题处看到侧边任务入口。若当前 DSH 已自带该界面，应先移除另一处注册，避免重复挂载。

**依赖说明**：需要当前 DSH 实际提供 `session.delete` 与 `session.history`；不能只凭仓库日期或版本标签判断。缺少这些能力时，历史显示和完整删除不可用。当前测试固定 DSH 源码提交为 `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，不保证任意其他版本兼容。

### 源码构建（仅开发者）

```sh
git clone https://github.com/uluckystar/dsh-client-ui-side-tasks
cd dsh-client-ui-side-tasks
pnpm install
pnpm bundle
```

注意：官方 `@deepseek-ai/*` 的 rc 包在 npm 上是分批发布的——若 `pnpm install` 报缺少某个包（如 `@deepseek-ai/dsh-compact`），可从官方 harness 工作区解析，或等待该 rc 包发布。

### 固定版本验收与能力边界

在 DSH `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`（CLI rc.7）独立隔离 profile
中，已验证包安装、host 层挂载、浏览器模块加载。这个运行版本没有暴露本插件旧接口所需的
`ctx.sessions.history` / `ctx.sessions.delete`，因此 rc.6 会明确提示并禁用创建/删除，
避免创建无法清理的子会话，也不再抛出浏览器 TypeError。**这不等于该版本完整生命周期通过**，
在此版本不能依赖一小时自动删除。

控制器/UI 测试使用显式服务桩，只证明插件逻辑，不代替各 DSH 版本的创建、刷新、关闭、删除
和过期清理实测。不要用归档冒充删除，也不要把隐藏面板当成释放子会话。

### rc.7：通过正式 wire API 恢复已有任务历史

固定版本实际上提供 `connection.api.sessions.history`，只是没有旧
`ctx.sessions.history` 辅助方法。本版适配了该只读接口，保留分页与RPC错误；
旧方法业务拒绝时不会换路径重试。已存在任务的历史可以显示，父会话seed仍被过滤。

当前版本的耐久删除依然未验证，因此新建、删除和一小时清理承诺仍保持禁用。
历史可读不等于完整生命周期通过。具体正式接口依据和剩余验收见 `docs/compatibility.md`。
