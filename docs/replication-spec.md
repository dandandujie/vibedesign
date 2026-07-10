# Claude Design 1:1 复刻规格（真值文档）

> 目标：让用户使用本项目时**感觉完全在用 Claude Design**。唯一刻意差异：BYOK（自带 key，多格式模型服务）。
> 每条真值标注来源：`[官方]` = Anthropic 新闻稿/Help Center；`[评测]` = victordibia / developersdigest / DataCamp 实测；`[实地]` = 我们在 claude.ai/design 实地确认（**待补**）。
> 规则：与本文档冲突的实现一律改实现；文档更新只能来自更高优先级来源（实地 > 官方 > 评测）。

---

## 0. 产品定位

- 对话驱动的设计工作台：聊天生成**设计 artifact**（原型/幻灯片/one-pager/落地页），实时渲染在画布，可精修、可分享、可导出。`[官方]`
- 模型：Claude Opus 4.7 驱动（我们 BYOK：任意 Anthropic/OpenAI/OpenAI-Responses/Gemini 格式服务）。`[官方]`
- 入口：`claude.ai/design`。研究预览，Pro/Max/Team/Enterprise。`[官方]`

## 1. 信息架构（路由）

| 路由 | 内容 | 来源 |
|---|---|---|
| `/design` | 首页：项目列表 + 新建入口 | `[官方]` 待实地确认布局 |
| `/design/<project>` | 编辑器（双栏工作台） | `[官方]` |
| 设置（org）| Design system 管理、能力开关 | `[官方]` 我们映射为 BYOK 模型服务 + 本地 design system 管理 |

## 2. 首页

- 「New project」入口；新建时可选保真度（如 High fidelity）。`[评测:DataCamp]`
- 项目列表（名称/缩略图/更新时间——**布局待实地**）。
- 新项目自动继承已发布的 design system。`[官方]`

## 3. 编辑器布局

- **双栏**：左聊天 pane、右画布 canvas。`[官方][评测]`
- 聊天 pane 带**可折叠的 agent 工具步骤条**："Editing" / "Searching" / "Done" 等状态行，Claude Code 式执行流。`[评测:victordibia]`
- 画布**实时流式渲染**，生成中可**取消/中断**。`[评测:developersdigest]`
- **Export 按钮在右上角**。`[官方][评测]`
- 画布有**模式切换**：交互模式 ↔ Comment mode。`[评测:DataCamp]`
- 语音输入修改指令（"Make this section more compact"）。`[评测:developersdigest]`（低优先级）

## 4. 生成流程

1. 用户输入（文字 / 上传 / codebase / web capture）。
2. Claude 可能**先问澄清问题**（audience、aesthetic、导航模式等）再画。`[评测:DataCamp]`
3. agent 步骤条逐步显示动作；画布流式出现设计。`[评测]`
4. 完成后聊天里给简短总结。
5. agent 内部会"截图自查再改"（iterative QA）。`[评测:developersdigest]` — 我们用审查 skills（ai-slop-check 等）近似。

## 5. 精修（核心手感）

| 交互 | 行为 | 来源 |
|---|---|---|
| **Inline comments** | Comment mode 下点画布元素 → pin 一条评论 → Claude 针对该元素改 | `[官方][评测]` |
| **直接改字** | 画布上直接编辑文本，无需 prompt | `[官方]` |
| **Adjustment knobs/sliders** | 间距/颜色/布局的实时调节控件；由 Claude 按设计生成（"UI dials"，类 Figma 属性面板） | `[官方][评测]` |
| **拖拽/缩放/对齐** | 直接操纵元素位置大小 | `[官方 Help]`（待实地确认程度） |
| **应用到整体** | 让 Claude 把局部改动推广到全设计 | `[官方]` |
| 已知怪癖 | 评论偶尔消失，文档建议粘到聊天里 | `[评测:DataCamp]`（不复刻 bug） |

## 6. 变体与版本

- 一次 prompt 可产出**多个布局变体并排**（如 3 个 pricing 页）。`[评测:developersdigest]`
- 无内建版本控制/diff（原版承认的 gap）；分支靠对话："Save what we have and try a completely different approach"。`[评测]`
  - **我们的 BYOK 增强**：保留现有版本下拉（超集，不破坏手感）。

## 7. 输入类型

- 文字 prompt；图片；文档 DOCX/PPTX/XLSX；codebase 引用；**web capture**（从网站抓元素）。`[官方]`

## 8. Design system

- 上手时读 codebase/设计文件，为团队建 design system；此后项目自动套用颜色/字体/组件。`[官方]`
- 生成的结构：`design-system/ tokens.json + components/*.html + guidelines.md`。`[评测:developersdigest]`
- 可维护多套系统。`[官方]`

## 9. 分享与导出

- 分享：private / view-only / comment / edit，组织范围链接。`[官方]`（本地版：本地链接 + 只读快照）
- Export 菜单（右上）：ZIP / PDF / PPTX / standalone HTML / Canva / Adobe / Gamma / Lovable / Miro / Replit / Vercel / Wix / **Claude Code handoff bundle**（tar + README 指令）。`[官方][评测]`
  - 本地版 P0：HTML / ZIP / handoff bundle；PDF/PPTX 次之；第三方集成 stub。

## 10. 生成物技术形态

- **干净 HTML/CSS**（非 React/Vue）；文件系统型项目，agent 逐文件编辑。`[评测:developersdigest]`
- 我们当前实现为单文件自包含 HTML —— 与"文件系统型"有差距，**待实地确认原版粒度**后决定是否升级为多文件虚拟 FS。

## 11. 视觉语言（全部待实地扒取）

- [ ] 配色 tokens（背景/文字/强调色/边框）
- [ ] 字体族与字阶（Claude 品牌用衬线标题 + 无衬线正文，具体值待扒）
- [ ] 间距/圆角/阴影
- [ ] 图标风格
- [ ] 聊天气泡/输入框/按钮的精确样式
- [ ] 画布 chrome（边框、底色、工具栏）
- [ ] 加载/流式动效
- 注：不盗用 Anthropic 商标/logo 原始资产；布局、交互、流程 1:1，品牌标识用中性替代。

## 12. BYOK 差异点（唯一允许的差异）

- 设置里的「模型服务」面板：多 provider、四种格式、自定义 baseURL/model/key。
- 其余一切以原版为准。

## 13. 实地考察清单（登录后执行）

1. 首页全截图 + DOM 读取（布局/字体/颜色）
2. 新建项目流程逐步截图（含保真度选择）
3. 发一个真实 prompt，录生成全过程（步骤条文案、流式节奏、取消按钮）
4. 精修三件套逐一操作：comment pin / 改字 / knobs——记录触发方式与控件外观
5. Export 菜单全展开截图
6. 分享弹窗截图
7. Design system 设置页
8. 读 DOM 抽 design tokens（computed styles）
9. 观察生成物的真实文件结构（单文件 or 多文件）
