/**
 * grok-client — typed wrappers over the OpenBuddy Tauri commands and events.
 *
 * The Rust backend (src-tauri/src/commands.rs) exposes a command table that
 * drives the in-process grok agent over ACP. Streamed updates arrive as the
 * `grok://update`, `grok://permission`, `grok://complete` events, whose
 * payloads are the types in ./types.ts.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AccountInfo,
  AgentDefaults,
  AgentEntry,
  Automation,
  ExpertCatalog,
  AutomationSnapshot,
  AutomationStatus,
  InspirationStarted,
  LogoutResult,
  McpConfigFile,
  McpServerEntry,
  McpUpsertRequest,
  MemoryEntry,
  PermissionRequest,
  PermissionRule,
  PromptComplete,
  RewindPoint,
  RunningTask,
  SearchHit,
  SessionSummary,
  SessionSummaryEvent,
  SessionUpdate,
  SkillInfo,
  SlashCommand,
  SubscriptionStatus,
} from "./types";

import type { QuestionRequest } from "@/stores/question-store";

// ---------- commands ----------

export interface AuthStatus {
  ready: boolean;
  /** True if ~/.grok/auth.json exists. */
  hasAuthFile: boolean;
  /** Human-readable reason when not ready. */
  reason?: string;
  /** Model ids configured in ~/.grok/config.toml (BYOK providers). */
  providers: string[];
}

export interface InitResult {
  /** Whether the agent initialized and authenticated successfully. */
  ok: boolean;
  auth: AuthStatus;
  /** The cwd the agent bound to (echoes the input). */
  cwd: string;
  agentVersion?: string;
  /** Default model id the agent will use. */
  defaultModelId?: string;
}

/**
 * Initialize the in-process grok agent. If `cwd` is omitted the backend
 * defaults to the user's home directory.
 */
export async function grokInit(cwd?: string): Promise<InitResult> {
  return invoke<InitResult>("grok_init", { cwd: cwd ?? null });
}

export async function grokAuthStatus(): Promise<AuthStatus> {
  return invoke<AuthStatus>("grok_auth_status");
}

// NOTE: the backend `grok_new_session` command returns the session id as a
// bare `String` (see commands.rs grok_new_session). We type it as `string`
// here — do NOT wrap it in `{ sessionId }`, or callers destructuring
// `const { sessionId } = ...` will silently get undefined.
//
// `modelId` is passed as `_meta.modelId` to grok so the session binds to
// that model from the start (avoids the default `grok-build` model whose
// sampling config has no key in a BYOK-only setup).
export async function grokNewSession(cwd: string, modelId?: string): Promise<string> {
  return invoke<string>("grok_new_session", { cwd, modelId: modelId ?? null });
}

// `grok_load_session` triggers a history replay on the agent side: grok
// re-emits the persisted transcript as a stream of SessionUpdate messages,
// which our existing `grok://update` listener already funnels into the
// session store. So this command returns nothing — callers just need to
// clear the local transcript first, then await this to confirm the agent
// accepted the load.
export async function grokLoadSession(sessionId: string, cwd: string): Promise<void> {
  await invoke<void>("grok_load_session", { sessionId, cwd });
}

export async function grokListSessions(cwd: string): Promise<SessionSummary[]> {
  return invoke<SessionSummary[]>("grok_list_sessions", { cwd });
}

/** A discovered working directory (grok has run sessions in it). */
export interface WorkspaceInfo {
  /** Absolute path of the working directory. */
  cwd: string;
  /** Number of sessions recorded under this cwd. */
  sessionCount: number;
  /** Title of the most recent session under this cwd (optional, for display). */
  lastTitle?: string;
}

/**
 * List every working directory grok has ever seen (deduplicated), with a
 * session count per cwd. Used to populate the Composer's workspace picker.
 */
export async function grokListWorkspaces(): Promise<WorkspaceInfo[]> {
  return invoke<WorkspaceInfo[]>("grok_list_workspaces");
}

