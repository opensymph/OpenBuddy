# OpenBuddy 对话框对齐 WorkBuddy 设计

日期：2026-07-20
状态：已获用户批准

## 目标

将 openbuddy 的聊天输入卡片（Composer）与聊天消息气泡（MessageItem）视觉对齐 WorkBuddy v5.2.6。只改样式与 DOM 结构，不改任何行为逻辑（发送/附件/语音/斜杠命令/模型选择/工作空间选择保持不变）。

## 数据来源

从运行中的 WorkBuddy（CDP 端口 9224）抓取的计算样式与截图：

- `.cdp-inspect/captures/30-bubble-styles.json`、`31-bubble-styles2.json`、`32-final-details.json`
- `.cdp-inspect/captures/wb-chat-ref2.png`（聊天页参考）、`wb-home-ref2.png`（首页参考）

## 实测值

### Composer 输入卡片（首页）

- 卡片：白底 `#fff`、圆角 16px、padding `12px 12px 0`、阴影 `0 12px 24px -8px rgba(0,0,0,.02), 0 2px 4px -4px rgba(0,0,0,.02)`、无边框
- 输入区：min-height 50px（首页空态 70px）、字号 14px、行高 25px
- 底部工具行：总高 56px 区域；左侧 `+` 按钮 24×24（16px 图标）；右侧模型触发器（13px、`rgb(51,51,51)`、radius 8、padding 0 8px、高 32）、mic 32×32、发送按钮 32×32 圆形
- 发送按钮：圆形纸飞机 SVG（原始 path 已抓取，见 32-final-details.json）；禁用态灰圆 `rgb(232,232,232)`；启用态深色圆 + 浅色飞机
- meta 行（选择工作空间/默认权限）：**在卡片内部底部**，行高 32、padding 0 12px；chips 13px、`rgba(0,0,0,0.5)`、radius 8、padding 0 8px、透明底、hover 浅灰

### 聊天页差异

- 输入卡片更矮（输入区 50px、无 meta 行）
- 卡片下方居中一行「内容由 AI 生成，请核实重要信息」：12px、`rgba(0,0,0,0.3)`、行高 20、区域高 26

### 消息气泡

- 用户消息：右侧对齐；头像 24×24 圆形（名字首字符、11px/600 白字、彩色底）+ 名字行在右上；气泡 `rgb(235,235,235)`、圆角 `16px 16px 0 16px`（右下直角）、padding `8px 12px`、14px/22px、字色 `rgba(0,0,0,0.9)`
- AI 消息：头像 24×24 圆形 + 名字行（左侧）；正文无气泡、padding `0 12px`、14px/25px；inline code 背景 `rgba(0,0,0,0.05)`、radius 3px、padding `0 4px`
- 工具调用紧凑行：13px、行高 19px 左右（ToolCallCard 精修留作后续）

## 改动文件

1. `src/components/Composer.tsx`
   - meta 行（WorkspacePicker + PermissionPicker）从卡片外移入 `<section class="wb-composer">` 内部底部（仅 `showMeta` 时渲染）
   - `+` 附件按钮视觉 24×24
   - 发送按钮换用 WorkBuddy 飞机 SVG（内联 path，stroke currentColor）
   - 新增 `showDisclaimer` prop：聊天页 composer 下方渲染「内容由 AI 生成，请核实重要信息」
2. `src/components/MessageItem.tsx`
   - 用户消息：右侧 24×24 圆形头像（首字符）+ 名字行；气泡按实测值
   - AI 消息：`◆` 换为 24×24 圆形头像 + 名字行
3. `src/styles/app.css`：按实测值更新 `.wb-composer*`、`.msg*` 规则
4. `src/components/ChatView.tsx`：给 Composer 传 `showDisclaimer`
5. 测试：更新 `Composer.test.tsx` 中受结构变动影响的断言（meta 移入卡片内）；MessageItem 若有断言同步更新

## 明确不做

- 不改发送/取消/附件/语音/斜杠命令逻辑
- 不复制 WorkBuddy 聊天页左侧的 Craft/技能/连接器 chips（属于功能差异，非视觉对齐）
- 首页快捷操作 chips 行（文档处理/金融服务…）保持原位不动
- ToolCallCard 的逐像素精修（后续单独一轮）
- 首页机器人吉祥物装饰

## 验收

1. `npm run test` 全绿
2. 启动应用后 CDP 截图首页与聊天页，与 `wb-home-ref2.png`、`wb-chat-ref2.png` 对比：卡片阴影/圆角、meta 行在卡内、发送按钮圆形飞机、用户气泡右下直角灰泡、AI 头像+名字、免责行居中
