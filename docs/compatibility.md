# 固定版本接口核对与验收边界

测试 DSH 源码：`99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，CLI `0.1.0-rc.7`。
这是 MyDSH 非官方维护记录，不代表上游采纳，也不保证其他版本兼容。

| 能力 | 固定版本证据 | 本包处理 |
| --- | --- | --- |
| 旧 `ctx.sessions.history` | `packages/client/runtime/src/client/contract/sessions.ts` 的 `ISessions` 没有此方法 | 不再把旧方法缺失当作所有历史读取不可用 |
| 正式 wire 历史 | `packages/host/apiproxy/src/api/sessions.ts` 的 `SessionsApi.history`；`packages/client/connection/src/client/index.ts` 的 `connection.api` | 旧方法不存在时，通过 `ctx.get('connection')` 的 `api.sessions.history({sessionId, maxMessages, beforeSeq})`，返回 `response.result` |
| 旧方法业务拒绝 | 旧方法返回 `ok:false` | 原样返回，不绕到其他接口重试 |
| 完整删除 | 当前 `ISessions`、`SessionsApi` 和 `SessionPersistence` 声明没有可验证的端到端耐久删除契约 | 不猜测任意同名方法；保持禁用新建/删除，不直接删数据文件 |
| `workspace.detachSession` | `packages/workspace/workspace/src/types.ts` 仅移除工作区关联 | 不是删除持久日志/宿主 agent，不能冒充删除 |
| `session/disposed` | `packages/host/apiproxy/src/api-proxy.ts` 将此事件转为 `host/session-removed` | 不据事件名字推断耐久数据已删除 |

## 已验证的历史适配

- 133项逻辑/UI测试，包括6项新适配测试：旧方法接收者、正式wire参数与接收者、业务拒绝不绕过、缺接口、传输异常、异常响应。
- 在独立、无生产凭据的 profile 中读取上轮隔离测试实际创建的 fork 子会话。
- 真实 `/api/session.history` 请求成功；面板正确过滤父会话seed，未展示父会话提示，未抛浏览器异常。
- UI仍禁止创建/删除，不把“历史能读”当作完整临时任务生命周期通过。
- 测试明确恢复了已知QA owner/child的本地UI关联；不是新的真实用户数据，也不冒称本轮创建/删除通过。

## 解除创建/删除保护前必须满足

需要一份经宿主支持的删除契约，覆盖正在运行的agent取消/收敛、所有workspace关联、持久日志、查询索引及失败重试。
还要明确独占归属与幂等删除；共享/重新挂载的会话不能被旧任务无条件删除。
在固定版本实测上述行为、关闭与删除区别、重载恢复和过期清理后，才能解除保护。

## rc.8: acknowledged operations and distribution checks

- Sends/stops succeed only after a valid `RpcResult` with `ok: true` and
  `value.accepted: true`. Missing bindings, rejected/malformed envelopes and
  transport exceptions stay failures. Failed sends do not refresh activity.
- Failed sends keep the composer draft. A late acknowledgement cannot clear
  newer edits or the draft after switching tasks; repeated submissions while
  an acknowledgement is pending are suppressed. Acceptance is not a promise
  that a model turn completed or that its transcript is already durable.
- Build/typecheck use compiled declarations from an explicit `DSH_CHECKOUT`;
  they do not install fake ambient types or typecheck against a different
  source tree. Host peer versions now match the tested rc.7 SDK instead of
  the stale 0.0.1 prerelease range. This remains a tested-target declaration,
  not verification of other host releases.
- `npm run typecheck`, `npm run build:types`, and `npm run build` require
  TypeScript/build dev dependencies and an SDK checkout whose declarations
  have already been built. Set `DSH_CHECKOUT` to that checkout. Release
  evidence must record its full Git SHA. Declarations are regenerated from
  current source; declaration maps, bundle maps and their own source files
  are included in the package.

The existing destructive lifecycle protection is unchanged: this release
does not establish a durable delete API, enable task creation/deletion on
the guarded host, or close the full-lifecycle compatibility issue.