/**
 * Switch the model used by an existing session (grok's `session/set_model`).
 * May reject with `MODEL_SWITCH_INCOMPATIBLE_AGENT` if the session has turns
 * and the new model requires a different agent harness — surface that error
 * to the user (suggest starting a new session).
 */
export async function grokSetModel(sessionId: string, modelId: string): Promise<void> {
  await invoke<void>("grok_set_model", { sessionId, modelId });
}

/** Send a user prompt; streamed updates arrive via the events below. */
export async function grokSend(sessionId: string, text: string): Promise<void> {
  await invoke<void>("grok_send", { sessionId, text });
}

export async function grokCancel(sessionId: string): Promise<void> {
  await invoke<void>("grok_cancel", { sessionId });
}

/**
 * Rename a session via grok's `x.ai/session/rename` extension method. grok
 * writes `generated_title` + `title_is_manual=true` to summary.json and
 * broadcasts `SessionSummaryGenerated`, which we also pick up via the
 * `grok://summary` event — so callers don't strictly need to optimistically
 * update the title, but doing so avoids a flicker while the event round-trips.
 *
 * `cwd` is optional but narrows grok's on-disk session lookup.
 */
export async function grokRenameSession(
  sessionId: string,
  title: string,
  cwd?: string,
): Promise<void> {
  await invoke<void>("grok_rename_session", { sessionId, title, cwd: cwd ?? null });
}

/**
 * Delete a session's persisted history via grok's `x.ai/session/delete`.
 * Removes the on-disk session directory; the caller should drop the sidebar
 * entry on success.
 */
export async function grokDeleteSession(sessionId: string, cwd?: string): Promise<void> {
  await invoke<void>("grok_delete_session", { sessionId, cwd: cwd ?? null });
}

/**
 * Pin/unpin a session. grok's Summary has no pinned field, so this is
 * OpenBuddy-only state stored in `~/.grok/openbuddy-state.json`. Returns the
 * new pinned value.
 */
export async function grokSetSessionPinned(
  sessionId: string,
  pinned: boolean,
): Promise<boolean> {
  return invoke<boolean>("grok_set_session_pinned", { sessionId, pinned });
}

/**
 * Archive/unarchive a session. grok's Summary has no archived field, so this
 * is OpenBuddy-only state stored in `~/.grok/openbuddy-state.json`. Archived
 * sessions are hidden from the sidebar list. Returns the new archived value.
 */
export async function grokSetSessionArchived(
  sessionId: string,
  archived: boolean,
): Promise<boolean> {
  return invoke<boolean>("grok_set_session_archived", { sessionId, archived });
}

export async function grokResolvePermission(
  requestId: string,
  outcome: { optionId?: string; cancelled?: boolean }
): Promise<void> {
  await invoke<void>("grok_resolve_permission", {
    requestId,
    optionId: outcome.optionId ?? null,
    cancelled: outcome.cancelled ?? false,
  });
}

export async function grokResolveQuestion(
  requestId: string,
  outcome: {
    /** Keyed by question text. Values are option labels (or string arrays for multi-select). */
    answers?: Record<string, string | string[]>;
    /** Per-question notes/preview, keyed by question text. Freeform uses notes. */
    annotations?: Record<string, { preview?: string; notes?: string }>;
    cancelled?: boolean;
  }
): Promise<void> {
  await invoke<void>("grok_resolve_question", {
    requestId,
    answers: outcome.answers ?? null,
    annotations: outcome.annotations ?? null,
    cancelled: outcome.cancelled ?? false,
  });
}

// ---------- provider config (BYOK) ----------

export type ProviderKind =
  | "anthropic"
  | "openai"
  | "grok"
  | "deepseek"
  | "qwen"
  | "custom";

/** API wire protocol. Mirrors grok's ApiBackend enum (snake_case). */
export type ApiBackend = "chat_completions" | "responses" | "messages";

/** HTTP auth header style. Mirrors grok's AuthScheme enum (snake_case). */
export type AuthScheme = "bearer" | "x_api_key";

