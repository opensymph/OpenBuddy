# WorkBuddy UI 组件参考

本文档整理了 WorkBuddy 的界面组件结构，用于指导 OpenBuddy 的界面完善工作。

## 1. 整体布局结构

WorkBuddy 采用经典的左侧边栏 + 主内容区布局：

```
┌─────────────────────────────────────────────────────────┐
│                      TitleBar                           │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│   Sidebar    │           MainContent                    │
│              │                                          │
│  - Logo      │  - HomePage / ChatView                   │
│  - Search    │                                          │
│  - Nav Items │                                          │
│  - Sessions  │                                          │
│  - User      │                                          │
│              │                                          │
└──────────────┴──────────────────────────────────────────┘
```

## 2. 核心组件清单

### 2.1 基础组件 (Foundation Components)

| 组件 | 类名前缀 | 说明 |
|------|---------|------|
| Avatar | `wb-avatar` | 头像组件 |
| Breadcrumb | `wb-breadcrumb` | 面包屑导航 |
| Button | `wb-button` | 按钮 |
| Card | `wb-card` | 卡片 |
| Checkbox | `wb-checkbox` | 复选框 |
| Drawer | `wb-drawer` | 抽屉 |
| Dropdown | `wb-dropdown` | 下拉菜单 |
| Input | `wb-input` | 输入框 |
| Loading | `wb-loading` | 加载状态 |
| Popover | `wb-popover` | 弹出框 |
| Progress | `wb-progress` | 进度条 |
| Select | `wb-select` | 选择器 |
| Switch | `wb-switch` | 开关 |
| Table | `wb-table` | 表格 |
| Tabs | `wb-tabs` | 标签页 |
| Tag | `wb-tag` | 标签 |
| TextArea | `wb-textarea` | 文本域 |

### 2.2 布局组件

| 组件 | 类名 | 说明 |
|------|------|------|
| Sidebar | `wb-sidebar-left` / `wb-sidebar-right` | 左/右侧边栏 |
| HomePage | `wb-home-page` | 首页 |
| SearchPanel | `wb-search-panel` | 搜索面板 |
| InputAdd | `wb-input-add` | 输入区附加组件 |
| InputFooter | `wb-input-footer` | 输入区底部 |
| StatusChips | `wb-status-chips` | 状态标签 |

### 2.3 业务组件

| 组件 | 说明 |
|------|------|
| conversation-list | 会话列表 |
| pinned-section | 置顶会话区 |
| chat-renderer | 聊天渲染器 |
| colleagues-panel | 同事面板 |
| automation-panel | 自动化面板 |
| knowledge-base-panel | 知识库面板 |
| skill-recommend-bar | 技能推荐栏 |

## 3. CSS 设计令牌 (Design Tokens)

### 3.1 颜色令牌

```css
/* 背景色 */
--wb-bg-primary
--wb-bg-secondary
--wb-bg-tertiary
--wb-bg-surface
--wb-bg-active
--wb-bg-hover

/* 边框色 */
--wb-border-default
--wb-border-soft
--wb-border-focus

/* 文本色 */
--wb-color-text-primary
--wb-color-text-secondary
--wb-color-text-tertiary
--wb-color-text-disabled
--wb-color-text-brand

/* 状态色 */
--wb-status-success
--wb-status-error
--wb-status-warning
```

### 3.2 间距和圆角

```css
/* 圆角 */
--wb-radius-sm
--wb-radius-md

/* 阴影 */
--wb-shadow-sm
```

## 4. 关键页面结构

### 4.1 首页 (HomePage)

```tsx
<div className="wb-home-page">
  <HomeHeader />           // Logo + 标题
  <SceneTabs />            // 场景标签页 (日常办公/代码开发/设计创意...)
  <HomeComposer />         // 输入框组件
  <PracticeCases />        // 实践案例推荐 (可选)
</div>
```

### 4.2 聊天视图 (ChatView)

```tsx
<div className="chat-view">
  <ChatRenderer />         // 消息列表
  <InputComposer />        // 输入框
  <InputFooter>            // 底部元信息
    <WorkspacePicker />    // 工作空间选择
    <PermissionChip />     // 权限标签
  </InputFooter>
</div>
```

### 4.3 会话列表 (ConversationList)

```tsx
<div className="conversation-list">
  <PinnedSection />        // 置顶会话
  <TaskSection />          // 任务会话
  <WorkspaceSection>       // 工作空间会话
    <WorkspaceGroup />
  </WorkspaceSection>
</div>
```

## 5. 输入框组件 (Composer)

### 5.1 结构

```tsx
<div className="wb-composer">
  <div className="wb-composer__attachments" />  // 附件区
  
  <textarea className="wb-composer__input" />   // 输入框
  
  <div className="wb-composer__footer">
    <AddButton />           // 添加附件
    <ModelSelector />       // 模型选择
    <VoiceButton />         // 语音输入
    <SendButton />          // 发送按钮
  </div>
</div>

<div className="wb-composer-meta">
  <WorkspacePicker />
  <PermissionChip />
</div>
```

## 6. OpenBuddy 对齐清单

### 已完成 ✅
- [x] 基础布局结构
- [x] Sidebar 组件
- [x] HomePage 组件
- [x] Composer 输入框
- [x] ChatView 聊天视图
- [x] 会话列表
- [x] grok 后端集成

### 待完善 📝
- [ ] 场景标签页 (SceneTabs)
- [ ] 技能推荐栏 (SkillRecommendBar)
- [ ] 置顶会话功能
- [ ] 工作空间分组
- [ ] 权限管理面板
- [ ] 设置面板完善
- [ ] 搜索功能
- [ ] 更多动画效果

