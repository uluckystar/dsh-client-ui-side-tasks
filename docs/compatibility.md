# 固定版本接口核对与验收边界

测试 DSH 源码：`99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`，CLI `0.1.0-rc.7`。
这是 MyDSH 非官方维护记录，不代表上游采纳，也不保证其他版本兼容。

| 能力 | 固定版本证据 | 本包处理 |
| --- | --- | --- |
| 旧 `ctx.sessions.history` | `packages/client/runtime/src/client/contract/sessions.ts` 的 `ISessions` 没有此方法 | 不再把旧方法缺失当作所有历史读取不可用 |
| 正式 wire 历史 | `packages/host/apiproxy/src/api/sessions.ts` 的 `SessionsApi.history`；`packages/client/connection/src/client/index.ts` 的 `connection.api` | 旧方法不存在时，使用 `ctx.connection.api.sessions.history({sessionId, maxMessages, beforeSeq})`，返回 `response.result` |
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