export interface ProviderConfig {
  providerKind: ProviderKind;
  modelId: string;
  label?: string;
  /** Masked "••••" when read back; the real secret when saving. */
  apiKey?: string;
  /** Override the preset base_url. Undefined = inherit from disk or preset. */
  baseUrl?: string;
  /** Override the preset api_backend. */
  apiBackend?: ApiBackend;
  /** Override the preset auth_scheme. */
  authScheme?: AuthScheme;
  /** Human-readable display name (grok's `name` field). */
  name?: string;
}

export async function providersList(): Promise<ProviderConfig[]> {
  return invoke<ProviderConfig[]>("providers_list");
}

export async function providersSave(providers: ProviderConfig[]): Promise<void> {
  await invoke<void>("providers_save", { providers });
}

export async function providersDelete(modelId: string): Promise<void> {
  await invoke<void>("providers_delete", { modelId });
}

// ---------- skills (x.ai/skills/*) ----------

/** List all skills grok has discovered (user / project / bundled scopes). */
export async function skillsList(cwd?: string): Promise<SkillInfo[]> {
  return invoke<SkillInfo[]>("skills_list", { cwd: cwd ?? null });
}

/** Add a skill path (directory or file) to `[skills].paths` and rescan. */
export async function skillsAdd(path: string, cwd?: string): Promise<void> {
  await invoke<void>("skills_add", { path, cwd: cwd ?? null });
}

/** Remove a skill path from `[skills].paths`. */
export async function skillsRemove(path: string, cwd?: string): Promise<void> {
  await invoke<void>("skills_remove", { path, cwd: cwd ?? null });
}

/** Enable or disable a skill by name (writes `[skills] disabled`). */
export async function skillsToggle(name: string, enabled: boolean): Promise<void> {
  await invoke<void>("skills_toggle", { name, enabled });
}

// ---------- connectors / MCP (x.ai/mcp/*) ----------

/** List configured MCP servers. */
export async function mcpList(): Promise<McpServerEntry[]> {
  return invoke<McpServerEntry[]>("mcp_list");
}

/** Add or update an MCP server. */
export async function mcpUpsert(server: McpUpsertRequest): Promise<void> {
  await invoke<void>("mcp_upsert", { server });
}

/** Delete an MCP server by name. */
export async function mcpDelete(name: string): Promise<void> {
  await invoke<void>("mcp_delete", { name });
}

/** Enable or disable an MCP server at runtime. */
export async function mcpToggle(name: string, enabled: boolean): Promise<void> {
  await invoke<void>("mcp_toggle", { name, enabled });
}

/** Resolved absolute path of the standalone mcp.json (for the editor header). */
export async function mcpConfigPath(): Promise<string> {
  return invoke<string>("mcp_config_path");
}

/** Read the standalone mcp.json (returns an empty template if missing). */
export async function mcpConfigRead(): Promise<McpConfigFile> {
  return invoke<McpConfigFile>("mcp_config_read");
}

/** Validate + write the standalone mcp.json (best-effort syncs into grok). */
export async function mcpConfigSave(content: string): Promise<void> {
  await invoke<void>("mcp_config_save", { content });
}

// ---------- expert marketplace (live local data dir) ----------

/** First existing candidate data root ("" if none found). */
export async function expertsDefaultRoot(): Promise<string> {
  return invoke<string>("experts_default_root");
}

/** Data roots under `root` that contain the marketplace manifest. */
export async function expertsListRoots(root: string): Promise<string[]> {
  return invoke<string[]>("experts_list_roots", { root });
}

/** Load categories + experts by merging the manifest with each plugin.json. */
export async function expertsLoad(root?: string): Promise<ExpertCatalog> {
  return invoke<ExpertCatalog>("experts_load", { root: root ?? null });
}

/** Small base64 JPEG thumbnail for a local avatar path (cached server-side). */
export async function expertsThumbnail(path: string): Promise<string> {
  return invoke<string>("experts_thumbnail", { path });
}

