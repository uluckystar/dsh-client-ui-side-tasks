window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-side-tasks",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region src/client/history.ts
		/** Prefer the legacy service where present; otherwise use the declared public wire history method. */
		function historyReader(legacy, wire) {
			const available = () => typeof legacy.history === "function" || typeof wire?.history === "function";
			const read = async (sessionId, opts) => {
				try {
					let result;
					if (typeof legacy.history === "function") result = await legacy.history.call(legacy, sessionId, opts);
					else if (typeof wire?.history === "function") result = (await wire.history.call(wire, {
						sessionId,
						...opts.beforeSeq === void 0 ? {} : { beforeSeq: opts.beforeSeq },
						...opts.maxMessages === void 0 ? {} : { maxMessages: opts.maxMessages }
					}))?.result;
					else throw new Error("This DSH does not provide session history / 当前 DSH 未提供历史读取能力");
					if (!result || typeof result.ok !== "boolean" || result.ok && !Array.isArray(result.value?.events) || !result.ok && typeof result.error?.message !== "string") throw new Error("Invalid session history response");
					return result;
				} catch (error) {
					return {
						ok: false,
						error: {
							code: "internal",
							message: error instanceof Error ? error.message : String(error),
							details: {}
						}
					};
				}
			};
			return {
				available,
				read
			};
		}
		//#endregion
		//#region src/client/store.ts
		/** localStorage key prefix for one owner session's side-task collection. */
		const TASK_KEY_PREFIX = "dsh.side-tasks.";
		const INITIAL = {
			open: false,
			collapsed: false,
			selected: void 0,
			tasksBySession: {},
			lastActivity: {},
			actionError: null
		};
		/**
		* Create the side-task panel store.
		* @returns the bare observable store instance.
		*/
		function createSideTasksStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL);
		}
		/** Parse a persisted payload, accepting the legacy bare-id-array shape. */
		function parsePersisted(raw) {
			try {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) return {
					ids: parsed.filter((id) => typeof id === "string"),
					lastActivity: {}
				};
				if (typeof parsed !== "object" || parsed === null) return void 0;
				const record = parsed;
				if (!Array.isArray(record.ids)) return void 0;
				const ids = record.ids.filter((id) => typeof id === "string");
				const lastActivity = {};
				if (typeof record.lastActivity === "object" && record.lastActivity !== null) {
					for (const [id, time] of Object.entries(record.lastActivity)) if (typeof time === "number" && Number.isFinite(time)) lastActivity[id] = time;
				}
				return {
					ids,
					lastActivity
				};
			} catch {
				return;
			}
		}
		/**
		* Read a persisted side-task collection for one owner session.
		* @param sessionId - owner session id.
		* @returns the stored ids and per-task activity timestamps, or empty values
		*   when absent or unreadable.
		*/
		function loadTaskState(sessionId) {
			const raw = localStorage.getItem(TASK_KEY_PREFIX + sessionId);
			if (raw === null) return {
				ids: [],
				lastActivity: {}
			};
			return parsePersisted(raw) ?? {
				ids: [],
				lastActivity: {}
			};
		}
		/**
		* Persist a side-task collection for one owner session.
		* @param sessionId - owner session id.
		* @param ids - child session ids to store.
		* @param lastActivity - per-task activity timestamps to store.
		*/
		function saveTaskState(sessionId, ids, lastActivity) {
			try {
				localStorage.setItem(TASK_KEY_PREFIX + sessionId, JSON.stringify({
					ids,
					lastActivity
				}));
			} catch {}
		}
		//#endregion
		//#region src/client/controller.ts
		/**
		* A side task with no activity (creation, send, or a settled turn) for this
		* long is deleted automatically. The panel is a scratchpad, not storage: a
		* task left untouched for an hour has no value left to keep.
		*/
		const SIDE_TASK_TTL_MS = 3600 * 1e3;
		/**
		* A stable observable that follows `store.selected`: it resolves the selected
		* task's session binding and mirrors its conversation snapshot, re-pointing
		* whenever the selection moves. One source object for the entry lifetime, so
		* the renderer's per-source hook cache stays valid.
		* @param store - the panel store.
		* @param sessions - sessions port used to resolve bindings.
		* @returns the derived conversation source.
		*/
		function taskConversationSource(store, sessions) {
			const listeners = /* @__PURE__ */ new Set();
			let current;
			let unsubSession;
			const notify = () => {
				for (const listener of [...listeners]) listener();
			};
			const follow = () => {
				const selected = store.getSnapshot().selected;
				const next = selected === void 0 ? void 0 : sessions.binding(selected)?.session;
				if (next === current) return;
				unsubSession?.();
				current = next;
				unsubSession = next?.subscribe(notify);
			};
			store.subscribe(() => {
				follow();
				notify();
			});
			follow();
			return {
				getSnapshot: () => current?.getSnapshot(),
				subscribe: (listener) => {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				}
			};
		}
		/**
		* Extract a user-displayable message from a thrown verb failure.
		* @param error - the thrown value.
		* @returns the message text.
		*/
		function errorMessage(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** RPC resolution alone is not acceptance: failed/malformed envelopes fail closed. */
		function requireAcknowledged(result) {
			const reply = result;
			if (reply?.ok === true && reply.value?.accepted === true) return;
			const message = reply?.error?.message;
			throw new Error(typeof message === "string" && message.trim() !== "" ? message : "Session operation was not acknowledged / 会话操作未被确认");
		}
		/**
		* Build the side-task controller.
		* @param sessions - sessions port (production passes `ctx.sessions` and
		*   `ctx.workspaces.archiveSession`).
		* @returns the controller face.
		*/
		function createSideTasksController(sessions) {
			const store = createSideTasksStore();
			const taskConversation = taskConversationSource(store, sessions);
			const persist = (ownerSessionId) => {
				const snapshot = store.getSnapshot();
				saveTaskState(
					ownerSessionId,
					/* v8 ignore next -- every persist call site sets the collection key first; the guard exists for the noUncheckedIndexedAccess type only */
					snapshot.tasksBySession[ownerSessionId] ?? [],
					snapshot.lastActivity
				);
			};
			const touch = (childId, now) => {
				store.update((draft) => {
					draft.lastActivity[childId] = now;
				});
			};
			const hydrate = (sessionId) => {
				if (store.getSnapshot().tasksBySession[sessionId] !== void 0) return;
				const loaded = loadTaskState(sessionId);
				const byId = sessions.list.getSnapshot().byId;
				const alive = Object.keys(byId).length === 0 ? loaded.ids : loaded.ids.filter((childId) => byId[childId] !== void 0);
				if (alive.length !== loaded.ids.length) {
					store.update((draft) => {
						draft.tasksBySession[sessionId] = alive;
						for (const id of loaded.ids) if (!alive.includes(id)) delete draft.lastActivity[id];
					});
					persist(sessionId);
				} else store.update((draft) => {
					draft.tasksBySession[sessionId] = alive;
				});
				store.update((draft) => {
					for (const [childId, time] of Object.entries(loaded.lastActivity)) if (alive.includes(childId)) draft.lastActivity[childId] = time;
				});
			};
			const clearError = () => {
				store.update((draft) => {
					if (draft.actionError !== null) draft.actionError = null;
				});
			};
			return {
				store,
				taskConversation,
				openPanel: () => store.update((draft) => {
					draft.open = true;
					if (draft.actionError !== null) draft.actionError = null;
				}),
				closePanel: () => store.update((draft) => {
					draft.open = false;
					if (draft.actionError !== null) draft.actionError = null;
				}),
				togglePanel: () => store.update((draft) => {
					draft.open = !draft.open;
					if (draft.actionError !== null) draft.actionError = null;
				}),
				collapsePanel: () => store.update((draft) => {
					draft.collapsed = true;
					if (draft.actionError !== null) draft.actionError = null;
				}),
				expandPanel: () => store.update((draft) => {
					draft.collapsed = false;
					if (draft.actionError !== null) draft.actionError = null;
				}),
				selectTask: (sessionId) => store.update((draft) => {
					draft.selected = sessionId;
					draft.collapsed = false;
					if (draft.actionError !== null) draft.actionError = null;
				}),
				dismissError: clearError,
				hydrate,
				followCurrent: () => {
					const align = () => {
						const current = sessions.list.getSnapshot().current;
						if (current === void 0) {
							store.update((draft) => {
								draft.selected = void 0;
							});
							return;
						}
						hydrate(current);
						const selected = store.getSnapshot().selected;
						/* v8 ignore next -- the collection key is guaranteed by hydrate(current). */
						const collection = store.getSnapshot().tasksBySession[current] ?? [];
						if (selected !== void 0 && !collection.includes(selected)) store.update((draft) => {
							draft.selected = void 0;
						});
					};
					const stop = sessions.list.subscribe(align);
					align();
					return stop;
				},
				sweepExpired: async (now = Date.now(), ttlMs = SIDE_TASK_TTL_MS) => {
					const snapshot = store.getSnapshot();
					const byId = sessions.list.getSnapshot().byId;
					const expired = [];
					for (const [owner, ids] of Object.entries(snapshot.tasksBySession)) for (const childId of ids) {
						if (byId[childId]?.running === true) continue;
						const last = snapshot.lastActivity[childId];
						if (last !== void 0 && now - last >= ttlMs) expired.push({
							owner,
							childId
						});
					}
					for (const { owner, childId } of expired) try {
						await sessions.delete(childId);
						store.update((draft) => {
							/* v8 ignore next -- sweep iterates existing collection keys; the guard exists for the noUncheckedIndexedAccess type only */
							const ids = draft.tasksBySession[owner] ?? [];
							draft.tasksBySession[owner] = ids.filter((id) => id !== childId);
							delete draft.lastActivity[childId];
							if (draft.selected === childId) draft.selected = void 0;
						});
						persist(owner);
					} catch {}
					return expired.length;
				},
				createTask: async (ownerSessionId) => {
					const childId = await sessions.fork({
						sessionId: ownerSessionId,
						increaseTitle: true
					});
					try {
						await sessions.archiveSession(childId);
					} catch {}
					const existing = store.getSnapshot().tasksBySession[ownerSessionId] ?? [];
					const next = existing.includes(childId) ? existing : [...existing, childId];
					const now = Date.now();
					store.update((draft) => {
						draft.tasksBySession[ownerSessionId] = next;
						draft.selected = childId;
						draft.lastActivity[childId] = now;
						draft.collapsed = false;
						if (draft.actionError !== null) draft.actionError = null;
					});
					persist(ownerSessionId);
					return childId;
				},
				deleteTask: async (ownerSessionId, childId) => {
					try {
						await sessions.delete(childId);
						const next = (store.getSnapshot().tasksBySession[ownerSessionId] ?? []).filter((id) => id !== childId);
						store.update((draft) => {
							draft.tasksBySession[ownerSessionId] = next;
							delete draft.lastActivity[childId];
							if (draft.selected === childId) draft.selected = void 0;
							if (draft.actionError !== null) draft.actionError = null;
						});
						persist(ownerSessionId);
					} catch (error) {
						store.update((draft) => {
							draft.actionError = errorMessage(error);
						});
					}
				},
				sendTask: async (childId, text) => {
					const trimmed = text.trim();
					if (trimmed === "") return false;
					try {
						const binding = sessions.binding(childId);
						if (!binding) throw new Error("Session binding unavailable / 会话绑定不可用");
						requireAcknowledged(await binding.session.prompt([{
							type: "text",
							text: trimmed
						}], "queue"));
						touch(childId, Date.now());
						persistForOwnerOf(childId, store);
						clearError();
						return true;
					} catch (error) {
						store.update((draft) => {
							draft.actionError = errorMessage(error);
						});
						return false;
					}
				},
				stopTask: async (childId) => {
					try {
						const binding = sessions.binding(childId);
						if (!binding) throw new Error("Session binding unavailable / 会话绑定不可用");
						requireAcknowledged(await binding.session.cancel());
						clearError();
						return true;
					} catch (error) {
						store.update((draft) => {
							draft.actionError = errorMessage(error);
						});
						return false;
					}
				},
				fetchHistory: (childId, opts) => sessions.history(childId, {
					maxMessages: 50,
					...opts
				})
			};
		}
		/** Persist the owner collection that accounts for one child. */
		function persistForOwnerOf(childId, store) {
			const snapshot = store.getSnapshot();
			for (const owner of Object.keys(snapshot.tasksBySession)) {
				const ids = snapshot.tasksBySession[owner];
				if (ids !== void 0 && ids.includes(childId)) {
					saveTaskState(owner, ids, snapshot.lastActivity);
					return;
				}
			}
		}
		//#endregion
		//#region \0mydsh-css:src/client/SideTaskAction.module.css.mjs
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=" + JSON.stringify("@deepseek-ai/dsh-client-ui-side-tasks/SideTaskAction.module.css") + "]")) {
			const s = document.createElement("style");
			s.dataset.plugin = "@deepseek-ai/dsh-client-ui-side-tasks";
			s.dataset.pluginCss = "@deepseek-ai/dsh-client-ui-side-tasks/SideTaskAction.module.css";
			s.textContent = "._65_Lqq_trigger{min-height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:center;gap:6px;padding:3px 8px;font-size:12px;line-height:18px;display:inline-flex}._65_Lqq_trigger:hover,._65_Lqq_trigger:focus-visible{color:var(--dsw-alias-label-secondary)}._65_Lqq_label{white-space:nowrap}._65_Lqq_count{background:var(--dsw-alias-interactive-bg-hover-accent);min-width:16px;color:var(--dsw-alias-label-secondary);text-align:center;border-radius:8px;padding:0 5px;font-size:11px;line-height:16px}";
			document.head.appendChild(s);
		}
		var SideTaskAction_module_css_default = {
			"count": "_65_Lqq_count",
			"label": "_65_Lqq_label",
			"trigger": "_65_Lqq_trigger"
		};
		//#endregion
		//#region src/client/SideTaskAction.tsx
		/**
		* Render the header trigger with a live count badge.
		* @param props - session kit, the injected store hook, and the toggle verb.
		*/
		function SideTaskAction({ sessionId, useSideTasks, togglePanel, t }) {
			const count = useSideTasks((state) => state.tasksBySession[sessionId]?.length ?? 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: SideTaskAction_module_css_default.trigger,
				"aria-label": t("action.aria"),
				onClick: togglePanel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SideTaskAction_module_css_default.label,
					children: t("action.aria")
				}), count > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SideTaskAction_module_css_default.count,
					"aria-hidden": "true",
					children: count
				})]
			});
		}
		//#endregion
		//#region src/client/messages.ts
		/** Text blocks of a message (ContentBlock text parts under either key). */
		function messageText(data) {
			if (typeof data !== "object" || data === null) return "";
			const record = data;
			const content = Array.isArray(record.content) ? record.content : typeof record.message === "object" && record.message !== null ? record.message.content : void 0;
			if (!Array.isArray(content)) return "";
			return content.filter((block) => typeof block === "object" && block !== null).filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("");
		}
		/**
		* Extract user/assistant text rows from a history page, in log order. Empty
		* text rows are dropped.
		* @param entries - pulled history entries, or undefined while none are loaded.
		* @returns the ordered text rows.
		*/
		function taskMessageRows(entries) {
			if (entries === void 0) return [];
			const rows = [];
			for (const entry of entries) if (entry.event.type === "user/message") {
				const text = messageText(entry.event.data);
				if (text !== "") rows.push({
					role: "user",
					text
				});
			} else if (entry.event.type === "assistant/message") {
				const text = messageText(entry.event.data);
				if (text !== "") rows.push({
					role: "assistant",
					text
				});
			}
			return rows;
		}
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
		function taskOwnMessageRows(entries) {
			if (entries === void 0) return [];
			let seedBoundary;
			for (const entry of entries) if (entry.event.type === "session/end-seed") seedBoundary = entry.event.seq;
			return taskMessageRows(seedBoundary === void 0 ? entries : entries.filter((entry) => entry.event.seq > seedBoundary));
		}
		//#endregion
		//#region \0mydsh-css:src/client/SideTaskPanel.module.css.mjs
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=" + JSON.stringify("@deepseek-ai/dsh-client-ui-side-tasks/SideTaskPanel.module.css") + "]")) {
			const s = document.createElement("style");
			s.dataset.plugin = "@deepseek-ai/dsh-client-ui-side-tasks";
			s.dataset.pluginCss = "@deepseek-ai/dsh-client-ui-side-tasks/SideTaskPanel.module.css";
			s.textContent = ".R0k_Ga_panel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);width:380px;box-shadow:var(--dsw-alias-bg-mask-2);border-radius:12px;flex-direction:column;display:flex;position:absolute;top:12px;bottom:12px;right:12px;overflow:hidden}.R0k_Ga_header{border-bottom:1px solid var(--dsw-alias-border-l1);justify-content:space-between;align-items:center;padding:10px 12px;display:flex}.R0k_Ga_title{color:var(--dsw-alias-label-primary);margin:0;font-size:14px;font-weight:600;line-height:20px}.R0k_Ga_close{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;justify-content:center;align-items:center;font-size:16px;line-height:1;display:inline-flex}.R0k_Ga_close:hover,.R0k_Ga_close:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover-accent)}.R0k_Ga_errorBar{border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-interactive-bg-hover-danger,#ec13130d);align-items:flex-start;gap:8px;padding:6px 12px;display:flex}.R0k_Ga_errorText{min-width:0;color:var(--dsw-alias-danger,var(--dsw-static-red-500));word-break:break-word;flex:1;font-size:12px;line-height:18px}.R0k_Ga_errorClose{width:20px;height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:4px;flex:none;justify-content:center;align-items:center;font-size:14px;line-height:1;display:inline-flex}.R0k_Ga_errorClose:hover,.R0k_Ga_errorClose:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover-accent)}.R0k_Ga_tasks{border-bottom:1px solid var(--dsw-alias-border-l1);max-height:40%;padding:8px 12px;overflow-y:auto}.R0k_Ga_taskList{flex-direction:column;gap:4px;margin:0;padding:0;list-style:none;display:flex}.R0k_Ga_taskRow{align-items:center;gap:8px;display:flex}.R0k_Ga_taskButton{min-width:0;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;background:0 0;border:0;border-radius:6px;flex:1;align-items:center;gap:6px;padding:4px 6px;font-size:12px;line-height:18px;display:inline-flex}.R0k_Ga_taskButton:hover,.R0k_Ga_taskButton:focus-visible,.R0k_Ga_taskSelected{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary)}.R0k_Ga_taskTitle{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.R0k_Ga_dot,.R0k_Ga_dotRunning{background:var(--dsw-alias-label-dimmed);border-radius:50%;flex:none;width:8px;height:8px}.R0k_Ga_dotRunning{background:var(--dsw-alias-accent,var(--dsw-static-deepseek-100))}.R0k_Ga_delete{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;flex:none;padding:2px 6px;font-size:11px;line-height:16px}.R0k_Ga_delete:hover,.R0k_Ga_delete:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover-accent)}.R0k_Ga_newTask{background:var(--dsw-alias-interactive-bg-hover-accent);width:100%;color:var(--dsw-alias-label-primary);cursor:pointer;border:0;border-radius:6px;margin-top:8px;padding:5px 8px;font-size:12px;line-height:18px}.R0k_Ga_newTask:hover,.R0k_Ga_newTask:focus-visible{color:var(--dsw-alias-label-primary-bluish)}.R0k_Ga_conversation{flex-direction:column;flex:1;min-height:0;display:flex}.R0k_Ga_messages{flex-direction:column;flex:1;gap:8px;padding:10px 12px;display:flex;overflow-y:auto}.R0k_Ga_user,.R0k_Ga_assistant{white-space:pre-wrap;word-break:break-word;border-radius:8px;margin:0;padding:6px 10px;font-size:12px;line-height:18px}.R0k_Ga_user{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary);align-self:flex-end}.R0k_Ga_assistant{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);align-self:flex-start}.R0k_Ga_empty{color:var(--dsw-alias-label-tertiary);text-align:center;margin:0;padding:8px 0;font-size:12px;line-height:18px}.R0k_Ga_running{color:var(--dsw-alias-label-tertiary);text-align:center;margin:0;font-size:11px;line-height:16px}.R0k_Ga_loading{color:var(--dsw-alias-label-tertiary);text-align:center;margin:0;font-size:12px;line-height:18px}.R0k_Ga_error{color:var(--dsw-alias-danger,var(--dsw-static-red-500));margin:0;font-size:12px;line-height:18px}.R0k_Ga_composer{border-top:1px solid var(--dsw-alias-border-l1);gap:8px;padding:10px 12px;display:flex}.R0k_Ga_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:0;color:var(--dsw-alias-label-primary);border-radius:8px;flex:1;padding:6px 10px;font-size:12px;line-height:18px}.R0k_Ga_input:disabled{color:var(--dsw-alias-label-tertiary)}.R0k_Ga_send,.R0k_Ga_stop{cursor:pointer;border:0;border-radius:8px;flex:none;padding:6px 12px;font-size:12px;line-height:18px}.R0k_Ga_send{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary)}.R0k_Ga_send:disabled{opacity:.5;cursor:default}.R0k_Ga_stop{background:var(--dsw-alias-danger,var(--dsw-static-red-500));color:var(--dsw-alias-label-primary-foreground)}.R0k_Ga_headerActions{align-items:center;gap:4px;display:inline-flex}.R0k_Ga_collapse{width:24px;height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;justify-content:center;align-items:center;font-size:16px;line-height:1;display:inline-flex}.R0k_Ga_collapse:hover,.R0k_Ga_collapse:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover-accent)}.R0k_Ga_chip{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-alias-bg-mask-2);color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:999px;align-items:center;gap:6px;padding:6px 12px;font-size:12px;line-height:18px;display:inline-flex;position:absolute;top:56px;right:12px}.R0k_Ga_chip:hover,.R0k_Ga_chip:focus-visible{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover-accent)}.R0k_Ga_chipCount{background:var(--dsw-alias-accent,var(--dsw-static-deepseek-100));min-width:18px;height:18px;color:var(--dsw-alias-label-primary-foreground,#fff);border-radius:999px;justify-content:center;align-items:center;padding:0 5px;font-size:11px;line-height:18px;display:inline-flex}.R0k_Ga_footer{border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);text-align:center;padding:6px 12px;font-size:11px;line-height:16px}.R0k_Ga_expiry{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;font-size:11px;line-height:16px}";
			document.head.appendChild(s);
		}
		var SideTaskPanel_module_css_default = {
			"assistant": "R0k_Ga_assistant",
			"chip": "R0k_Ga_chip",
			"chipCount": "R0k_Ga_chipCount",
			"close": "R0k_Ga_close",
			"collapse": "R0k_Ga_collapse",
			"composer": "R0k_Ga_composer",
			"conversation": "R0k_Ga_conversation",
			"delete": "R0k_Ga_delete",
			"dot": "R0k_Ga_dot",
			"dotRunning": "R0k_Ga_dotRunning",
			"empty": "R0k_Ga_empty",
			"error": "R0k_Ga_error",
			"errorBar": "R0k_Ga_errorBar",
			"errorClose": "R0k_Ga_errorClose",
			"errorText": "R0k_Ga_errorText",
			"expiry": "R0k_Ga_expiry",
			"footer": "R0k_Ga_footer",
			"header": "R0k_Ga_header",
			"headerActions": "R0k_Ga_headerActions",
			"input": "R0k_Ga_input",
			"loading": "R0k_Ga_loading",
			"messages": "R0k_Ga_messages",
			"newTask": "R0k_Ga_newTask",
			"panel": "R0k_Ga_panel",
			"running": "R0k_Ga_running",
			"send": "R0k_Ga_send",
			"stop": "R0k_Ga_stop",
			"taskButton": "R0k_Ga_taskButton",
			"taskList": "R0k_Ga_taskList",
			"taskRow": "R0k_Ga_taskRow",
			"taskSelected": "R0k_Ga_taskSelected",
			"taskTitle": "R0k_Ga_taskTitle",
			"tasks": "R0k_Ga_tasks",
			"title": "R0k_Ga_title",
			"user": "R0k_Ga_user"
		};
		//#endregion
		//#region src/client/SideTaskPanel.tsx
		/**
		* Side-task overlay panel: a fixed right-hand surface beside the main
		* conversation, owned by the current session. The panel collapses to a
		* compact top-right chip — the resting state — and expands while a task is
		* being worked on. Lists the session's temporary task children (persisted
		* per owner), shows a mini conversation of the selected task's OWN messages
		* (the forked seed context stays invisible: the task carries it, the panel
		* never dumps it), and sends/cancels prompts. Closing the panel only hides
		* the UI — tasks and their agents stay alive until their expiry sweep;
		* deleting a task disposes the host agent and erases its stored log through
		* `session.delete`.
		*
		* The mini conversation is pull-based: the event window only backfills the
		* current session, so the panel fetches the selected task's durable history
		* (`fetchHistory` -> `session.history`) on selection, refreshes when a
		* running turn settles, and refreshes after each send.
		*/
		/**
		* Derive the current session's task rows from the list mirror. Rows whose
		* child session is no longer listed on the host (deleted elsewhere, pruned
		* host restart) are dropped: their collection ids may survive in localStorage
		* until the next hydrate, but a dead row must not render or stay selectable.
		* @param current - current session id.
		* @param state - the panel store snapshot.
		* @param byId - session list rows by id.
		* @returns ordered task rows.
		*/
		function taskRows(current, state, byId) {
			if (current === void 0) return [];
			const children = state.tasksBySession[current] ?? [];
			const rows = [];
			for (const childId of children) {
				const row = byId[childId];
				if (row === void 0) continue;
				rows.push({
					childId,
					title: row.displayTitle ?? childId,
					running: row.running === true
				});
			}
			return rows;
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
		function SideTaskPanel({ useSessions, useSideTasks, createTask, deleteTask, sendTask, stopTask, selectTask, collapsePanel, expandPanel, dismissError, closePanel, fetchHistory, lifecycleSupported = true, t }) {
			const current = useSessions((state) => state.current);
			const state = useSideTasks((snapshot) => snapshot);
			const byId = useSessions((snapshot) => snapshot.byId);
			const [draft, setDraft] = (0, react.useState)("");
			const draftRevision = (0, react.useRef)(0);
			const sendPending = (0, react.useRef)(false);
			const [sending, setSending] = (0, react.useState)(false);
			const [sendError, setSendError] = (0, react.useState)(null);
			const [confirming, setConfirming] = (0, react.useState)(null);
			const [entries, setEntries] = (0, react.useState)(null);
			const [historyError, setHistoryError] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [reloadKey, setReloadKey] = (0, react.useState)(0);
			const prevRunningRef = (0, react.useRef)(false);
			const inputRef = (0, react.useRef)(null);
			const [now, setNow] = (0, react.useState)(() => Date.now());
			(0, react.useEffect)(() => {
				const timer = setInterval(() => setNow(Date.now()), 1e3);
				return () => {
					clearInterval(timer);
				};
			}, []);
			const rows = (0, react.useMemo)(() => taskRows(current, state, byId), [
				current,
				state,
				byId
			]);
			const selected = rows.some((row) => row.childId === state.selected) ? state.selected : void 0;
			const selectionRef = (0, react.useRef)(selected);
			selectionRef.current = selected;
			const messages = (0, react.useMemo)(() => taskOwnMessageRows(entries ?? void 0), [entries]);
			const running = selected !== void 0 && byId[selected]?.running === true;
			const busy = running || loading;
			(0, react.useEffect)(() => {
				if (selected === void 0) {
					setEntries(null);
					setHistoryError(null);
					return;
				}
				let stale = false;
				setLoading(true);
				setHistoryError(null);
				loadHistory(selected, fetchHistory).then((result) => {
					if (stale) return;
					setLoading(false);
					if (result.ok) setEntries(result.events);
					else {
						setEntries(null);
						setHistoryError(result.message);
					}
				});
				return () => {
					stale = true;
				};
			}, [
				selected,
				fetchHistory,
				reloadKey
			]);
			(0, react.useEffect)(() => {
				if (prevRunningRef.current && !running && selected !== void 0) setReloadKey((key) => key + 1);
				prevRunningRef.current = running;
			}, [running, selected]);
			(0, react.useEffect)(() => {
				if (selected !== void 0 && !busy) inputRef.current?.focus();
			}, [selected, busy]);
			if (!state.open || current === void 0) return null;
			if (state.collapsed) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: SideTaskPanel_module_css_default.chip,
				"aria-label": t("panel.collapsed"),
				onClick: expandPanel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SideTaskPanel_module_css_default.chipLabel,
					children: t("panel.title")
				}), rows.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SideTaskPanel_module_css_default.chipCount,
					"aria-hidden": "true",
					children: rows.length
				})]
			});
			const onNew = () => {
				createTask(current);
			};
			const onSend = (event) => {
				event.preventDefault();
				const text = draft.trim();
				if (text === "" || selected === void 0 || busy || sendPending.current || !lifecycleSupported) return;
				const revision = draftRevision.current;
				const target = selected;
				sendPending.current = true;
				setSending(true);
				setSendError(null);
				sendTask(target, text).then((accepted) => {
					if (accepted !== true) return;
					if (draftRevision.current === revision && selectionRef.current === target) setDraft("");
					if (selectionRef.current === target) setReloadKey((key) => key + 1);
				}).catch((error) => {
					setSendError(error instanceof Error ? error.message : "Message send failed / 消息发送失败");
				}).finally(() => {
					sendPending.current = false;
					setSending(false);
				});
			};
			const onDelete = (childId) => {
				if (confirming !== childId) {
					setConfirming(childId);
					return;
				}
				setConfirming(null);
				deleteTask(current, childId);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				className: SideTaskPanel_module_css_default.panel,
				"aria-label": t("panel.title"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: SideTaskPanel_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: SideTaskPanel_module_css_default.title,
							children: t("panel.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SideTaskPanel_module_css_default.headerActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideTaskPanel_module_css_default.collapse,
								"aria-label": t("panel.collapse"),
								onClick: collapsePanel,
								children: "–"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideTaskPanel_module_css_default.close,
								"aria-label": t("panel.close"),
								onClick: closePanel,
								children: "×"
							})]
						})]
					}),
					(state.actionError !== null || sendError !== null) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideTaskPanel_module_css_default.errorBar,
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SideTaskPanel_module_css_default.errorText,
							children: [
								t("panel.error"),
								": ",
								sendError ?? state.actionError
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SideTaskPanel_module_css_default.errorClose,
							"aria-label": t("panel.error.close"),
							onClick: () => {
								setSendError(null);
								dismissError();
							},
							children: "×"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideTaskPanel_module_css_default.tasks,
						children: [rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: SideTaskPanel_module_css_default.empty,
							children: t("panel.empty")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
							className: SideTaskPanel_module_css_default.taskList,
							children: rows.map((row) => {
								const last = state.lastActivity[row.childId];
								const remainingMs = last === void 0 ? void 0 : Math.max(0, last + SIDE_TASK_TTL_MS - now);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
									className: SideTaskPanel_module_css_default.taskRow,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: selected === row.childId ? `${SideTaskPanel_module_css_default.taskButton} ${SideTaskPanel_module_css_default.taskSelected}` : SideTaskPanel_module_css_default.taskButton,
											"aria-label": t("task.select"),
											onClick: () => selectTask(row.childId),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: row.running ? SideTaskPanel_module_css_default.dotRunning : SideTaskPanel_module_css_default.dot,
												"aria-hidden": "true"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: SideTaskPanel_module_css_default.taskTitle,
												children: row.title
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SideTaskPanel_module_css_default.expiry,
											"aria-hidden": "true",
											children: !lifecycleSupported ? "" : row.running ? t("task.running") : remainingMs === void 0 ? "" : t("task.expiresIn", { minutes: Math.ceil(remainingMs / 6e4) })
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: SideTaskPanel_module_css_default.delete,
											disabled: !lifecycleSupported,
											"aria-label": confirming === row.childId ? row.running ? t("task.delete.confirm.running") : t("task.delete.confirm") : t("task.delete"),
											onClick: () => onDelete(row.childId),
											children: confirming === row.childId ? row.running ? t("task.delete.confirm.running") : t("task.delete.confirm") : t("task.delete")
										})
									]
								}, row.childId);
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SideTaskPanel_module_css_default.newTask,
							disabled: !lifecycleSupported,
							onClick: onNew,
							children: t("task.new")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideTaskPanel_module_css_default.conversation,
						children: selected === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: SideTaskPanel_module_css_default.empty,
							children: t("conversation.empty")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SideTaskPanel_module_css_default.messages,
							children: [
								loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: SideTaskPanel_module_css_default.loading,
									children: t("conversation.loading")
								}),
								!loading && historyError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: SideTaskPanel_module_css_default.error,
									children: historyError
								}),
								!loading && historyError === null && messages.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: SideTaskPanel_module_css_default.empty,
									children: t("conversation.none")
								}),
								!loading && messages.map((message, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: message.role === "user" ? SideTaskPanel_module_css_default.user : SideTaskPanel_module_css_default.assistant,
									children: message.text
								}, index)),
								running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: SideTaskPanel_module_css_default.running,
									children: t("task.running")
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
							className: SideTaskPanel_module_css_default.composer,
							onSubmit: onSend,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: inputRef,
								className: SideTaskPanel_module_css_default.input,
								value: draft,
								disabled: busy || !lifecycleSupported,
								placeholder: t("conversation.placeholder"),
								"aria-label": t("conversation.placeholder"),
								onChange: (event) => {
									draftRevision.current++;
									setDraft(event.target.value);
								}
							}), running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideTaskPanel_module_css_default.stop,
								onClick: () => {
									stopTask(selected);
								},
								children: t("conversation.stop")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								className: SideTaskPanel_module_css_default.send,
								disabled: !lifecycleSupported || busy || sending || draft.trim() === "" || selected === void 0,
								children: t("conversation.send")
							})]
						})] })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("footer", {
						className: SideTaskPanel_module_css_default.footer,
						children: t(lifecycleSupported ? "task.ttl" : "task.unsupported")
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** `sideTask` namespace dictionaries. */
		/** Dictionary namespace owned by this plugin. */
		const NS = "sideTask";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"action.aria": "侧边任务",
			"panel.title": "侧边任务",
			"panel.close": "关闭面板",
			"panel.collapse": "收起面板",
			"panel.collapsed": "展开侧边任务面板",
			"panel.empty": "暂无侧边任务",
			"panel.error": "操作失败",
			"panel.error.close": "关闭错误提示",
			"task.new": "新建侧边任务",
			"task.select": "切换到任务",
			"task.delete": "删除任务",
			"task.delete.confirm": "确认删除",
			"task.delete.confirm.running": "任务运行中,删除将中断它",
			"task.deleted": "任务已删除",
			"task.running": "运行中",
			"task.expiresIn": "还剩 {minutes} 分钟自动删除",
			"task.unsupported": "当前 DSH 缺少完整历史/删除能力；暂不支持创建和自动清理，请勿依赖一小时删除。",
			"task.ttl": "侧边任务为临时任务,1 小时无新对话将自动删除",
			"conversation.empty": "选择任务开始对话",
			"conversation.loading": "加载中…",
			"conversation.none": "新任务,直接对话",
			"conversation.placeholder": "输入消息…",
			"conversation.send": "发送",
			"conversation.stop": "停止"
		};
		/** English dictionary, key-identical to the Chinese source of truth. */
		const en = {
			"action.aria": "Side tasks",
			"panel.title": "Side tasks",
			"panel.close": "Close panel",
			"panel.collapse": "Collapse panel",
			"panel.collapsed": "Expand side-task panel",
			"panel.empty": "No side tasks yet",
			"panel.error": "Action failed",
			"panel.error.close": "Dismiss error",
			"task.new": "New side task",
			"task.select": "Switch to task",
			"task.delete": "Delete task",
			"task.delete.confirm": "Confirm delete",
			"task.delete.confirm.running": "Task is running; deleting will interrupt it",
			"task.deleted": "Task deleted",
			"task.running": "running",
			"task.expiresIn": "deletes in {minutes} min",
			"task.unsupported": "This DSH lacks history/delete capabilities. Creation and automatic cleanup are unavailable; do not rely on one-hour deletion.",
			"task.ttl": "Side tasks are temporary: they are deleted automatically after 1 hour without new messages",
			"conversation.empty": "Select a task to start chatting",
			"conversation.loading": "Loading…",
			"conversation.none": "New task — start chatting",
			"conversation.placeholder": "Type a message…",
			"conversation.send": "Send",
			"conversation.stop": "Stop"
		};
		//#endregion
		//#region src/client/index.ts
		/** Required services: slot registration, sessions + workspaces ports, and copy. */
		const inject = [
			"slots",
			"sessions",
			"workspaces",
			"locale",
			"connection"
		];
		/** Expiry sweep cadence: a lazy check, never a busy one. */
		const SWEEP_INTERVAL_MS = 3e4;
		/**
		* Client plugin body: register the dictionaries, both entries, and the
		* background expiry sweep.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const legacy = ctx.sessions;
			const history = historyReader(legacy, ctx.get("connection").api.sessions);
			const unsupported = "当前 DSH 未提供侧边任务所需的历史/删除能力；未创建任务。 Required session history/delete capability unavailable; no task was created.";
			const controller = createSideTasksController({
				fork: (opts) => ctx.sessions.fork(opts),
				archiveSession: (sessionId) => ctx.workspaces.archiveSession(sessionId),
				delete: async (sessionId) => {
					if (typeof legacy.delete !== "function") throw new Error(unsupported);
					await legacy.delete.call(ctx.sessions, sessionId);
				},
				history: history.read,
				binding: (sessionId) => ctx.sessions.binding(sessionId),
				list: ctx.sessions.list
			});
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-side-tasks: dictionaries");
			ctx.effect(() => controller.followCurrent(), "ui-side-tasks: current collection hydration");
			ctx.effect(() => {
				/* v8 ignore next -- 30s cadence is outside any test window; teardown clearing is asserted */
				const timer = setInterval(() => {
					controller.sweepExpired();
				}, SWEEP_INTERVAL_MS);
				controller.sweepExpired();
				return () => {
					clearInterval(timer);
				};
			}, "ui-side-tasks: expiry sweep");
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "side-task",
				order: 30,
				locale: NS,
				inject: () => ({
					hooks: { sideTasks: controller.store },
					togglePanel: () => controller.togglePanel()
				})
			}, SideTaskAction));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "side-task-panel",
				order: 10,
				locale: NS,
				inject: () => ({
					lifecycleSupported: typeof legacy.delete === "function" && history.available(),
					hooks: { sideTasks: controller.store },
					createTask: async (ownerSessionId) => {
						try {
							if (typeof legacy.delete !== "function" || !history.available()) throw new Error(unsupported);
							await controller.createTask(ownerSessionId);
						} catch (error) {
							controller.store.update((draft) => {
								draft.actionError = error instanceof Error ? error.message : String(error);
							});
						}
					},
					deleteTask: (ownerSessionId, childId) => controller.deleteTask(ownerSessionId, childId),
					sendTask: (childId, text) => controller.sendTask(childId, text),
					stopTask: (childId) => controller.stopTask(childId),
					selectTask: (childId) => controller.selectTask(childId),
					collapsePanel: () => controller.collapsePanel(),
					expandPanel: () => controller.expandPanel(),
					dismissError: () => controller.dismissError(),
					closePanel: () => controller.closePanel(),
					fetchHistory: async (childId) => {
						const result = await controller.fetchHistory(childId);
						return result.ok ? {
							ok: true,
							events: result.value.events
						} : {
							ok: false,
							message: result.error.message
						};
					}
				})
			}, SideTaskPanel));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map