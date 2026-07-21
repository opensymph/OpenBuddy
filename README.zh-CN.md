<p align="center">
  <img src="app-icon.png" width="140" height="140" alt="OpenBuddy" />
</p>

<h1 align="center">OpenBuddy</h1>

<p align="center">
  <strong>用 Rust 完美复刻的开源版腾讯 WorkBuddy</strong><br/>
  开源 · 跨平台 · 进程内 grok · 自带 Key 多 Provider
</p>

<p align="center">
  <a href="README.md">English</a>
  &nbsp;·&nbsp;
  <a href="#为什么是-openbuddy">为什么</a> ·
  <a href="#-主要特性">特性</a> ·
  <a href="#-openbuddy-vs-workbuddy">对比</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-架构">架构</a> ·
  <a href="#-路线图">路线图</a>
</p>

<p align="center">
  <a href="https://github.com/opensymph/OpenBuddy/releases"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/opensymph/OpenBuddy?style=flat-square&logo=github&color=blue"></a>
  <a href="https://github.com/opensymph/OpenBuddy/actions"><img alt="Build" src="https://img.shields.io/github/actions/workflow/status/opensymph/OpenBuddy/release.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white"></a>
  <a href="https://github.com/opensymph/OpenBuddy/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/opensymph/OpenBuddy?style=flat-square&logo=starship&logoColor=white&color=yellow"></a>
  <a href="https://github.com/opensymph/OpenBuddy/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/opensymph/OpenBuddy?style=flat-square&logo=forgejo&logoColor=white&color=orange"></a>
  <br/>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue?style=flat-square&logo=windows10&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-orange?style=flat-square&logo=rust&logoColor=white">
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-red?style=flat-square&logo=tauri&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=white">
</p>

---

## 为什么是 OpenBuddy?