/** Full-size local image as a `data:` URL (used for 精选场景 banners). */
export async function expertsImageBytes(path: string): Promise<string> {
  return invoke<string>("experts_image_bytes", { path });
}

// ---------- experts / assistants (~/.grok/agents/*.md) ----------

/** List all agent definitions visible to OpenBuddy. */
export async function agentsList(cwd?: string): Promise<AgentEntry[]> {
  return invoke<AgentEntry[]>("agents_list", { cwd: cwd ?? null });
}

/** Fetch a single agent file's full contents. */
export async function agentsGet(path: string): Promise<string> {
  return invoke<string>("agents_get", { path });
}

/** Save an agent file (create or overwrite) to ~/.grok/agents/<name>.md. */
export async function agentsSave(name: string, raw: string): Promise<AgentEntry> {
  return invoke<AgentEntry>("agents_save", { name, raw });
}

/** Delete an agent file by path. */
export async function agentsDelete(path: string): Promise<void> {
  await invoke<void>("agents_delete", { path });
}

/** Render a starter agent markdown body from name/description/system prompt.
 *  Optional avatar (1-20) and modelTags are written to frontmatter. */
export async function agentsTemplate(
  name: string,
  description: string,
  systemPrompt: string,
  avatar?: number,
  modelTags?: string[],
): Promise<string> {
  return invoke<string>("agents_template", {
    name,
    description,
    systemPrompt,
    avatar: avatar ?? null,
    modelTags: modelTags ?? null,
  });
}

// ---------- permission rules (~/.grok/config.toml [permission]) ----------

/** List the current permission rules (allow/deny/ask) from config.toml. */
export async function permissionList(): Promise<PermissionRule[]> {
  return invoke<PermissionRule[]>("permission_list");
}

/** Replace all permission rules. Writes to config.toml atomically.
 *  NOTE: requires a grok restart to take effect. */
export async function permissionSave(rules: PermissionRule[]): Promise<void> {
  await invoke<void>("permission_save", { rules });
}

// ---------- permission mode (~/.grok/config.toml [ui].permission_mode) ----------

/** grok 的权限模式:审批(ask)/自动(auto)/始终允许(always-approve)。 */
export type PermissionMode = "ask" | "auto" | "always-approve";

/** Read the configured permission mode (default "ask"). */
export async function permissionModeGet(): Promise<PermissionMode> {
  return invoke<PermissionMode>("permission_mode_get");
}

/** Set the permission mode: persists to config.toml and live-notifies the
 *  running agent via grok's `x.ai/yolo_mode_changed` extension notification. */
export async function permissionModeSet(mode: PermissionMode): Promise<void> {
  await invoke<void>("permission_mode_set", { mode });
}

// ---------- memory (资料库 — ~/.grok/memory/) ----------

/** List memory notes from global + workspace scope. */
export async function memoryList(cwd?: string): Promise<MemoryEntry[]> {
  return invoke<MemoryEntry[]>("memory_list", { cwd: cwd ?? null });
}

/** Read a single memory file. */
export async function memoryGet(scope: string, path: string, cwd?: string): Promise<string> {
  return invoke<string>("memory_get", { scope, path, cwd: cwd ?? null });
}

/** Create or overwrite a memory note. */
export async function memorySave(
  scope: string,
  path: string,
  content: string,
  cwd?: string,
): Promise<MemoryEntry> {
  return invoke<MemoryEntry>("memory_save", { scope, path, content, cwd: cwd ?? null });
}

/** Delete a memory note. */
export async function memoryDelete(scope: string, path: string, cwd?: string): Promise<void> {
  await invoke<void>("memory_delete", { scope, path, cwd: cwd ?? null });
}

/** Trigger grok to rewrite memories via an LLM pass (`x.ai/memory/rewrite`). */
export async function memoryRewrite(): Promise<void> {
  await invoke<void>("memory_rewrite");
}

/** Flush in-flight memory writes to disk (`x.ai/memory/flush`). */
export async function memoryFlush(): Promise<void> {
  await invoke<void>("memory_flush");
}

