# OpenBuddy vs WorkBuddy 界面对比分析报告

> 生成时间: 2026-07-19
> 目标: 确保 OpenBuddy 界面与 WorkBuddy 一致，并连接 grok 内核功能

---

## 一、当前实现状态总览

### OpenBuddy 已实现组件 (18个业务组件)

| 组件 | 文件 | 状态 | 与 WorkBuddy 对比 |
|------|------|------|-------------------|
| TitleBar | `TitleBar.tsx` | ✅ 完成 | 菜单栏结构一致，缺少下拉菜单项 |
| Sidebar | `Sidebar.tsx` | ✅ 完成 | 导航结构一致，缺少折叠动画 |
| HomePage | `HomePage.tsx` | ✅ 完成 | 布局一致，场景切换已实现 |
| Composer | `Composer.tsx` | ✅ 完成 | 功能完整，含附件、模型选择器 |
| ChatView | `ChatView.tsx` | ✅ 完成 | 消息流布局正确 |
| MessageItem | `MessageItem.tsx` | ✅ 完成 | 用户/助手消息样式正确 |
| Markdown | `Markdown.tsx` | ✅ 完成 | 代码高亮、表格支持 |
| ToolCallCard | `ToolCallCard.tsx` | ✅ 完成 | 工具调用展示，需完善 diff 视图 |
| PermissionDialog | `PermissionDialog.tsx` | ✅ 完成 | 权限请求弹窗已实现 |
| SettingsPanel | `SettingsPanel.tsx` | ✅ 完成 | 模型管理功能完整 |
| SearchOverlay | `SearchOverlay.tsx` | ✅ 完成 | 会话搜索已实现 |
| ModelSelector | `ModelSelector.tsx` | ✅ 完成 | 模型下拉选择器 |
| WorkspacePicker | `WorkspacePicker.tsx` | ✅ 完成 | 工作空间切换器 |
| ThemeProvider | `ThemeProvider.tsx` | ✅ 完成 | 亮/暗主题切换 |
| Toast | `Toast.tsx` | ✅ 完成 | 消息提示 |
| PlaceholderPage | `PlaceholderPage.tsx` | ✅ 完成 | 占位页面 |

### WorkBuddy 原版组件清单 (19个模块)

| 模块 | OpenBuddy 对应 | 差异说明 |
|------|----------------|----------|
| **工作区容器** | App.tsx | ✅ 已实现 |
| **聊天/对话系统** | ChatView + MessageItem | ✅ 核心已实现 |
| **助理/同事系统** | PlaceholderPage | ⚠️ 需要实现完整面板 |
| **侧边栏轨道** | Sidebar.tsx | ⚠️ 缺少专家轨道 |
| **发现面板** | 未实现 | ❌ 需要实现 |
| **灵感面板** | 未实现 | ❌ 需要实现 |
| **自动化面板** | 未实现 | ❌ 需要实现 |
| **技能系统** | 未实现 | ❌ 需要实现 |
| **文件预览系统** | 未实现 | ⚠️ 部分可通过工具调用展示 |
| **代码编辑器** | 未实现 | ⚠️ 可集成 Monaco |
| **认证系统** | 基础实现 | ✅ grok login 已对接 |
| **项目管理** | 未实现 | ❌ 需要实现 |
| **文档选择器** | Composer 附件 | ✅ 已实现文件选择 |
| **详情面板** | 未实现 | ❌ 需要实现 |
| **UI 基础组件** | 基础实现 | ✅ tokens.css 完整 |
| **市场/商店** | 未实现 | ❌ 低优先级 |
| **主题系统** | ThemeProvider | ✅ 已实现 |
| **图表面板** | 未实现 | ⚠️ Markdown 内 mermaid 支持 |
| **集成服务** | 未实现 | ❌ 企业功能，低优先级 |

---

## 二、界面细节差异分析

### 2.1 首页 (HomePage)

**WorkBuddy 实测值 (CDP 捕获)**:
- 侧栏宽度: 264px, 背景 `#F2F2F2`
- 主区背景: `#FAFAFA`
- 菜单栏高度: 30px
- 窗口按钮: 46×30
- 大标题: 36px/600/lh48
- 场景 pill 激活: `rgba(0,0,0,0.75)` 白字
- chips: 白底 1px border `rgba(0,0,0,0.08)` 圆角 8, 高 32
- Composer 圆角: 16
- 导航项高: 30, 激活 `#E6E6E6`
- 分组标签: 12px/600 `rgba(0,0,0,0.3)`
- 字体: `-apple-system, "Segoe UI", Roboto...` 13px

**OpenBuddy 当前实现**:
- ✅ tokens.css 包含完整设计变量
- ✅ app.css 尺寸与 WorkBuddy 一致
- ⚠️ 缺少 mascot 图标 (WorkBuddy 右上角吉祥物)
- ⚠️ 场景切换动画可优化

