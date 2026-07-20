# OpenBuddy

A WorkBuddy-style desktop shell for the [grok](https://github.com/xai-org/grok-build) agent, built on **Tauri 2 + React 18 + Vite**. The grok agent runs **in-process** (embedded as Rust libraries) and is driven over the Agent Client Protocol (ACP) — no subprocess, no WebSocket relay.

> Name reuse: `OpenBuddy` shares WorkBuddy's `--wb-*` design tokens, its 190-icon foundation library, and its brand assets, so the UI looks pixel-close to WorkBuddy/GenFlow while talking to grok underneath.

## Architecture

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

Key decisions:
- **grok as a library, in-process.** `xai-grok-shell` and `xai-acp-lib` are path dependencies. The `MvpAgent` runs on a dedicated OS thread (it's `!Send`) driven by a current-thread tokio runtime + `LocalSet`. Communication is purely through `acp_channels()` typed mpsc.
- **No fs/terminal capability advertised.** The agent uses its own built-in tools (read_file, run_terminal_command, …) and never round-trips those requests back to the host. We only handle `session/update` (streaming + tool calls) and `session/request_permission`.
- **ACP is the front/back contract.** Rust serializes `SessionUpdate`s to JSON and emits them as `grok://update` / `grok://permission` / `grok://complete` events; the frontend calls `grok_*` Tauri commands.

## Prerequisites

1. **Rust** (stable, ~1.95+). A `rust-toolchain.toml` pins the msvc host on Windows.
2. **Node 20+** and **pnpm**.
3. **grok** installed and logged in (`grok login` once). The app reuses `~/.grok/auth.json`.
4. **protoc** on `PATH` **and** the `PROTOC` env var pointing at it (grok's `xai-grok-tools-api` build script needs it; its bundled `bin/protoc` is a DotSlash script that doesn't run on Windows). On Windows: `choco install protoc`, then set `PROTOC=C:\ProgramData\chocolatey\bin\protoc.exe`.

## Develop

```bash
pnpm install
pnpm tauri dev
```

The first build compiles the full grok dependency tree (rusqlite/git2 bundled C, prost/protobuf, axum, reqwest, …) — expect 5–10 minutes. Incremental builds are fast thereafter.

## Project layout

```
src/                     # React frontend
  styles/
    tokens.css           # ported from workbuddy cb-bridge-BQMqrgRE.css (lines 1-633)
    global.css           # body/reset/scrollbar + token aliases
    app.css              # app component styles
  foundation/components/Icon/   # ported from WorkBuddy (190 icons; a few stubbed)
  lib/
    grok-client.ts       # Tauri command wrappers + event subscription
    types.ts             # ACP TS mirror (SessionUpdate, ToolCall, Permission, ...)
  stores/                # Zustand: session / sessions / permission
  components/            # Topbar, Sidebar, HomePage, ChatView, Composer, ...

src-tauri/               # Rust backend
  src/
    lib.rs               # Tauri entry + state + command registration
    grok.rs              # spawn_grok() + initialize/authenticate/new_session/prompt/cancel
    bridge.rs            # ACP→Tauri event dispatcher + permission registry
    commands.rs          # #[tauri::command] table (grok_*)
    sessions.rs          # list ~/.grok/sessions for the sidebar

scripts/convert-icons.mjs   # batch-converts WorkBuddy's decompiled icons to clean TSX
```

## Status

| Phase | Status |
|---|---|
| 1 — Tauri + React scaffold | ✅ cargo check through |
| 2 — grok in-process Rust bridge | ✅ **cargo check zero errors** — full grok dependency tree + bridge/commands/grok compile |
| 3 — WorkBuddy design assets ported | ✅ tsc through (tokens, global, 174/195 icons, brand assets) |
| 4 — ACP types + Zustand stores + event wiring | ✅ tsc through |
| 5 — UI components (Topbar/Sidebar/Home/Chat/Composer/Message/ToolCall/Permission) | ✅ tsc through |
| 6 — history replay (`grok_load_session`) + cancel notification + end-to-end polish | pending |

### Windows build notes (gotchas hit during development)
- **Toolchain**: pinned to `stable-x86_64-pc-windows-msvc` (grok's `1.92.0-gnu` rust-std fails to install on this machine). grok crates compile cleanly under newer msvc stable. `rustup update stable` after install — the shipped stable can be months stale.
- **MSVC C++ workload**: the `msvc` target needs MSVC `link.exe` + Windows SDK. Installing VS IDE alone is NOT enough — must add the "Desktop development with C++" workload (`Microsoft.VisualStudio.Workload.VCTools`). Symptom if missing: cargo link fails with `link: extra operand '...rcgu.o'` because Git Bash's `/usr/bin/link` (GNU coreutils) shadows the missing MSVC linker.
- **protoc**: required by grok's `xai-grok-tools-api` build script. grok's bundled `bin/protoc` is a DotSlash script with no Windows platform entry, so it can't run. Installed protoc 29.3 (matching grok's dotslash-pinned version) to `C:\Tools\protoc`; `PROTOC` is set via `src-tauri/.cargo/config.toml`.
- **Network mirrors** (when github.com / crates.io are unreachable): crates.io via rsproxy in `~/.cargo/config.toml`; github git clones via ghproxy.net configured in `~/.gitconfig` (`url.<mirror>.insteadOf`). grok has exactly one github git dep (`helix-editor/nucleo`).
- **`xai-proto-build` Windows patch**: grok's `emit_rerun_if_changed` hard-codes `/dev/stdout`, which doesn't exist on Windows. Patched `E:/Grok/grok-build/crates/build/xai-proto-build/src/lib.rs` to use a temp file.
- **`process-wrap` version**: pinned to 9.0.0 (matches grok's lock) — 9.1.0 pulls `windows` 0.62 which conflicts with grok's 0.61 and breaks `PROCESS_CREATION_FLAGS` type unification.
- **MSRV bumps**: `kstring` downgraded to 2.0.2 (2.0.4 needs rustc 1.96).

Both grok-source patches (`xai-proto-build`, and the `streaming_local_terminal` windows-version unification) live in `E:/Grok/grok-build` and are required for the Windows build.
