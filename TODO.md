# OpenBuddy 后续待办

> 换电脑后继续的路线图。当前状态（截至上次会话）：**代码全部写完，`cargo check` 零错误，前端 `tsc` + `vite build` 通过**。唯一没跑通的是完整 `cargo build`（受旧机器 D 盘 19G 空间限制，grok 全树 debug 产物需 ~20G）。换到空间充裕的机器后从第 1 项开始。

---

## 0. 环境准备（新机器一次性）

> 换机实测踩过的坑全记录（2026-07 换机器时验证）。原版只写了 rustup/pnpm/protoc，实际还缺 MSVC 工具链和网络镜像，下面按顺序来。

### 0a. Rust 工具链

```bash
# stable msvc。注意：rustup 装好后默认会停在某个旧版本，必须 update
rustup default stable-x86_64-pc-windows-msvc
rustup update stable           # ← 关键，否则可能停在 1.79 满足不了 rust-version=1.92
rustc --version                # 确认 ≥ 1.92
```

### 0b. MSVC C++ 工具链（链接器 link.exe + Windows SDK）⚠️ 最容易漏

cargo 的 `x86_64-pc-windows-msvc` 目标**必须有 MSVC link.exe**。只装 VS IDE 不够 ——
必须勾选「使用 C++ 的桌面开发」工作负载。症状：cargo 编译到链接阶段报
`link: extra operand '...rcgu.o'` / `Try 'link --help'`，这是 Git Bash 的
`/usr/bin/link`（GNU coreutils）冒充了 MSVC link。

```bash
# 用 winget 装 BuildTools + C++ 工作负载（约 3-6GB 下载）
winget install --id Microsoft.VisualStudio.2022.BuildTools --silent \
  --accept-package-agreements --accept-source-agreements \
  --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

装完验证：在「x64 Native Tools Command Prompt for VS 2022」里 `where link.exe`
应指向 `...\VC\Tools\MSVC\<ver>\bin\Hostx64\x64\link.exe`，而不是 Git Bash 的。

### 0c. Node + pnpm

```bash
# Node 20+，然后：
npm i -g pnpm
```

### 0d. protoc（grok 的 build script 需要）

grok 自带的 `bin/protoc` 是 DotSlash 脚本，**没有 windows 平台条目**，Windows 跑不了。
官方发布在 GitHub，若机器连不上 GitHub 见 0e 的镜像方案。

```bash
# 方案 1：GitHub 可达时
winget install --id Google.Protobuf --accept-package-agreements --accept-source-agreements

