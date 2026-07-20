# Windows 构建踩坑笔记

> 以下为开发期记录,保留备查。其中涉及的补丁路径(`E:/Grok/grok-build/...`)是本机检出的 grok 源码位置,仅供参考。

## Toolchain
- Pinned to `stable-x86_64-pc-windows-msvc` (grok's `1.92.0-gnu` rust-std fails to install on this machine). grok crates compile cleanly under newer msvc stable. `rustup update stable` after install — the shipped stable can be months stale.

## MSVC C++ workload
- The `msvc` target needs MSVC `link.exe` + Windows SDK. Installing VS IDE alone is NOT enough — must add the "Desktop development with C++" workload (`Microsoft.VisualStudio.Workload.VCTools`). Symptom if missing: cargo link fails with `link: extra operand '...rcgu.o'` because Git Bash's `/usr/bin/link` (GNU coreutils) shadows the missing MSVC linker.

## protoc
- Required by grok's `xai-grok-tools-api` build script. grok's bundled `bin/protoc` is a DotSlash script with no Windows platform entry, so it can't run. Installed protoc 29.3 (matching grok's dotslash-pinned version) to `C:\Tools\protoc`; `PROTOC` is set via `src-tauri/.cargo/config.toml`.

## Network mirrors (when github.com / crates.io are unreachable)
- crates.io via rsproxy in `~/.cargo/config.toml`; github git clones via ghproxy.net configured in `~/.gitconfig` (`url.<mirror>.insteadOf`). grok has exactly one github git dep (`helix-editor/nucleo`).

## `xai-proto-build` Windows patch
- grok's `emit_rerun_if_changed` hard-codes `/dev/stdout`, which doesn't exist on Windows. Patched `E:/Grok/grok-build/crates/build/xai-proto-build/src/lib.rs` to use a temp file.

## `process-wrap` version
- Pinned to 9.0.0 (matches grok's lock) — 9.1.0 pulls `windows` 0.62 which conflicts with grok's 0.61 and breaks `PROCESS_CREATION_FLAGS` type unification.

## MSRV bumps
- `kstring` downgraded to 2.0.2 (2.0.4 needs rustc 1.96).

## grok-source patches
- Both grok-source patches (`xai-proto-build`, and the `streaming_local_terminal` windows-version unification) live in `E:/Grok/grok-build` and are required for the Windows build.
