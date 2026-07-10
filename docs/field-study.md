# Claude Design 实地考察报告（2026-07-09）

> 走了完整流程：首页 → prompt → 澄清表单 → 生成 → 自查自修 → Annotate → Tweaks → Edit → Share。
> 本文档是**最高优先级真值**，覆盖 replication-spec 中的推测。

## 1. 路由与状态

- 首页 `claude.ai/design`，项目 `claude.ai/design/p/<uuid>?file=Hero.dc.html`（**file 参数在 URL**）
- **浏览器标题 = 状态指示**：`✶ <项目名>` 生成中 / `✓ <项目名>` 完成

## 2. 编辑器布局（关键校准）

- **左聊天栏很窄（~190px）**，右侧画布占绝对主体
- 聊天栏顶部：小 logo + 项目名（截断）+ 折叠按钮 + 铃铛
- 聊天底部输入："Describe what you want to create..." + 工具行：`+` | 语音 | **`Opus 4.8 Medium ▾`（模型+effort 选择器）** | Send（橙）
- **画布顶栏（左→右）**：`↻` 刷新 | `Hero ▾` 文件切换 | ｜右侧：`🔍 100%` 缩放 | `Annotate` | `Tweaks` | `✎ Edit` | `Present ▾` | **`Share`（黑色胶囊）** | 头像
- 无独立 Export 按钮——**Export 在 Share 弹窗里**

## 3. 聊天流形态

- 用户消息：白色圆角卡片（浅边框）
- Claude 文字：**衬线体**（Anthropic Serif），无气泡直接排
- **步骤组**：`✦ Designing` 可折叠 pill 行（完成后合并摘要如 "Designing, Refining design ×2"，右侧 ∨）
- **活动步骤**：`✶ Shelling...` / `✶ Writing styles` / `✶ Thinking...`（星芒+动名词+省略号）
- **文件 chip**：`📄 Hero.dc.html`（可点击行，右侧打开图标）
- 操作行：`Created Hero.dc.html` / `Edited Hero.dc.html` + **`Undo` 链接**
- 👍👎 在消息组末尾
- **自查自修**（生成后自动）："Checking the design for issues..." + 设计缩略图卡 → "Found issues — fixing..." → `✦ Refining design ×2` → 修复说明（内联代码样式）→ `Edited ... Undo`
- 澄清入口卡：`⊙ Claude has some questions →`（橙 tint 行）

## 4. 澄清问题 = 画布表单（黄金机制）

- 触发时画布渲染完整表单页「Quick questions about the ...」（衬线标题）
- 控件类型：文本输入（带 skip 说明）/ **色板卡片组**（双色点预览）/ chip 单选组 / 大文本框 / **每题几乎都有「Decide for me」**/「Other...」内联输入
- 内建问题：**"How many directions do you want?"（Just one, dialed in / Two to compare / Three to explore / Decide for me）**——变体数量是标准问题
- 右下角橙色 `Continue`
- 提交后回填聊天为结构化列表：「Questions answered: - warm_palette: 4 - type_mood: Decide for me ...」

## 5. 生成物 = .dc.html 文件系统

- 文件名如 `Hero.dc.html`，**`.dc.html` 是带运行时的组件式 HTML**
- 有 atomic utility classes 系统（`data-dc-atomics` 挂在 `<helmet>` 标签——自有 DSL）
- **props 系统：`dc_set_props` 声明 / `this.props` 读取**
- 无文件时画布顶栏显示「No file open ▾」

## 6. Annotate（评论）

- 点 Annotate → 按钮橙色激活，**左栏整体切换成 Comments 面板**（"No comments yet. Leave feedback for your teammates below."），底部输入变 "Add a comment..."
- 画布蒙灰 + 顶部蓝色 pill：「**Click to comment, drag to draw**」（支持拖拽画区域）
- 点元素 → **蓝色选中框** + 元素角上**橙色圆形数字 pin**「1」+ 弹卡：
  - 输入 "Describe the issue or suggestion..."
  - 双按钮：`Add comment`（次要，攒评论）| `Send to Claude`（橙色主按钮，立即执行）

## 7. Tweaks（旋钮）

- 点 Tweaks → 弹小输入框：**描述想调什么**
- 提交 → 自动组装用户消息：「Add tweakable controls to Hero.dc.html (declare with dc_set_props, read via this.props): <描述>」→ Claude 改造文件声明 props
- 再点 Tweaks → **右上浮动面板**：按分组标题（Type / Call to action）列出 props：
  - 数字 prop → 滑块 + 当前值（"headlineSize 66px"）
  - 颜色 prop → **curated swatches 色板行**（选中带 ✓）
- 模型总结示例："Added two Tweaks controls: headline size (40-88px slider) and CTA color (curated swatches). Both fall back to the CSS defaults..."

## 8. Edit（可视化编辑器，Figma-lite）

- 左栏切换成 Edit 面板：顶部 `Edit` + `Discard` / `Save`（橙）
- **四 tab：Simple / Pro / Code / Tweaks**
- Pro：**图层树**（Column div...）+ 工具条：选择 / 直选 / T 文字 / # / 矩形 / 圆 / 吸管? / 线 / 铅笔 / ↶↷
- 提示："Click any element on the canvas to edit it. **Repeated elements are edited together.** Shift-click to select more."

## 9. Share 弹窗（含 Export）

- 「Who can access」：`Your workspace ▾` + "Only you can see this design." + `Copy link`（黑）
- 「Export」区：
  - **PDF** — Original size — Download
  - **Standalone HTML** — One self-contained file — Download
  - **PowerPoint** — Editable text and shapes — ›
  - **More formats and apps** — ›

## 10. 首页（见 tokens-field.md §首页结构）

- 输入卡（800px/r17）：`+` | `Design system: None ▾` | `Template: None ▾` | `</>` | `Model: Claude Opus 4.8 ▾` | 橙色 48px 圆角发送
- 模板扇形：Prototype / Slides / Document / Wireframe / Animation
- 三 tab：Projects / Design systems / Templates + Search + ☆ + 视图切换
- 「Set up a design system!」蓝色爆炸贴纸（右下）

## 11. 待深挖（下轮）

- Edit 模式选中元素后的 Simple 属性面板 / Code tab
- Present 模式（演示，token 表有 --om-presenter-* 深色系）
- `+` 附件菜单、`</>` 按钮（codebase?）、Design systems tab 全流程
- 变体（Two to compare 时的并排 UI）
- `.dc.html` 运行时源码（如能导出 Standalone HTML 对照）
- 语音输入按钮

## 12. 对我们实现的直接指令

1. 视觉：全套 `--om-*` token 替换（见 tokens-field.md）；衬线=ui-serif/Georgia 栈，UI=system-ui 栈
2. 布局：聊天栏收窄到 ~260px（190px 对中文太挤，取形态而非死数值→待像素校准）
3. 画布顶栏按 §2 重排；Share 弹窗吸收 Export
4. 聊天流按 §3 重做（衬线正文、步骤组、文件 chip、Undo 行、👍👎）
5. 澄清表单机制照 §4（模型输出表单 schema → 画布渲染 → 回填）
6. Tweaks 照 §7 完整机制（props 协议 + 自动控件）
7. Annotate 照 §6（左栏 Comments 面板 + 双按钮 + 数字 pin）
8. BYOK 模型选择器放输入框工具行（原版同位）