[**腾讯 WorkBuddy**](https://workbuddy.tencent.com/) 告诉了所有人:一个优秀的桌面 AI Agent 工作台应该长什么样——精致的 UI、Plan 模式、Skills、MCP 连接器。它确实是个能打的产品。但它**闭源,数据链路走的是腾讯后端。**

**OpenBuddy 是开源的答案** —— 同样形态的体验,用 Rust + Tauri 重写:

- 🔓 **完全开源 (MIT)** —— 没有黑箱遥测,没有供应商锁定。
- 🦀 **基于 Rust + Tauri 构建** —— 二进制小、冷启动快、真·跨平台。
- 🪶 **安装包小约 14 倍** —— OpenBuddy 的 Windows 安装包 **~34 MB**,而 WorkBuddy 约 **483 MB**。同样形态的产品,体积只有对方的零头。
- 💨 **运行内存小约 19 倍** —— **~20 MB** vs WorkBuddy 同机 **~374 MB**。把内存还给真正在干的活。
- ⚙️ **grok 作为进程内库运行** —— 无子进程、无 WebSocket 中转。Agent 跑在你双击的那个二进制文件内的独立 OS 线程上。
- 🌐 **原生跨平台** —— 一套代码,Windows **和** macOS。
- 🔑 **自带 Key (BYOK)** —— 通过 `~/.grok/config.toml` 接入任意模型供应商,纯文本存储,可 diff、可纳入版本管理。

> *"WorkBuddy 是成品,OpenBuddy 是你能读懂、能 fork、真正拥有的那一个。"*

### 🌟 给个 Star

如果这个项目对你有用,请给个 ⭐ —— 既能让更多人发现它,也是对持续开发的动力。

<p align="center">
  <img src="https://img.shields.io/github/stars/opensymph/OpenBuddy?style=social" alt="stars">
</p>

---

## ✨ 主要特性

<table>
<tr>
<td width="50%" valign="top">

**🎨 像素级接近的 WorkBuddy UI**
移植了 `--wb-*` 设计令牌、190 图标基础集和品牌资源。它*看起来*就像 WorkBuddy,因为用的是同一套原子。

**⚙️ 进程内 grok**
`xai-grok-shell` + `xai-acp-lib` 以路径依赖引入。Agent 跑在独立 OS 线程上,由 current-thread tokio runtime + `LocalSet` 驱动。没有 `child_process.spawn`。

**🔌 ACP 作为前后端契约**
流式 `SessionUpdate`、工具调用、Plan 更新、权限请求 —— 全部走类型化 `mpsc` 通道,序列化为 `grok://update` / `grok://permission` / `grok://complete` Tauri 事件。

</td>
<td width="50%" valign="top">

**🔑 BYOK 多 Provider**
自带 Key。在 `~/.grok/config.toml` 里配置任意数量的模型供应商。

**🧩 可扩展的 Agent 面**
- **Skills** —— `x.ai/skills/*`
- **MCP 连接器** —— `x.ai/mcp/*`
- **Experts / Assistants** —— `~/.grok/agents/*.md`

**🚀 进阶工作流**
Plan 模式(切换 & 查看)· Rewind(回溯 & 分叉)· 子智能体 Tasks(观察 & 取消)· Slash Commands · 本地 Automations 调度器 · 通知中心。

**📦 跨平台安装包**
Windows(NSIS `.exe` + MSI)与 macOS(`.dmg`)。GitHub Actions CI 自动出包。

</td>
</tr>
</table>

---

## ⚔️ OpenBuddy vs WorkBuddy

只列出我们能**实际背书**的对比项。WorkBuddy 的内部实现并未公开,我们不做臆测。

|  | **OpenBuddy** | WorkBuddy |
|---|:---:|:---:|
| **协议** | ✅ MIT,源码开放 | ❌ 闭源 |
| **费用** | 永久免费 | 免费(腾讯托管) |
| **安装包体积** | ✅ **~34 MB**(NSIS,实测) | ⚠️ 约 483 MB |
| **运行内存** | ✅ **~20 MB**(实测) | ⚠️ 约 374 MB |
| **BYOK / 任意供应商** | ✅ | ✅ |
| **Provider 配置方式** | ✅ 纯文本 `~/.grok/config.toml`——可 diff、可脚本、可纳入版本管理 | ⚠️ 仅 GUI |
| **MCP 连接器** | ✅ | ✅ |
| **Skills** | ✅ | ✅(内置 20+) |
| **Plan / Rewind** | ✅ | ✅ |
| **Windows** | ✅ | ✅ |
| **macOS** | ✅ | ✅ |
| **Linux** | 🔜 路线图 | 🔜 |
| **自托管 / fork** | ✅ 自己编译 | ❌ |
| **本地数据 / 离线友好** | ✅ 你的 `~/.grok/`、你的磁盘 | ⚠️ 腾讯托管后端 |

> WorkBuddy 是一个精致、真正能打的产品——本文不是来踩它的。想说的只是一句话:如果你想要**同样形态的体验,但开源、可 fork、不绑供应商**,OpenBuddy 就是那条路。

---

## 📸 截图

> 截图将在首个稳定版释出。想帮忙?见[参与贡献](#-参与贡献)。

<!-- TODO: 截图/动图就位后贴到这里。一张 hero demo GIF 对 star 数的提升是数量级的。 -->

---

## 🚀 快速开始

### 方式 A —— 下载预编译包

前往 **[Releases](https://github.com/opensymph/OpenBuddy/releases)** 页面下载最新安装包(Windows `.exe`/`.msi`、macOS `.dmg`),然后:

1. 安装并登录 grok 一次:`grok login`(应用复用 `~/.grok/auth.json`)。
2. 启动 OpenBuddy,完成。

### 方式 B —— 源码编译

```bash
git clone --recurse-submodules https://github.com/opensymph/OpenBuddy.git
cd OpenBuddy

# 若忘了 --recurse-submodules:
bash scripts/setup.sh            # macOS / Linux
powershell -File scripts/setup.ps1   # Windows

pnpm install
pnpm tauri dev
```

<details>
<summary><b>📋 前置要求</b></summary>

1. **Rust**(stable,约 1.95+)。`rust-toolchain.toml` 在 Windows 上固定 msvc 主机。
2. **Node 20+** 与 **pnpm**。
3. 已安装并登录 **grok**(执行一次 `grok login`)。应用复用 `~/.grok/auth.json`。
4. **protoc** 在 `PATH` 中**且** `PROTOC` 环境变量指向它(grok 的 `xai-grok-tools-api` 构建脚本需要;它自带的 `bin/protoc` 是 DotSlash 脚本,在 Windows 上跑不起来)。
   - Windows:`choco install protoc`,然后 `setx PROTOC "C:\ProgramData\chocolatey\bin\protoc.exe"`。

> 首次构建会编译整个 grok 依赖树(rusqlite/git2 内联 C、prost/protobuf、axum、reqwest ……),预计 **5–10 分钟**。之后的增量编译很快。

Windows 专属坑(MSVC 工作负载、网络镜像、grok 源码补丁)见 **[docs/WINDOWS_BUILD_NOTES.md](docs/WINDOWS_BUILD_NOTES.md)**。

</details>

<details>
<summary><b>🏗️ 构建安装包</b></summary>

```bash
pnpm dist:win    # Windows:NSIS .exe + MSI(需 MSVC link.exe + Windows SDK)
pnpm dist:mac    # macOS:.dmg(按宿主架构构建;未签名 / 未公证)
```

`grok-build` 作为 git submodule 内置于 `vendor/grok-build`(pin 在已验证的 revision)。setup 脚本负责初始化,`pnpm dist:*` 在构建前会校验其存在。

</details>

---

## 🧱 架构

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

---

## 🗺️ 路线图

- [x] 核心布局:Sidebar / HomePage / ChatView / Composer
- [x] 进程内 grok agent over ACP
- [x] WorkBuddy 设计令牌 & 190 图标基础集
- [x] BYOK 多 Provider 配置
- [x] Skills / MCP / Experts 面
- [x] Plan 模式 · Rewind · Tasks · Slash Commands · Automations
- [x] Windows(NSIS + MSI)& macOS(DMG)安装包
- [x] CI 发布工作流(GitHub Actions)
- [ ] SceneTabs 与技能推荐栏
- [ ] 置顶会话 & 工作空间分组
- [ ] 权限管理面板
- [ ] 跨会话搜索
- [ ] Linux 构建
- [ ] 代码签名 & 公证

完整待办见 [TODO.md](TODO.md)。

---

## 🤝 参与贡献

项目处于早期,节奏很快,任何体量的贡献都欢迎。

1. Fork & 带子模块 clone(`git clone --recurse-submodules`)。
2. 从 [TODO.md](TODO.md) 挑一个,或先开 issue 讨论。
3. `pnpm tauri dev` 开干。
4. 向 `main` 提 PR。

当前特别缺人:**Linux 打包**、**UI 打磨/截图**、**文档 & i18n**、**macOS 签名 CI**。

---

## 🙏 致谢

- **[腾讯 WorkBuddy](https://workbuddy.tencent.com/)** —— 设计北极星。OpenBuddy 沿用了 WorkBuddy 的 `--wb-*` 设计令牌、190 图标基础集和品牌原子,实现像素级接近。
- **[xai-org/grok-build](https://github.com/xai-org/grok-build)** —— 进程内嵌入的 grok agent(`xai-grok-shell` + `xai-acp-lib`),以路径依赖方式引入。
- **[Tauri](https://tauri.app/)** / **[React](https://react.dev/)** / **[Vite](https://vitejs.dev/)** —— 让一个 10 MB 壳秒开的底层栈。

本项目是独立的、社区驱动的开源项目,与腾讯或 xAI 不存在隶属、背书或赞助关系。

---

## 协议

MIT © OpenBuddy contributors。详见 [LICENSE](LICENSE)。