# 方案 2：GitHub 不可达时，走 ghproxy 镜像下 protoc 29.3（与 grok dotslash 锁定版本一致）
# 下载：https://ghproxy.net/https://github.com/protocolbuffers/protobuf/releases/download/v29.3/protoc-29.3-win64.zip
# 解压到 C:\Tools\protoc\
```

PROTOC 环境变量在 `src-tauri/.cargo/config.toml` 的 `[env]` 段设好，当前指向：
`C:\Tools\protoc\bin\protoc.exe`（若装到别处改这里）。

### 0e. 网络镜像（若 github.com / crates.io 连不上）⚠️ 国内机器常需

这台机器直连 github.com 和 crates.io 都超时。两套镜像分开配：

**crates.io** → 在 `~/.cargo/config.toml` 配 rsproxy（字节维护）：
```toml
[source.crates-io]
replace-with = "rsproxy-sparse"
[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"
[net]
git-fetch-with-cli = true
```

**github.com git 克隆** → 在 `~/.gitconfig` 配 insteadOf（注意：cargo 的 `[url]`
表在 `git-fetch-with-cli=true` 时不生效，必须配系统 git）：
```bash
git config --global url."https://ghproxy.net/https://github.com/".insteadOf "https://github.com/"
```
grok 全树只有一个 github git 依赖（`helix-editor/nucleo`），其余全在 crates.io。

### 0f. grok 登录

```bash
grok login       # 复用 ~/.grok/auth.json
```

**grok 源码 patch**（grok-build 现在是项目内 `vendor/grok-build` submodule）：
1. `crates/build/xai-proto-build/src/lib.rs` —— `/dev/stdout` → temp file（Windows 兼容）。patch 已沉淀到主仓 `patches/grok-build/01-windows-protoc.patch`，按需 apply（pin 的 `98c3b24` 实测若不需要可跳过）。
2. `streaming_local_terminal.rs` —— 已废弃，改用降 `process-wrap` 到 9.0.0 统一 windows 版本解决。

同样把 OpenBuddy 项目提交：
```bash
cd E:\Grok\openbuddy
git init && git add -A && git commit -m "OpenBuddy initial: Tauri + grok in-process + WorkBuddy UI"
```

---

## 1. 跑通完整构建 ⭐（最高优先）

```bash
cd E:\Grok\openbuddy
pnpm install
pnpm tauri dev
```

首次编译 grok 全树约 10 分钟（产物 ~20G，确保盘有 ≥25G 空闲）。

**预期结果**：弹出 OpenBuddy 窗口，显示 WorkBuddy 风格首页（mascot + 标题 + 输入框）。

**如果磁盘还是不够**，加这个到 `src-tauri/Cargo.toml` 把依赖的调试符号也关掉（只保留自己代码的）：
```toml
[profile.dev.package."*"]
debug = false
```

---

## 2. 端到端验证 + 修运行时 bug

构建跑通后，测一轮完整对话，重点验证：

- [ ] 首页输入框发消息 → 触发 `grok_new_session` + `grok_send`
- [ ] 流式 token 正常累积显示（`grok://update` event → `session-store.applyUpdate`）
- [ ] grok 回复结束 → `grok://complete` event → 消息标 complete
- [ ] 工具调用卡片渲染（让 grok 读文件/搜索，看 `tool_call` update 是否正确显示）
- [ ] 权限弹窗（让 grok 编辑文件，确认 `session/request_permission` 弹窗 + Allow/Deny 回应）
- [ ] 停止按钮（`grok_cancel` —— 已实现，发送 `AcpAgentMessage::Cancel`）

**已知可能出问题的点**（运行时才暴露，cargo check 查不出来）：

### 2a. `serialize_session_update` 序列化
`src-tauri/src/bridge.rs:228` 用 `serde_json::to_value(&acp::SessionUpdate)`。如果 `SessionUpdate` 没 derive `Serialize` 或字段名不匹配前端 TS 类型，前端 `applyUpdate` 会拿到错误结构。
**验证方法**：在 `bridge.rs` 的 `SessionNotification` 分支加 `tracing::info!("update: {update:?}")`，对比前端收到的 payload。

### 2b. `grok_init` 阻塞
`src-tauri/src/commands.rs:63` 的 `grok_init` 是 async command，但里面调 `spawn_grok()`（含 bootstrap 的同步 I/O）会阻塞 tokio runtime，导致 UI 卡顿几秒。
**修法**：把 `spawn_grok` 包进 `tokio::task::spawn_blocking`：
```rust
let grok::GrokHandle { tx, rx, cancel } =
    tokio::task::spawn_blocking(move || grok::spawn_grok(cwd.clone()))
    .await
    .map_err(|e| format!("spawn task: {e}"))??;
```

### 2c. agent 线程 panic 后无重连
`grok.rs` 的 agent 线程若 panic，`JoinHandle` 不会被检测，前端永远卡在 "streaming"。
**修法**：在 `spawn_grok` 里 spawn 一个监控任务，检测线程退出后通过 event 通知前端 `grok://agent-died`，前端提供"重启 agent"按钮。

---

## 3. 历史会话恢复（Phase 6 核心）

当前 `src/App.tsx` 的 `handleSelectSession` 只切了 sessionId，没真正加载历史：
```ts
const handleSelectSession = (sessionId: string) => {
  sessionsStore.getState().setCurrent(sessionId);
  sessionStore.getState().setSession(sessionId);
  // TODO Phase 6: grokLoadSession to replay history into the store.
};
```

要做：
- [ ] 调 `grokLoadSession(sessionId, cwd)`（后端已实现 `grok_load_session` command）
- [ ] grok 会回放 `session/update` 通知（历史消息），让它们正常流经 `applyUpdate` 重建 transcript
- [ ] 区分"历史回放"和"实时流式"——回放时不应显示流式光标、不应让 UI 滚动跳跃。在 `session-store` 加一个 `replaying: boolean` 标志，`applyUpdate` 在 replaying 时批量累积、回放结束后一次性渲染。

后端 `grok.rs:load_session` 已调 `acp::LoadSessionRequest`，grok 会自动回放 `updates.jsonl`。

---

## 4. 会话列表的 cwd 选择

当前 `grok_init` 默认用 `dirs::home_dir()` 作为 cwd（`commands.rs:default_cwd`）。所有会话都绑在用户家目录。

要做：
- [ ] 顶栏或设置里加一个"切换工作目录"按钮，调 `tauri-plugin-dialog` 的 `open({ directory: true })` 选目录
- [ ] 选完后重新 `grok_init`（需要先支持 init 多次 / 重建 agent），或改成每个 cwd 一个 agent 实例
- [ ] `sessions.rs:list_sessions` 已按 cwd 过滤，切 cwd 后刷新侧栏

---

## 5. ToolCallCard 完善

`src/components/ToolCallCard.tsx` 现在按 `content[].type` 渲染（text/diff/command_output）。但 grok 的实际工具调用结构需要对照真实数据完善：

- [ ] 跑一轮对话让 grok 用各种工具（read_file/edit/grep/run_terminal_command/web_search），抓 `grok://update` 的实际 payload
- [ ] 对照 `src/lib/types.ts` 的 `ToolCallContent` 类型，补全缺失的 content 类型
- [ ] diff 视图当前是朴素的逐行对比（`ToolCallCard.tsx:DiffView`），换成真正的 unified diff（用 `diff` npm 包或 `react-diff-viewer`）
- [ ] 工具的 `rawInput`（grok 传的工具参数）目前没显示——`bridge.rs` 的 `PermissionFrontend.raw_input` 是 `None`，因为 `RequestPermissionRequest` 的 `update` 子字段没解析。要显示工具参数需从 `update.toolCallId`/`update.title` 提取

---

## 6. 体验打磨

- [ ] **暗色主题**：tokens.css 的 `[data-theme="dark"]` 已就位，`ThemeProvider.tsx` 已实现切换。跑起来验证 WorkBuddy 的 teal 品牌色在暗色下正确
- [ ] **markdown 渲染**：`Markdown.tsx` 用 react-markdown + remark-gfm + syntax-highlighter。验证代码块高亮、表格、任务列表
- [ ] **sidebar 折叠**：当前固定 260px，加折叠按钮（WorkBuddy 是 260px ↔ 56px）
- [ ] **会话重命名/删除**：侧栏右键菜单，调 grok 的 session 管理（需研究 grok 的 session 文件操作 API）
- [ ] **pinned 会话**：WorkBuddy 有置顶区，当前 `sessions-store` 没实现
- [ ] **未转换的图标**：`src/foundation/components/Icon/icons/` 有 21 个 stub（`export const X: any = () => null`），主要是 WbFile*（文件类型图标）和 Plan*（状态图标）。用到时手工实现或从 lucide-react 找替代。运行 `node scripts/convert-icons.mjs` 可重新尝试批量转换

---

## 7. 打包发布

```bash
pnpm tauri build
```
产出在 `src-tauri/target/release/bundle/`（`.msi` / `.exe` installer）。

注意：
- release build 会触发 grok 的 `build.rs` **下载并 bundle ripgrep**（grok 的搜索工具）。需联网。要跳过可设环境变量 `GROK_SHELL_BUNDLE_RG_PATH` 指向已装的 rg
- `tauri.conf.json` 的 `bundle.icon` 已配好（从 WorkBuddy logo 生成的 `src-tauri/icons/`）
- appId 是 `com.openbuddy.desktop`，可改

---

## 项目结构速查

```
E:\Grok\openbuddy\
├── src/                      前端（React，tsc 通过）
│   ├── App.tsx               主 shell，grok 生命周期 + 事件接线
│   ├── components/           10 个 UI 组件
│   ├── stores/               Zustand: session/sessions/permission
│   ├── lib/                  grok-client.ts(Tauri 桥) + types.ts(ACP TS 镜像)
│   ├── styles/               tokens.css(WorkBuddy) + global.css + app.css
│   └── foundation/Icon/      188 个图标(174 可用 + 14 stub)
├── src-tauri/                后端（Rust，cargo check 通过）
│   ├── src/
│   │   ├── lib.rs            Tauri 入口 + command 注册
│   │   ├── grok.rs           spawn_grok + ACP 生命周期(initialize/auth/new_session/prompt/cancel)
│   │   ├── bridge.rs         ACP→Tauri event dispatcher + 权限注册表
│   │   ├── commands.rs       #[tauri::command] 表
│   │   └── sessions.rs       读 ~/.grok/sessions 列表
│   ├── Cargo.toml            含 grok path 依赖 + 独立 workspace
│   ├── tauri.conf.json       OpenBuddy 配置
│   └── .cargo/config.toml    PROTOC 环境变量
├── scripts/convert-icons.mjs 图标批量转换脚本
└── README.md / TODO.md       本文件
```

## 关键文件快速定位

| 想改什么 | 看哪里 |
|---|---|
| Tauri command 增减 | `src-tauri/src/commands.rs` + `lib.rs` 的 `generate_handler!` |
| ACP 消息处理 | `src-tauri/src/bridge.rs` 的 `handle_client_message` |
| agent 生命周期 | `src-tauri/src/grok.rs` |
| 前端发消息/收事件 | `src/lib/grok-client.ts` |
| 消息流式累积逻辑 | `src/stores/session-store.ts` 的 `applyUpdate` |
| ACP 的 TS 类型 | `src/lib/types.ts` |
| 主题/颜色 | `src/styles/tokens.css`（来自 WorkBuddy）|
| 整体布局尺寸 | `src/styles/app.css` |

## 参考的 grok 源码位置（在 `vendor/grok-build` submodule 里）

| 用途 | 路径 |
|---|---|
| agent in-process spawn 的参考实现 | `vendor/grok-build/crates/codegen/xai-grok-pager/src/acp/spawn.rs` |
| ACP 客户端消息处理参考 | `vendor/grok-build/crates/codegen/xai-grok-pager/src/headless.rs:1516` |
| ACP 方法名/消息类型 | `vendor/grok-build/crates/codegen/xai-acp-lib/src/message.rs` |
| MvpAgent 的 acp::Agent 实现 | `vendor/grok-build/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs` |
| 会话存储格式 | `vendor/grok-build/crates/codegen/xai-grok-pager/docs/user-guide/17-sessions.md` |
| ACP 协议文档 | `vendor/grok-build/crates/codegen/xai-grok-pager/docs/user-guide/15-agent-mode.md` |
