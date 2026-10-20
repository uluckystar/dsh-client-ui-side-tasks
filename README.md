# @deepseek-ai/dsh-client-ui-side-tasks

English | [中文](README.zh.md)

Side tasks plugin, browser half: a temporary per-session task panel beside the main conversation. The conversation header gains a 「侧边任务」 action with a live count badge; clicking it opens a right-hand overlay panel owned by the current session, which **collapses to a compact top-right chip** as its resting state and expands while a task is being worked on.

Each side task is a **forked child session** (`session.fork` with title incrementation) — it runs its own agent with the owner's full context, independent of the main thread. Two properties make it a temporary task rather than a fork visible in the sidebar:

- **Hidden by default**: the child is archived (`workspace.archiveSession`) right after creation, so it never appears in the workspace sidebar or the ungrouped bucket — the panel is its only surface. The forked seed context is the task's working memory, not its display: the mini conversation shows only the task's OWN messages (everything after the task's LAST `session/end-seed` marker — an owner that was itself resumed or forked nests earlier markers inside the seed, so the first one would leak the owner's recent messages), so a new task is just a composer ready to talk.
- **Self-expiring**: a task with no activity (creation, send, or a settled turn) for one hour (`SIDE_TASK_TTL_MS`) is deleted automatically by the apply-side sweep while the page is open; persisted activity timestamps let a refresh resume the same expiry. Running tasks are never swept. Each task row shows its own live countdown (`还剩 N 分钟自动删除`, ticking every second from the persisted last-activity timestamp) so the expiry is never a surprise.

The lifecycle is the plugin's core selling point: **deleting a task leaves no residue**. The delete button (two-click confirm) calls `session.delete(childId)`, which disposes the host agent, removes the child from every workspace account, and erases its stored log — the task row, the panel selection, and the persisted collection entry all go with it. Closing the panel only hides the UI: tasks and their idle agents stay alive until their expiry sweep and reappear on reopen.

## Slot and data architecture

Two registrations share one apply-owned controller (a register-declared store mounts under exactly one scope, so cross-scope sharing goes through the controller):

- **`conversation.session.header.actions`** (session scope, id `side-task`, order 30): the trigger button + count badge. Reads the store through the injected `useSideTasks` hook; the owner passes nothing.
- **`shell.overlay`** (root scope, id `side-task-panel`): the right-hand panel OR the collapsed chip. Reads the store (`useSideTasks`), the selected task's conversation (`useTaskConversation` — a derived source that follows the store's `selected` binding), the session list (`useSessions`), and the injected verbs (create/delete/send/stop/select/collapse/expand/close).

The controller owns the `createSnapshotStore` instance, the conversation source, per-session localStorage persistence (ids + per-task activity timestamps), the expiry sweep, and the RPC verbs; components receive everything through the inject face and never touch `ctx`.

## Model Experience

Indirectly, through the `session.fork`, `session.prompt`, `session.cancel`, and `session.delete` verbs the panel invokes: creating a task forks a child session from the current session's prefix with an incremented title, sending a prompt queues a user turn in the task's own session, stopping cancels its running turn, and deleting removes the child's log and workspace accounts. The panel itself adds no prompt content of its own; everything the model sees comes from the user's own sends inside a task.

#### KV Cache effect

None from the plugin itself. Sending inside a task extends that child session's history tail like any other prompt, so admitted context can change its provider-side cache reuse; deleting a task removes its log entirely.

## Known Limitations and Deferred Work

- **Mini-conversation is text-only** — tool calls, context injections, reasoning blocks, and other surface nodes are intentionally omitted from the compact panel; the full transcript lives in the main conversation by opening the task session normally.
- **Expiry sweep runs while the page is open** — a task left idle with the browser closed stays until the next page load (the persisted activity timestamps resume the countdown then); there is no host-side janitor. — the event window only backfills the current session, so the panel fetches the selected task's durable history (`session.history`) on selection and refreshes when a running turn settles or after a send. A reply in progress shows a 「运行中」 indicator and appears in full once the turn ends.
- **Panel is single-owner** — it follows the current session (`useSessions.current`); switching sessions re-points the panel to the new owner's collection. There is no multi-pane side-task view.
- **Queued sends while running are disabled** — the composer locks during a running turn instead of offering the main composer's queue semantics; a task must settle before the next prompt.

## Installation

The repository ships prebuilt bundles (`lib/`), so a normal user installs
in two steps — no build toolchain needed:

```sh
git clone https://github.com/uluckystar/dsh-client-ui-side-tasks
dsh plugin --profile web add ./dsh-client-ui-side-tasks   # or your active profile
# restart the profile for the bundle metadata to take effect
```

**Standalone activation (MyDSH rc.6)**: the package includes a `dsh.bundle`
patch that mounts its inert host entry. That registration is required for DSH to
discover and load the browser module; a plain dependency installation alone is
not proof of activation. Restart the profile, then verify that the browser loaded
`@deepseek-ai/dsh-client-ui-side-tasks/client.js` and the session header shows the
side-task action. Some DSH builds already include a side-task UI: remove the
other registration before enabling a duplicate.

**Dependency note**: this plugin relies on the `session.delete` and
`session.history` capabilities, which must be available in the DSH build you actually use. Check these
capabilities before installation; a repository date or version label alone
is not an install/boot test. Without them, history rendering and complete
child-session deletion are unavailable.

### Building from source (developers only)

```sh
git clone https://github.com/uluckystar/dsh-client-ui-side-tasks
cd dsh-client-ui-side-tasks
pnpm install
pnpm bundle
```

Note: the official `@deepseek-ai/*` release candidates are published to npm
incrementally — if `pnpm install` reports a missing package (e.g.
`@deepseek-ai/dsh-compact`), resolve it from the official harness workspace
checkout or wait for the rc to be published.

## 社区维护与兼容性

本仓库是 MyDSH 非官方社区维护版本，与 DeepSeek 官方无隶属关系，保留上游 MIT 授权。它提供临时 fork 任务，不应被描述为长期讨论记忆系统。长期讨论记录、用户确认后保存的助手记忆等方案应作为独立能力评估。

不同 DSH 版本的客户端注入和槽位接口可能变化。安装前请在独立 profile 验证任务创建、主子会话归属、停止、删除与重载；仓库元数据或声明校验通过不能代替这些实测。

### Fixed-version validation and capability boundary

On DSH source commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` (CLI rc.7),
a clean isolated profile confirms installation, host-layer registration and
browser-module loading. That runtime does **not** expose the legacy client
`ctx.sessions.history` / `ctx.sessions.delete` methods this plugin's temporary
lifecycle requires. rc.6 therefore disables creation/deletion and explains the
missing capability instead of creating children that cannot be cleaned up or
throwing a browser TypeError. This is **not** a passing full lifecycle test on
that DSH version. Do not rely on one-hour expiry there.

Controller/UI tests use explicit service fixtures; they are not a claim that
every DSH build implements these methods. Supported versions still need their
own create, reload, close, deletion and idle-expiry acceptance.
