/**
 * ACP (Agent Client Protocol) wire types — TypeScript mirror of the subset
 * of `agent-client-protocol` messages OpenBuddy's Rust backend forwards to
 * the frontend as Tauri events.
 *
 * Source of truth: the `agent-client-protocol` 0.10.4 crate (used by grok)
 * and the x.ai extensions documented in
 *   grok-build/crates/codegen/xai-grok-shell/src/extensions/notification.rs
 *
 * The Rust backend serializes these with serde and emits them as the `payload`
 * of `grok://update` / `grok://permission` / `grok://complete` events.
 */

// ---------- content blocks ----------

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThoughtContent {
  type: "thought";
  text: string;
}

export interface DiffContent {
  type: "diff";
  diff: {
    path: string;
    old: string;
    new: string;
    /** Optional unified-diff style hunks when available. */
    hunks?: Array<{ old: { start: number; lines: string[] }; new: { start: number; lines: string[] } }>;
  };
}

export interface CommandOutputContent {
  type: "command_output";
  /** The shell command that was (or is being) run. */
  command?: string;
  /** Stdout+stderr captured so far. */
  output: string;
  exitCode?: number | null;
}

export type ToolCallContent = TextContent | DiffContent | CommandOutputContent;

// ---------- tool call status ----------

export type ToolCallStatus = "in_progress" | "completed" | "failed";

// Known grok tool kinds (from xai-grok-tools). The wire format allows unknown
// kinds too — render them generically.
export type ToolKind =
  | "read_file"
  | "edit"
  | "grep"
  | "list_dir"
  | "run_terminal_command"
  | "web_search"
  | "web_fetch"
  | "todo_write"
  | "spawn_subagent"
  | "memory_search"
  | string; // forward-compat

// ---------- session updates (the agent -> client stream) ----------

export interface AgentMessageChunk {
  type: "agent_message_chunk";
  content: TextContent[];
}

export interface AgentThoughtChunk {
  type: "agent_thought_chunk";
  content: ThoughtContent[];
}

export interface ToolCallUpdate {
  type: "tool_call";
  toolCallId: string;
  title: string;
  kind: ToolKind;
  status: ToolCallStatus;
  /** Raw input the tool was invoked with, when the agent sends it inline. */
  rawInput?: unknown;
  content: ToolCallContent[];
}

export interface ToolCallDeltaUpdate {
  type: "tool_call_update";
  toolCallId: string;
  /** Partial field updates (e.g. streamed raw_input). */
  update: Record<string, unknown>;
}

export interface PlanUpdate {
  type: "plan";
  plan: Plan;
}

/** A grok execution plan (ACP `Plan`). Each update replaces the whole plan. */
export interface Plan {
  entries: PlanEntry[];
}

export interface PlanEntry {
  /** Human-readable description of this task. */
  content: string;
  /** "high" | "medium" | "low". */
  priority: PlanEntryPriority;
  /** "pending" | "in_progress" | "completed". */
  status: PlanEntryStatus;
}

export type PlanEntryPriority = "high" | "medium" | "low";
export type PlanEntryStatus = "pending" | "in_progress" | "completed";