// ---------- session search (FTS5) ----------

/** Full-text search across all sessions. */
export async function sessionSearch(
  query: string,
  cwd?: string,
  limit?: number,
): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("session_search", { query, cwd: cwd ?? null, limit: limit ?? null });
}

// ---------- rewind ----------

/** List prompts a session can rewind to. */
export async function rewindPoints(sessionId: string): Promise<RewindPoint[]> {
  return invoke<RewindPoint[]>("rewind_points", { sessionId });
}

/** Rewind a session to a specific prompt index. */
export async function rewindExecute(
  sessionId: string,
  targetPromptIndex: number,
  mode?: string,
  force?: boolean,
): Promise<void> {
  await invoke<void>("rewind_execute", {
    sessionId,
    targetPromptIndex,
    mode: mode ?? null,
    force: force ?? null,
  });
}

// ---------- session fork ----------

/** Fork a session: copy history to a new session id. Returns the new id. */
export async function sessionFork(sessionId: string, cwd?: string): Promise<string> {
  return invoke<string>("session_fork", { sessionId, cwd: cwd ?? null });
}

// ---------- slash commands + prompt history ----------

/** List slash commands (builtin + skills + plugins). Powers "/" autocomplete. */
export async function commandsList(): Promise<SlashCommand[]> {
  return invoke<SlashCommand[]>("commands_list");
}

/** Cross-session prompt history. */
export async function promptHistory(limit?: number): Promise<string[]> {
  return invoke<string[]>("prompt_history", { limit: limit ?? null });
}

// ---------- tasks / subagents ----------

/** List running background tasks / subagents. */
export async function tasksList(): Promise<RunningTask[]> {
  return invoke<RunningTask[]>("tasks_list");
}

/** Kill a running task or subagent. */
export async function taskKill(taskId: string): Promise<void> {
  await invoke<void>("task_kill", { taskId });
}

// ---------- folder trust ----------

/** Respond to a folder-trust request from grok. */
export async function folderTrustRespond(cwd: string, trusted: boolean): Promise<void> {
  await invoke<void>("folder_trust_respond", { cwd, trusted });
}

// ---------- plan mode ----------

/** Toggle plan mode for a session (client → grok notification). */
export async function togglePlanMode(sessionId: string, enabled: boolean): Promise<void> {
  await invoke<void>("toggle_plan_mode", { sessionId, enabled });
}

// ---------- internal reload ----------

/** Hot-reload grok's view of config/skills/mcp/models. `kind` ∈
 *  "mcp_all" | "mcp_project" | "skills" | "models". */
export async function internalReload(kind: "mcp_all" | "mcp_project" | "skills" | "models"): Promise<void> {
  await invoke<void>("internal_reload", { kind });
}

// ---------- automations (local scheduler, WorkBuddy 1:1) ----------

/** Full snapshot: automations (next runs recomputed) + run records. */
export async function automationsSnapshot(): Promise<AutomationSnapshot> {
  return invoke<AutomationSnapshot>("automations_snapshot");
}

/** Create or update an automation. */
export async function automationsSave(automation: Automation): Promise<Automation> {
  return invoke<Automation>("automations_save", { automation });
}

/** Delete an automation by id. */
export async function automationsDelete(id: string): Promise<void> {
  await invoke<void>("automations_delete", { id });
}

/** Set an automation's status ("ACTIVE" | "PAUSED"). */
export async function automationsSetStatus(id: string, status: AutomationStatus): Promise<void> {
  await invoke<void>("automations_set_status", { id, status });
}

/** Manually fire an automation now (test run). Opens a new grok session. */
export async function automationsRun(id: string): Promise<void> {
  await invoke<void>("automations_run", { id });
}

/** Archive / unarchive a run record. */
export async function automationRecordsArchive(id: string, archived: boolean): Promise<void> {
  await invoke<void>("automation_records_archive", { id, archived });
}

