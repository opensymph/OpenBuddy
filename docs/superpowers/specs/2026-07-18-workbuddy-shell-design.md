# OpenBuddy 外壳复刻 WorkBuddy 设计文档

日期:2026-07-18
状态:已获用户确认(方案 A + 四个设计小节均确认)

## 背景与目标

OpenBuddy(Tauri 2 + React 18 + Vite 5 + TS + zustand,纯手写 CSS)是 grok 内核(E:\Grok\grok-build,Rust,经 Cargo path 依赖链接进 Tauri 进程)的桌面外壳。当前界面与目标 WorkBuddy(腾讯 CodeBuddy 系,Electron)差距大,需要整体外壳复刻:左侧导航 + 首页(大标题/分类标签/Composer)+ 自定义无边框标题栏,全部按 WorkBuddy 布局与视觉语言重做。

**范围**:整体外壳复刻(布局 + 视觉语言高度神似,非逐像素)。只做亮色。ChatView(会话页)本轮不动。

**样式依据**:通过 CDP 连接运行中的 WorkBuddy 5.2.6 实测抓取(computed style + DOM 结构),脚本存档于 `E:\Grok\openbuddy\.cdp-inspect\`。

## 架构与组件划分

```
TitleBar(新增)          — 30px 无边框标题栏:品牌 logo + 编辑/窗口/帮助菜单(占位下拉)+ 最小化/最大化/关闭(46×30)
└─ Shell(App.tsx 改造)  — TitleBar 下方 flex 左右布局
   ├─ Sidebar(重写)     — 264px,三段式:
   │   ├─ 顶栏:logo "OpenBuddy"(12px/700 灰)+ 版本号(10px)+ 侧栏开关/搜索/筛选图标(搜索、筛选占位)
   │   ├─ 导航:新建任务(可用)/ 助理 / 项目 / 专家·技能·连接器 / 自动化 / 更多(占位 →"即将上线")
   │   ├─ 空间/会话列表:单一默认空间分组(可折叠),数据来自现有会话 store,不建空间实体
   │   └─ 底部:用户信息(本地展示)/ 通知铃铛(占位)/ 设置(可用,打开现有 SettingsPanel)
   └─ Main
      ├─ HomePage(重写) — 大标题两行 + 场景标签(日常办公/代码开发/设计创意)+ 快捷 chips + Composer
      ├─ Composer(新组件) — 圆角 16 卡片:占位文案、左下 +、右下 Auto 下拉(占位)/麦克风(占位)/发送;卡片下方"选择工作空间""默认权限"(占位)
      ├─ ChatView(现有,保留不动)
      └─ PlaceholderPage(新增) — 占位功能"即将上线"提示页
```

**不动的部分**:`src-tauri/`(Rust 桥接)、`src/lib/grok-client.ts`、zustand 会话 store、SettingsPanel、ChatView。

## 视觉规格(CDP 实测值)

| 项 | 值 |
|---|---|
| 侧栏背景 | `#F2F2F2`,宽 264px |
| 主区背景 | `#FAFAFA`(body 白 `#FFFFFF`) |
| 顶部菜单栏 | 高 30px;窗口控制按钮 46×30,图标色 `rgb(139,148,158)`,关闭键 hover 红 |
| 正文/标题色 | `rgba(0,0,0,0.9)`;次要 `rgba(0,0,0,0.7)`;弱提示 `rgba(0,0,0,0.3)`;版本号 `rgba(0,0,0,0.2)` |
| 大标题 | 36px / 600 / 行高 48,两行:"OpenBuddy" + "你的职场超能力" |
| 场景标签容器 | bg `#EBEBEB`,padding 2px,圆角 10,高 36,gap 2 |
| 场景 pill 激活 | bg `rgba(0,0,0,0.75)`,白字,600,圆角 8,高 32,padding 0 12 |
| 场景 pill 未激活 | 色 `rgba(0,0,0,0.7)`,500,圆角 8,高 32 |
| 快捷 chips | 白底,1px solid `rgba(0,0,0,0.08)`,圆角 8,高 32,13px/500,padding 0 12 |
| Composer 卡片 | 圆角 16,高约 174(随内容),白底 + 柔和投影 |
| 侧栏导航项 | 高 30,padding 4 12,圆角 8,gap 8;激活 bg `#E6E6E6` + 600 |
| 分组标签 | 12px / 600 / `rgba(0,0,0,0.3)`(如"空间 (4)") |
| 会话条目卡片 | 高 30,圆角 8,padding 4 12 4 36 |
| 积分按钮(占位) | 全圆角 pill(半径 46),白底,1px `rgba(0,0,0,0.08)`,高 32 |
| 字体 | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`,基准 13px |
| Composer 占位文案 | "今天帮你做些什么? @ 引用对话文件,/ 调用技能与指令" |

取值落盘方式:提取进 `src/styles/tokens.css` 现有命名体系,不整段拷贝 WorkBuddy CSS。图标优先复用 `src/foundation/components/Icon/icons/`,缺的按同风格补画(铃铛、筛选、麦克风等)。

## 状态与数据流

- 沿用现有 zustand store;侧栏"空间"为单一默认分组(可折叠),不引入空间实体。
- 未配置 API Key:首页布局照常显示;Composer 输入区禁用,占位文案改为"请先配置 API Key 开始使用",点击打开 SettingsPanel;发送按钮置灰。
- 占位入口(助理/项目/专家·技能·连接器/自动化/更多/搜索/筛选/Auto 下拉/麦克风/积分按钮/选择工作空间/默认权限/铃铛):点击 → PlaceholderPage 或 toast"即将上线"。
- "新建任务" = 现有新建会话;点击会话条目进入现有 ChatView。

## 无边框窗口(Tauri)

- `tauri.conf.json` 设置 `decorations: false`。
- TitleBar 组件:`data-tauri-drag-region` 拖动区;菜单"编辑/窗口/帮助"本轮为占位下拉;窗口控制用 `@tauri-apps/api/window`(minimize / toggleMaximize / close),样式按实测 46×30。
- 布局骨架:TitleBar 30px + 下 flex(Sidebar 264px + Main 自适应)。

## 错误处理

- 占位功能无新错误面(静态提示)。窗口控制 API 调用失败静默忽略。grok 会话错误处理沿用现有逻辑,不在本轮范围。

## 测试与验收

- 组件单测(用仓库现有测试栈):Sidebar 导航渲染与占位点击、Composer 未配置 API Key 时的禁用态。
- 手动验收清单(对照 WorkBuddy 截图/实测值):
  1. 启动后标题栏、侧栏、首页布局与 WorkBuddy 一致(亮色)
  2. 新建任务可发起真实 grok 会话,ChatView 正常
  3. 未配置 API Key 时 Composer 禁用并引导至设置
  4. 全部占位入口有"即将上线"反馈
  5. 窗口拖动、最小化/最大化/关闭正常

## 明确不做(YAGNI)

- 暗色模式(tokens 结构不堵死后路)
- 空间实体/多工作空间、积分系统、自动化、助理、项目、语音输入、Auto 模型下拉的真实逻辑
- ChatView 重设计
- 逐像素 1:1(允许字体渲染等细微差异)
