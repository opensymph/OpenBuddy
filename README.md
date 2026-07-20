# OpenBuddy

[English](#english) | [中文](#中文)

---

## English

A WorkBuddy-style desktop client for the [grok](https://github.com/xai-org/grok-build) AI agent, built on **Tauri 2 + React 18 + Vite**. The grok agent runs **in-process** (embedded as Rust libraries) and is driven over the Agent Client Protocol (ACP) — no subprocess, no WebSocket relay.

> **Name reuse:** `OpenBuddy` shares WorkBuddy's `--wb-*` design tokens, its 190-icon foundation library, and its brand assets, so the UI looks pixel-close to WorkBuddy while talking to grok underneath.

### Highlights

- **grok as a library, in-process** — `xai-grok-shell` + `xai-acp-lib` are path dependencies; the agent runs on a dedicated OS thread driven by a current-thread tokio runtime + `LocalSet`.
- **ACP is the front/back contract** — streaming `SessionUpdate`s, tool calls, plan updates and permission requests all flow over typed mpsc channels, serialized to `grok://update` / `grok://permission` / `grok://complete` Tauri events.
- **WorkBuddy-grade UI** — ported design tokens, 190-icon foundation set, and brand assets for a pixel-close visual experience.
- **BYOK providers** — bring your own keys for multiple model providers via `~/.grok/config.toml`.
- **Extensible agent surface** — Skills (`x.ai/skills/*`), MCP connectors (`x.ai/mcp/*`), and Experts/Assistants (`~/.grok/agents/*.md`).
- **Advanced workflows** — Plan mode, Rewind, sub-agent Tasks, Slash Commands, local Automations scheduler, and a notification center.
- **Cross-platform installers** — Windows (NSIS / MSI) and macOS (DMG).

<!-- TODO: add screenshots here once available -->

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Tauri window (webview)                                   │
│  React UI (Topbar / Sidebar / ChatView / Composer / ...)  │
│    └── Zustand stores  ←── Tauri events ──┐               │
└───────────────────────────────────────────┼──────────────┘
                                            │ invoke() / events
┌───────────────────────────────────────────┼──────────────┐
│  Tauri Rust backend (src-tauri/src)       │              │
│   commands.rs  ← Tauri commands ──────────┘              │
│   grok.rs      ← spawn_grok() + ACP lifecycle            │
│   bridge.rs    ← ACP → Tauri event dispatcher            │
│   sessions.rs  ← ~/.grok/sessions history listing        │
└───────────────────────┬──────────────────────────────────┘
                        │ typed ACP mpsc channels
┌───────────────────────┴──────────────────────────────────┐
│  grok agent thread (MvpAgent, !Send, LocalSet)            │
│  xai-grok-shell + xai-acp-lib (path deps into grok-build) │
└──────────────────────────────────────────────────────────┘
```

### Prerequisites

1. **Rust** (stable, ~1.95+). A `rust-toolchain.toml` pins the msvc host on Windows.
2. **Node 20+** and **pnpm**.
3. **grok** installed and logged in (`grok login` once). The app reuses `~/.grok/auth.json`.
4. **protoc** on `PATH` **and** the `PROTOC` env var pointing at it (grok's `xai-grok-tools-api` build script needs it; its bundled `bin/protoc` is a DotSlash script that doesn't run on Windows). On Windows: `choco install protoc`, then set `PROTOC=C:\ProgramData\chocolatey\bin\protoc.exe`.

### Develop

```bash
git clone --recurse-submodules <repo>
# if you forgot --recurse-submodules:
bash scripts/setup.sh        # macOS / Linux
powershell -File scripts/setup.ps1   # Windows

pnpm install
pnpm tauri dev
```

The first build compiles the full grok dependency tree (rusqlite/git2 bundled C, prost/protobuf, axum, reqwest, …) — expect 5–10 minutes. Incremental builds are fast thereafter.

### Build installers

```bash
pnpm dist:win    # Windows: NSIS .exe + MSI (requires MSVC link.exe + Windows SDK)
pnpm dist:mac    # macOS: .dmg (built for the host arch; unsigned / unnotarized)
```

grok-build is vendored as a git submodule at `vendor/grok-build` (pinned to a verified revision). The setup scripts above initialize it; `pnpm dist:*` verifies it's present before building.

### Project layout

```
src/                     # React frontend
  styles/                # tokens.css / global.css / app.css
  foundation/components/Icon/   # ported from WorkBuddy (190 icons)
  lib/                   # grok-client.ts (Tauri command wrappers) + types.ts (ACP TS mirror)
  stores/                # Zustand: session / sessions / permission / ...
  components/            # Topbar, Sidebar, HomePage, ChatView, Composer, ...

src-tauri/               # Rust backend
  src/
    lib.rs               # Tauri entry + state + command registration
    grok.rs              # spawn_grok() + authenticate/new_session/prompt/cancel
    bridge.rs            # ACP→Tauri event dispatcher + permission registry
    commands.rs          # #[tauri::command] table (grok_*)
    sessions.rs          # list ~/.grok/sessions for the sidebar

scripts/                 # build.ps1 (Windows) / build.sh (macOS)
docs/                    # WINDOWS_BUILD_NOTES.md — Windows build gotchas
```

### Status

Early preview. Phase 6 (history replay, cancel notification, end-to-end polish) is in progress.

### Troubleshooting

For Windows build issues (MSVC workload, protoc, network mirrors, grok-source patches), see [docs/WINDOWS_BUILD_NOTES.md](docs/WINDOWS_BUILD_NOTES.md).

### License

MIT (LICENSE file to be added).

---

## 中文

[grok](https://github.com/xai-org/grok-build) AI agent 的桌面客户端,WorkBuddy 风格,基于 **Tauri 2 + React 18 + Vite** 构建。grok agent 以**进程内 Rust 库**形式嵌入,通过 Agent Client Protocol (ACP) 驱动 —— 无子进程、无 WebSocket 中转。

> **名称复用:** `OpenBuddy` 沿用了 WorkBuddy 的 `--wb-*` 设计令牌、190 图标基础库和品牌资源,因此 UI 与 WorkBuddy 几乎像素级一致,底层却对接的是 grok。

### 主要特性

- **grok 作为进程内库运行** —— `xai-grok-shell` + `xai-acp-lib` 以路径依赖引入;agent 跑在独立 OS 线程上,由 current-thread tokio runtime + `LocalSet` 驱动。
- **ACP 作为前后端契约** —— 流式 `SessionUpdate`、工具调用、Plan 更新、权限请求全部走类型化 mpsc 通道,序列化为 `grok://update` / `grok://permission` / `grok://complete` Tauri 事件。
- **WorkBuddy 级 UI** —— 移植了设计令牌、190 图标基础集和品牌资源,视觉体验像素级对齐。
- **自带 Key 多 Provider(BYOK)** —— 通过 `~/.grok/config.toml` 接入多家模型供应商。
- **可扩展的 Agent 面** —— Skills(`x.ai/skills/*`)、MCP 连接器(`x.ai/mcp/*`)、Experts/Assistants(`~/.grok/agents/*.md`)。
- **进阶工作流** —— Plan 模式、Rewind 回溯、子智能体 Tasks、Slash Commands、本地 Automations 调度器、通知中心。
- **跨平台安装包** —— Windows(NSIS / MSI)与 macOS(DMG)。

<!-- TODO: 截图位置,有素材后补上 -->

### 架构

```
┌──────────────────────────────────────────────────────────┐
│  Tauri 窗口 (webview)                                     │
│  React UI (Topbar / Sidebar / ChatView / Composer / ...)  │
│    └── Zustand stores  ←── Tauri 事件 ──┐                 │
└───────────────────────────────────────────┼──────────────┘
                                            │ invoke() / 事件
┌───────────────────────────────────────────┼──────────────┐
│  Tauri Rust 后端 (src-tauri/src)          │              │
│   commands.rs  ← Tauri 命令 ──────────────┘              │
│   grok.rs      ← spawn_grok() + ACP 生命周期             │
│   bridge.rs    ← ACP → Tauri 事件分发器                  │
│   sessions.rs  ← ~/.grok/sessions 历史列表               │
└───────────────────────┬──────────────────────────────────┘
                        │ 类型化 ACP mpsc 通道
┌───────────────────────┴──────────────────────────────────┐
│  grok agent 线程 (MvpAgent, !Send, LocalSet)              │
│  xai-grok-shell + xai-acp-lib (指向 grok-build 的路径依赖)│
└──────────────────────────────────────────────────────────┘
```

### 前置要求

1. **Rust**(stable,约 1.95+)。`rust-toolchain.toml` 在 Windows 上固定 msvc 主机。
2. **Node 20+** 与 **pnpm**。
3. 已安装并登录 **grok**(执行一次 `grok login`)。应用复用 `~/.grok/auth.json`。
4. **protoc** 在 `PATH` 中**且** `PROTOC` 环境变量指向它(grok 的 `xai-grok-tools-api` 构建脚本需要;它自带的 `bin/protoc` 是 DotSlash 脚本,在 Windows 上跑不起来)。Windows 上可:`choco install protoc`,然后设 `PROTOC=C:\ProgramData\chocolatey\bin\protoc.exe`。

### 本地开发

```bash
git clone --recurse-submodules <repo>
# 若忘了 --recurse-submodules:
bash scripts/setup.sh        # macOS / Linux
powershell -File scripts/setup.ps1   # Windows

pnpm install
pnpm tauri dev
```

首次构建会编译整个 grok 依赖树(rusqlite/git2 内联 C、prost/protobuf、axum、reqwest ……),预计 5–10 分钟。之后的增量编译很快。

### 构建安装包

```bash
pnpm dist:win    # Windows:NSIS .exe + MSI(需 MSVC link.exe + Windows SDK)
pnpm dist:mac    # macOS:.dmg(按宿主架构构建;未签名 / 未公证)
```

grok-build 作为 git submodule 内置于 `vendor/grok-build`(pin 在已验证的 revision)。上面的 setup 脚本负责初始化它;`pnpm dist:*` 在构建前会校验其存在。

### 项目结构

```
src/                     # React 前端
  styles/                # tokens.css / global.css / app.css
  foundation/components/Icon/   # 从 WorkBuddy 移植(190 图标)
  lib/                   # grok-client.ts(Tauri 命令封装)+ types.ts(ACP TS 镜像)
  stores/                # Zustand:session / sessions / permission / ...
  components/            # Topbar, Sidebar, HomePage, ChatView, Composer, ...

src-tauri/               # Rust 后端
  src/
    lib.rs               # Tauri 入口 + 状态 + 命令注册
    grok.rs              # spawn_grok() + authenticate/new_session/prompt/cancel
    bridge.rs            # ACP→Tauri 事件分发器 + 权限注册表
    commands.rs          # #[tauri::command] 表(grok_*)
    sessions.rs          # 列出 ~/.grok/sessions 供侧边栏使用

scripts/                 # build.ps1(Windows)/ build.sh(macOS)
docs/                    # WINDOWS_BUILD_NOTES.md —— Windows 构建踩坑笔记
```

### 状态

早期预览版。Phase 6(历史回放、取消通知、端到端打磨)进行中。

### 故障排查

Windows 构建相关问题(MSVC 工作负载、protoc、网络镜像、grok 源码补丁)见 [docs/WINDOWS_BUILD_NOTES.md](docs/WINDOWS_BUILD_NOTES.md)。

### 协议

MIT(LICENSE 文件待补)。