/** Delete a run record. */
export async function automationRecordsDelete(id: string): Promise<void> {
  await invoke<void>("automation_records_delete", { id });
}

// ---------- inspiration (灵感面板) ----------

/** Start inspiration generation. Opens a side-channel grok session that
 *  streams its response via the normal `grok://update` event (tagged with
 *  the returned sessionId). The frontend registers a foreign-update listener
 *  to accumulate the JSON output. */
export async function inspirationGenerate(
  category: string,
  cwd?: string,
  count?: number,
): Promise<InspirationStarted> {
  return invoke<InspirationStarted>("inspiration_generate", {
    request: { category, cwd: cwd ?? null, count: count ?? null },
  });
}

// ---------- account (x.ai/auth/*) ----------

/** Fetch the user's account profile (email, name, team, org, ...). */
export async function accountInfo(): Promise<AccountInfo> {
  return invoke<AccountInfo>("account_info");
}

/** Re-check the subscription/gate state. Returns auth flag + opaque meta. */
export async function accountCheckSubscription(): Promise<SubscriptionStatus> {
  return invoke<SubscriptionStatus>("account_check_subscription");
}

/** Log out of grok OAuth. `scope="all"` revokes all sessions. */
export async function accountLogout(scope?: string): Promise<LogoutResult> {
  return invoke<LogoutResult>("account_logout", { scope: scope ?? null });
}

/** Get the raw xAI API key (from XAI_API_KEY env / ~/.grok/config). */
export async function accountGetApiKey(): Promise<string | null> {
  return invoke<string | null>("account_get_api_key");
}

/** Set or clear the xAI API key. Empty/null clears it. */
export async function accountSetApiKey(key: string | null): Promise<void> {
  await invoke<void>("account_set_api_key", { key });
}

/** Get the OAuth login URL (blocks until grok has one or reports null). */
export async function accountGetAuthUrl(): Promise<{
  authUrl: string | null;
  externalProvider: boolean;
  mode: string | null;
}> {
  return invoke("account_get_auth_url");
}

/** Cancel any in-flight interactive login. */
export async function accountCancelAuth(): Promise<void> {
  await invoke<void>("account_cancel_auth");
}

// ---------- agent / assistant defaults (~/.grok/config.toml) ----------

/** Read the new-session defaults (model + permission + remember-tool-approvals). */
export async function agentsDefaultsGet(): Promise<AgentDefaults> {
  return invoke<AgentDefaults>("agents_defaults_get");
}

/** Save the new-session defaults. Atomic write to config.toml. */
export async function agentsDefaultsSave(defaults: AgentDefaults): Promise<void> {
  await invoke<void>("agents_defaults_save", { defaults });
}

// ---------- plugins + marketplace (x.ai/plugins/*, x.ai/marketplace/*) ----------

import type {
  MarketplaceListResponse,
  PluginsListResponse,
} from "./types";

/** List installed plugins via `x.ai/plugins/list`. */
export async function pluginsList(sessionId?: string): Promise<PluginsListResponse> {
  return invoke<PluginsListResponse>("plugins_list", { sessionId: sessionId ?? null });
}

/** Execute a plugin action (enable/disable/install/etc). */
export async function pluginsAction(
  sessionId: string,
  action: unknown,
): Promise<unknown> {
  return invoke("plugins_action", { sessionId, action });
}

/** List marketplace sources + plugins via `x.ai/marketplace/list`. */
export async function marketplaceList(sessionId?: string): Promise<MarketplaceListResponse> {
  return invoke<MarketplaceListResponse>("marketplace_list", { sessionId: sessionId ?? null });
}

/** Execute a marketplace action (install/uninstall/refresh/add_source/remove_source). */
export async function marketplaceAction(
  sessionId: string,
  action: unknown,
): Promise<unknown> {
  return invoke("marketplace_action", { sessionId, action });
}

// ---------- notification log (智能体邮箱) ----------

import type { NotificationEntry, NotificationKind } from "./types";