export interface UsageUpdate {
  type: "usage_update";
  usage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** Catch-all for x.ai/grok extension session-update types not modeled above. */
export interface ExtensionSessionUpdate {
  type: string;
  [key: string]: unknown;
}

export type SessionUpdate =
  | AgentMessageChunk
  | AgentThoughtChunk
  | ToolCallUpdate
  | ToolCallDeltaUpdate
  | PlanUpdate
  | UsageUpdate
  | ExtensionSessionUpdate;

// ---------- permissions ----------

export type PermissionKind = "allow" | "allow_always" | "deny";

export interface PermissionOption {
  optionId: string;
  kind: PermissionKind;
  title: string;
}

export interface PermissionRequest {
  /** Echoed back in `grok_resolve_permission`. */
  requestId: string;
  sessionId: string;
  toolCallId: string;
  toolKind: ToolKind;
  title: string;
  /** Optional partial raw input to show the user what they're approving. */
  rawInput?: unknown;
  options: PermissionOption[];
}

// ---------- prompt completion ----------

export type StopReason =
  | "end_turn"
  | "max_turns"
  | "rate_limited"
  | "cancelled"
  | string;

export interface PromptComplete {
  sessionId: string;
  promptId: string;
  turnId?: number;
  stopReason: StopReason;
  cancelTrigger?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

// ---------- session metadata ----------

export interface SessionSummary {
  sessionId: string;
  /** Human-readable title. Display priority matches grok's `display_title`:
   * `generated_title` (LLM-generated or manual /rename) > `session_summary`
   * (user's first prompt text). */
  title: string;
  /** ISO timestamp of last activity (`updated_at`, falling back to `last_active_at`). */
  updatedAt?: string;
  /** Working directory the session is bound to. */
  cwd: string;
  /** True if it's a git repo (inferred from `git_root_dir` in summary.json). */
  isGitRepo?: boolean;
  /** True if the session is pinned to the top of the list.
   *  OpenBuddy-only state (grok has no pinned field); stored in
   *  `~/.grok/openbuddy-state.json`. */
  pinned?: boolean;
  /** True if the session is archived (hidden from the sidebar).
   *  OpenBuddy-only state (grok has no archived field); stored in
   *  `~/.grok/openbuddy-state.json`. */
  archived?: boolean;
  /** Model id bound to this session, if recorded in summary.json. */
  currentModelId?: string;
}

/** Payload of the `grok://summary` event — a freshly generated or renamed
 *  session title pushed by grok via `x.ai/session_notification`
 *  (`SessionSummaryGenerated` variant). */
export interface SessionSummaryEvent {
  sessionId: string;
  title: string;
}

// ---------- skills (x.ai/skills/*) ----------

/** One discovered skill. Mirrors grok's `SkillInfo`. */
export interface SkillInfo {
  name: string;
  displayName?: string;
  description?: string;
  /** Where the skill was discovered: "local" | "repo" | "user" | "server" | "bundled" | "plugin". */
  scope?: string;
  enabled: boolean;
  userInvocable?: boolean;
  /** Filesystem path to the skill directory (when available). */
  path?: string;
}

// ---------- connectors / MCP (x.ai/mcp/*) ----------

/** One MCP server config entry surfaced to the UI. */
export interface McpServerEntry {
  name: string;
  /** "stdio" | "streamable_http". */
  transport?: string;
  /** For stdio: command. For http: URL. */
  target?: string;
  enabled: boolean;
  /** "user" | "project" | "bundled" | ... */
  source?: string;
  disabledReason?: string;
  vendor?: string;
}

/** Frontend payload for creating/updating an MCP server. */
export interface McpUpsertRequest {
  name: string;
  /** "stdio" or "http". */
  transport: string;
  /** stdio: command. http: URL. */
  target: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  enabled?: boolean;
}

// ---------- experts / assistants (~/.grok/agents/*.md) ----------

/** One agent definition (subagent template). */
export interface AgentEntry {
  name: string;
  description?: string;
  /** "user" | "project". */
  scope: string;
  /** Absolute path to the `.md` file. */
  path: string;
  /** Full file contents (frontmatter + body), for the editor view. */
  raw: string;
  /** Avatar preset index 1-20 (WorkBuddy-style). Undefined = name-initial fallback. */
  avatar?: number;
  /** Model capability tags: subset of ["default", "multimodal", "reasoning"]. */
  modelTags?: string[];
}

// ---------- permission rules (~/.grok/config.toml [permission]) ----------

/** One permission rule. `action` ∈ allow|deny|ask; `tool` ∈ bash|read|edit|grep|mcp|any. */
export interface PermissionRule {
  action: string;
  tool: string;
  pattern?: string;
}

// ---------- memory (资料库 — ~/.grok/memory/) ----------

export interface MemoryEntry {
  /** "global" | "workspace". */
  scope: string;
  /** Relative path (e.g. "MEMORY.md"). */
  path: string;
  content: string;
  size: number;
}

// ---------- session search ----------

export interface SearchHit {
  sessionId: string;
  cwd?: string;
  title?: string;
  snippet?: string;
  rank?: number;
  updatedAt?: string;
}

// ---------- rewind ----------

export interface RewindPoint {
  promptIndex: number;
  promptPreview?: string;
  timestamp?: string;
}

// ---------- slash commands + prompt history ----------

export interface SlashCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  source?: string;
}

// ---------- tasks / subagents ----------

export interface RunningTask {
  id: string;
  kind?: string;
  description?: string;
  status?: string;
  sessionId?: string;
}

// ---------- automations (local scheduler, WorkBuddy 1:1) ----------

export type ScheduleFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "HOURLY";

/** RRULE-like recurring schedule. 双周 = WEEKLY interval 2; 按间隔 = HOURLY + intervalHours. */
export interface AutomationSchedule {
  freq: ScheduleFreq;
  interval: number;
  /** Weekday codes "MO".."SU". */
  byday: string[];
  /** Days of month 1..=31 (MONTHLY/YEARLY). */
  bymonthday: number[];
  /** Months 1..=12 (YEARLY). */
  bymonth: number[];
  byhour: number;
  byminute: number;
  intervalHours: number;
}

export type AutomationScheduleType = "recurring" | "once";
export type AutomationPermissionMode = "fullAccess" | "default";
export type AutomationStatus = "ACTIVE" | "PAUSED";

// ---------- inspiration (灵感面板) ----------

/** Basic card returned by grok's inspiration generator. */
export interface InspirationCard {
  title: string;
  summary: string;
  takeaway: string;
}

/** Rich card used by the InspirationPanel UI (extends grok output). */
export interface InspirationRichCard {
  cardId: string;
  title: string;
  summary: string;
  detail?: string;
  category: string;
  cover?: string;
  prompt?: string;
  actions?: { label: string; type: string; payload: string }[];
  read?: boolean;
  saved?: boolean;
  createdAt?: string;
}

export interface InspirationStarted {
  sessionId: string;
  category: string;
  count: number;
}

// ---------- account (x.ai/auth/*) ----------

/** Full account profile from grok's `x.ai/auth/info`. */
export interface AccountInfo {
  methodId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  /** `grok-asset://` URL (Electron-only) or `http(s)://`. */
  profileImageUrl?: string;
  teamId?: string;
  teamName?: string;
  teamRole?: string;
  organizationId?: string;
  organizationName?: string;
  organizationRole?: string;
  principalType?: string;
  principalId?: string;
  userBlockedReason?: string;
  teamBlockedReasons?: string[];
  codingDataRetentionOptOut?: boolean;
}

export interface SubscriptionStatus {
  authenticated: boolean;
  meta?: unknown;
}

export interface LogoutResult {
  ok: boolean;
  wasLoggedIn?: boolean;
  email?: string;
  apiKeyStillSet?: boolean;
}

// ---------- agent / assistant defaults (~/.grok/config.toml) ----------

export interface AgentDefaults {
  /** Model id for new sessions (`[models] default`). Empty = grok's built-in. */
  defaultModel: string;
  /** Default permission selection (`[ui] default_selected_permission`). */
  defaultPermission: string;
  /** Show "Always allow" options on prompts (`[ui] remember_tool_approvals`). */
  rememberToolApprovals?: boolean;
}

// ---------- plugins + marketplace (x.ai/plugins/*, x.ai/marketplace/*) ----------

/** One installed plugin (subset of grok's PluginInfo). */
export interface PluginEntry {
  name: string;
  id?: string;
  root?: string;
  scope?: string;
  trusted?: boolean;
  enabled: boolean;
  version?: string;
  description?: string;
  skillCount?: number;
  skillNames?: string[];
  agentCount?: number;
  agentNames?: string[];
  hookStatus?: string;
  hookCount?: number;
  mcpServerCount?: number;
  mcpStatus?: string;
  marketplaceSource?: string;
  conflict?: unknown;
}

export interface PluginsListResponse {
  plugins: PluginEntry[];
}

/** One plugin from a marketplace source (with install status). */
export interface MarketplacePluginEntry {
  name: string;
  version?: string;
  description?: string;
  category?: string;
  author?: string;
  tags?: string[];
  homepage?: string;
  relativePath: string;
  skillCount: number;
  hasHooks: boolean;
  hasAgents: boolean;
  hasMcp: boolean;
  installStatus: string;
  installedVersion?: string;
  remoteUrl?: string;
  remoteRef?: string;
}

export interface MarketplaceScanResult {
  sourceName: string;
  sourceKind: string;
  sourceUrlOrPath: string;
  plugins: MarketplacePluginEntry[];
  error?: string;
}

export interface MarketplaceListResponse {
  sources: MarketplaceScanResult[];
}

// ---------- notification log (智能体邮箱 → 会话通知中心) ----------

export type NotificationKind =
  | "permission"
  | "folder_trust"
  | "task_update"
  | "plan_mode"
  | "mcp_status"
  | "models_update"
  | "summary"
  | "session_complete"
  | "error"
  | "info";

export interface NotificationEntry {
  id: number;
  kind: NotificationKind | string;
  at: string;
  title: string;
  body?: string;
  sessionId?: string;
  severity: "info" | "warn" | "error" | string;
  read: boolean;
}

export interface Automation {
  id: string;
  name: string;
  prompt: string;
  /** Comma-separated workspace directories (first entry is the run cwd). */
  cwds: string;
  status: AutomationStatus;
  modelId?: string;
  modelIsThinking?: boolean;
  skills: string[];
  expertId?: string;
  expertName?: string;
  connectorIds: string[];
  permissionMode: AutomationPermissionMode;
  scheduleType: AutomationScheduleType;
  schedule: AutomationSchedule;
  /** Once mode: YYYY-MM-DD. */
  scheduledDate?: string;
  /** Once mode: HH:MM. */
  scheduledTime?: string;
  /** Recurring validity window (YYYY-MM-DD, inclusive). */
  validFromDate?: string;
  validUntilDate?: string;
  pushToWeChat: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
}

/** A single run-history entry (运行记录). */
export interface AutomationRunRecord {
  id: string;
  automationId: string;
  automationName: string;
  status: "running" | "success" | "failed" | string;
  startedAt: string;
  finishedAt?: string;
  sessionId?: string;
  archived: boolean;
}

export interface AutomationSnapshot {
  automations: Automation[];
  records: AutomationRunRecord[];
}

// ---------- unified market catalogs (built-in static data) ----------

/** A browsable skill in the static 技能 marketplace (截图 3). The actual install
 *  path for openbuddy is local (import a SKILL.md / folder); these entries just
 *  reproduce the WorkBuddy catalog UI. */
export interface SkillCatalogItem {
  id: string;
  name: string;
  desc: string;
  /** Segment the card belongs to: 推荐 / SkillHub / 套件. */
  seg: "recommend" | "skillhub" | "plugin";
  /** Category id within the segment's filter row ("" = uncategorized). */
  cat: string;
  /** Shows in the 精选技能 row at the top. */
  featured?: boolean;
  /** Optional recommendation label on a featured card. */
  reason?: string;
  /** Brand color hint for the letter-avatar icon (e.g. "#1d6f42"). */
  color?: string;
}

/** A skill category chip label (截图 3 filter row). */
export interface SkillCategory {
  id: string;
  zh: string;
}

/** A browsable connector in the static 连接器 list (截图 4). These are MCP-type
 *  connectors; "+" opens the MCP 服务管理 modal rather than one-click install. */
export interface ConnectorCatalogItem {
  id: string;
  name: string;
  desc: string;
  /** Brand color hint for the letter-avatar icon. */
  color?: string;
}

/** Raw mcp.json file content returned by the `mcp_config_read` command. */
export interface McpConfigFile {
  filePath: string;
  content: string;
}

// ---------- expert marketplace (read live from a local data dir) ----------

/** One expert category (mirrors the Rust `ExpertCategory`). */
export interface ExpertCategory {
  id: string;
  zh: string;
  en: string;
}

/** One expert / team card (mirrors the Rust `ExpertItem`, camelCase). */
export interface ExpertItem {
  id: string;
  cat: string;
  name: string;
  nameEn?: string;
  /** Profession / 职称 — the bold card title. */
  title: string;
  titleEn?: string;
  desc: string;
  tags: string[];
  /** "agent" | "team". */
  type: "agent" | "team" | string;
  author?: string;
  /** operationalTag text — the 特邀专家 ribbon; absent when not set. */
  ribbon?: string;
  /** Default starter prompt (zh) — used to seed the summon persona. */
  init?: string;
  opc?: boolean;
  /** Pinned sort slot (displayPosition). */
  pos?: number;
  updated?: string;
  /** Absolute local avatar path — feed to `expertsThumbnail`. */
  avatarLocal?: string;
  /** COS fallback URL (used if the local file is missing). */
  avatarUrl?: string;
}

/** Catalog payload returned by `experts_load`. */
export interface ExpertCatalog {
  root: string;
  categories: ExpertCategory[];
  experts: ExpertItem[];
  /** 精选场景 parsed from `<root>/_meta/featuredScenes.json` (may be empty). */
  featuredScenes: CatalogFeaturedScene[];
}

/** A 精选场景 as returned by the backend (local banner resolved when present). */
export interface CatalogFeaturedScene {
  id: string;
  zh: string;
  expertIds: string[];
  /** Absolute local banner path — feed to `expertsImageBytes`. */
  imageLocal?: string;
  /** COS fallback URL. */
  imageUrl?: string;
}

/** A featured-scene banner as rendered (catalog scene or the gradient fallback
 *  authored in `featured-scenes.ts`). */
export interface FeaturedScene {
  id: string;
  zh: string;
  expertIds: string[];
  /** Absolute local banner path — feed to `expertsImageBytes`. */
  imageLocal?: string;
  /** Remote banner image (COS); when absent, the local gradient is used. */
  image?: string;
  /** Gradient endpoints for the offline fallback banner. */
  from?: string;
  to?: string;
}