### 2.2 侧边栏 (Sidebar)

**WorkBuddy 结构**:
```
conversation-sidebar (264px)
├── conversation-list-topbar (搜索/筛选按钮)
├── conversation-list-header (Logo + Tabs)
├── conversation-list-tabs (新建任务/助理/项目/更多)
├── conversation-list-content (空间 + 会话列表)
└── conversation-list-footer (用户区 + 设置)
```

**OpenBuddy 差异**:
- ✅ 基本结构一致
- ⚠️ 缺少折叠功能 (WorkBuddy: 264px ↔ 56px)
- ⚠️ 缺少会话右键菜单 (重命名/删除/置顶)

### 2.3 Composer 输入框

**WorkBuddy 特性**:
- 圆角 16px
- 底部工具栏: + 附件 | 模型选择器 | 麦克风 | 发送
- 可拖拽调整高度
- 显示 token 计数

**OpenBuddy 实现**:
- ✅ 圆角正确
- ✅ 附件功能已实现
- ✅ 模型选择器已实现
- ✅ 发送/停止按钮已实现
- ⚠️ 缺少高度拖拽调整
- ⚠️ 语音输入为占位符

### 2.4 消息渲染

**WorkBuddy 消息结构**:
```css
_userMessageBubble_cko0t_8  /* 用户气泡 */
_assistantTextContent_14nyt_207  /* 助手文本 */
cb-markdown  /* Markdown 渲染 */
unknown-tool-compact  /* 工具调用紧凑视图 */
```

**OpenBuddy 实现**:
- ✅ 用户消息右对齐气泡
- ✅ 助手消息左对齐 + 头像
- ✅ Markdown 渲染
- ✅ 工具调用卡片
- ⚠️ 工具调用紧凑视图样式可优化

---

## 三、Grok 内核 Slot 实现分析

### 可用于前端集成的 Slot

| Slot | 用途 | 前端集成方式 |
|------|------|-------------|
| **TaskSlot** | 任务管理 | 通过 `grok_cancel` 取消当前任务 |
| **FILE_TOOL_SLOTS** | 文件工具切换 | 配置文件动态选择工具集 |
| **WriteErrorSlot** | 连接错误 | 监听 `grok://error` 事件 |
| **Half-Open Probe Slot** | 熔断器状态 | 错误处理时检查重试时间 |
| **Reverse-Index Slot** | 工具绑定冲突 | 处理 -32600 错误码 |

### 前端需要监听的事件

```typescript
// 已实现
"grok://update"      // 消息流更新
"grok://complete"    // 会话完成
"grok://permission"  // 权限请求

// 可扩展
"grok://error"       // 连接/任务错误
"grok://agent-died"  // Agent 崩溃 (建议实现)
```

---

## 四、待实现功能优先级

### P0 - 核心功能 (立即实现)

1. **消息渲染优化**
   - [ ] 工具调用紧凑视图样式
   - [ ] Diff 视图使用 unified diff
   - [ ] 代码块复制按钮

2. **会话管理完善**
   - [ ] 会话重命名/删除
   - [ ] 会话置顶功能
   - [ ] 批量操作

### P1 - 重要功能 (短期实现)

3. **侧边栏增强**
   - [ ] 折叠/展开动画
   - [ ] 专家轨道 (二级侧边栏)
   - [ ] 拖拽排序

4. **设置面板完善**
   - [ ] 系统设置 (字体/语言)
   - [ ] 快捷键配置
   - [ ] 数据管理

### P2 - 扩展功能 (中期实现)

5. **助理系统**
   - [ ] 助理列表面板
   - [ ] 创建助理抽屉
   - [ ] 助理档案页

6. **项目管理**
   - [ ] 项目列表页
   - [ ] 项目详情页
   - [ ] 任务预览

### P3 - 高级功能 (长期规划)

7. **发现/灵感面板**
   - [ ] 用例卡片
   - [ ] 分类过滤器
   - [ ] 策展指令

8. **技能市场**
   - [ ] 技能卡片
   - [ ] 安装/更新状态
   - [ ] 技能扫描

9. **自动化系统**
   - [ ] 自动化任务列表
   - [ ] 运行状态显示
   - [ ] 结果摘要

---

## 五、技术债务

1. **图标系统**: 21 个 stub 图标需要实现 (主要是文件类型图标)
2. **国际化**: i18next 集成 (WorkBuddy 已有)
3. **测试覆盖**: 组件测试需要补充
4. **性能优化**: 大量消息时的虚拟滚动

---

## 六、下一步行动

1. 启动 OpenBuddy，对比 WorkBuddy 实际界面
2. 使用 CDP 抓取 WorkBuddy 各页面结构
3. 逐个实现 P0 功能
4. 完善 ACP 协议对接
5. 端到端测试验证

---

*此报告基于代码分析和 CDP 捕获数据生成，将持续更新*