/** Append a notification to the log (called when a grok event is received). */
export async function notificationAppend(
  kind: NotificationKind | string,
  title: string,
  body?: string,
  sessionId?: string,
  severity?: "info" | "warn" | "error",
): Promise<void> {
  await invoke<void>("notification_append", {
    kind,
    title,
    body: body ?? null,
    sessionId: sessionId ?? null,
    severity: severity ?? null,
  });
}

/** List notifications (newest first). */
export async function notificationList(): Promise<NotificationEntry[]> {
  return invoke<NotificationEntry[]>("notification_list");
}

/** Mark a notification as read. */
export async function notificationMarkRead(id: number): Promise<void> {
  await invoke<void>("notification_mark_read", { id });
}

/** Mark all as read. */
export async function notificationMarkAllRead(): Promise<void> {
  await invoke<void>("notification_mark_all_read");
}

/** Clear all notifications. */
export async function notificationClear(): Promise<void> {
  await invoke<void>("notification_clear");
}

// ---------- event subscription ----------

export interface GrokEventListeners {
  unlisten: UnlistenFn;
}

/** Subscribe to all grok events, dispatching into the provided callbacks. */
export async function subscribeGrokEvents(handlers: {
  onUpdate?: (u: SessionUpdate & { __sessionId?: string }) => void;
  onPermission?: (p: PermissionRequest) => void;
  onComplete?: (p: PromptComplete) => void;
  /** Fired when grok generates or renames a session title
   *  (`x.ai/session_notification` → `SessionSummaryGenerated`). */
  onSummary?: (s: SessionSummaryEvent) => void;
  /** Fired on MCP connector status / init-progress notifications. */
  onMcpStatus?: (p: unknown) => void;
  /** Fired when grok asks us to trust a folder (`x.ai/folder_trust/request`). */
  onFolderTrust?: (p: unknown) => void;
  /** Fired when plan mode is toggled (`x.ai/toggle_plan_mode`). */
  onPlanMode?: (p: unknown) => void;
  /** Fired when the permission mode (auto/yolo) changes. */
  onPermissionMode?: (p: unknown) => void;
  /** Fired when the model list updates. */
  onModelsUpdate?: (p: unknown) => void;
  /** Fired on background task lifecycle (`task_backgrounded`/`task_completed`). */
  onTaskUpdate?: (p: unknown) => void;
  /** Fired when the agent asks a question (`x.ai/question`). */
  onQuestion?: (q: QuestionRequest) => void;
}): Promise<UnlistenFn> {
  const unlisteners: UnlistenFn[] = [];
  const wire = async <T>(event: string, cb: ((p: T) => void) | undefined) => {
    if (!cb) return;
    unlisteners.push(await listen<T>(event, (e) => cb(e.payload)));
  };

  if (handlers.onUpdate) {
    unlisteners.push(
      await listen<SessionUpdate & { sessionId?: string }>("grok://update", (e) => {
        // Backend now tags each update with its sessionId. We forward it via
        // a side field so the store can filter (ignore updates for sessions
        // other than the current one — e.g. inspiration generation).
        const { sessionId, ...update } = e.payload;
        (update as SessionUpdate & { __sessionId?: string }).__sessionId = sessionId;
        handlers.onUpdate!(update as SessionUpdate & { __sessionId?: string });
      }),
    );
  }
  await wire<PermissionRequest>("grok://permission", handlers.onPermission);
  await wire<PromptComplete>("grok://complete", handlers.onComplete);
  await wire<SessionSummaryEvent>("grok://summary", handlers.onSummary);
  await wire("grok://mcp-status", handlers.onMcpStatus);
  await wire("grok://folder-trust", handlers.onFolderTrust);
  await wire("grok://plan-mode", handlers.onPlanMode);
  await wire("grok://permission-mode", handlers.onPermissionMode);
  await wire("grok://models-update", handlers.onModelsUpdate);
  await wire("grok://task-update", handlers.onTaskUpdate);
  await wire<QuestionRequest>("grok://question", handlers.onQuestion);

  return () => unlisteners.forEach((u) => u());
}
