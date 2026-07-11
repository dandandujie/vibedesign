# Vibedesign 参考 open-design 升级方案（构思稿）

> 调研对象：`github.com/nexu-io/open-design`（本地 clone 于 `/Users/liuchen/Documents/github/open-design`，v0.14.2，pnpm monorepo）。
> 方法：按 Vibedesign **已有功能**聚类，6 路并行深挖 open-design 对应实现，提取「它更好在哪 + 能否移植到我的轻量栈」。外加用户点名的 **Live Artifacts** 与 **HyperFrames** 两块新功能。
> 本文档只做**构思与排期**，不含代码改动。所有 `文件:行号` 均可在实现阶段直接定位。

---

## 0. 两条决定一切的核心洞察

**洞察 1 —— 我和 open-design 的架构层级根本不同，不能照搬。**
open-design 是一整个**本地优先设计平台**（apps/{web,daemon,desktop} + 15 packages + 166 skills + 155 design-systems + plugins/MCP 生态）。它的很多复杂度（`OD_TOOL_TOKEN` 授权、CLI wrapper、MCP、`.file-versions/` 磁盘快照库、daemon 管项目目录）**只是因为它把生成工作外包给外部不可信 CLI agent（Claude Code / Codex / Cursor…）**。

Vibedesign 是**直接调模型 + 自己控制 iframe 桥**，我自己的 Express server 就是可信方。所以这**一整层平台设施可以整个跳过**。正确策略 = **「大量搬内容资产 + 挑少数自包含的纯函数/脚本机制」**，绝不搬它的 React/daemon 架构。

**洞察 2 —— 「谁是真值」的分歧，决定了哪些能抄、哪些不该抄。**
- **Vibedesign：iframe 里的活 DOM = 真值**（改样式 = 直接改 DOM，保存 = 序列化 DOM 回 HTML）。
- **open-design：HTML 源码字符串 = 真值，iframe 只是「选择面」**（`specs/current/manual-edit-mode-requirements.md:150` 原文：*The preview iframe is the selection surface, not the state owner*）。

结论：open-design 的**源码-patch 真值模型不要整体照搬**（我的 DOM 真值模型在「即时改样式无闪烁」上反而更简单占优）。真正该补的是它那套**能独立移植的硬骨头**：稳定元素定位、内联编辑、校验护栏、沙箱隔离、结构化评论上下文。

---

## Part A — 已有功能的升级点（只学我有的功能）

按主题归并 6 路调研，去重后按「投产比」标注 Port（近乎照搬）/ Adapt（改造适配）/ Skip。

### A1. 安全与稳健性（几乎零成本，止损级，建议最先做）

| 编号 | 判定 | 技术点 | 现状问题 | 做法 | 参考 |
|---|---|---|---|---|---|
| A1-1 | **Port** | `extractArtifact` 后加 HTML 校验门控 | 我抓到什么都往画布塞/成版本；模型把散文塞进围栏会污染 | 抄 `validateHtmlArtifact`（纯函数）：必须 `<!doctype html>`/`<html` 开头、≥64 字符，否则拒绝 | `apps/web/src/artifacts/validate.ts:57`、`recover.ts:92` |
| A1-2 | **Adapt** | postMessage 加来源校验 | `Canvas.tsx:98` 任何 window 都能伪造 `{__vd:true}` | `onMessage` 首行加 `if (e.source !== iframeRef.current?.contentWindow) return`（1 行） | `FileViewer.tsx:8041` `isOurPreviewIframeSource` |
| A1-3 | **Adapt** | 编辑命令护栏 | `inspector.ts:340` `applyText` 无脑 `textContent=` 会吃掉含 `<strong>` 的子结构；`setAttr` 无保护 | `applyText` 前若 `selected.children.length>0` 拒绝；`setAttr` 保护 `data-vd-*`、校验属性名合法、空串才删 | `edit-mode/source-patches.ts:130-134, 594-613` |
| A1-4 | **Port** | 预览焦点守卫 | 我完全没防；artifact 流式渲染时 `el.focus()` 会把宿主页面滚走/抢焦点 | 抄 `injectPreviewFocusGuard`：重写 `focus`，只有近 1s 内有真实用户输入才放行（~30 行自包含脚本） | `runtime/srcdoc.ts:1160-1201` |
| A1-5 | **Adapt** | 更安全的 PDF 弹窗 | `SharePopover.tsx:47-52` `w.document.write(artifactHtml)` = 同源跑未信任脚本 | 换成同源外壳 + 沙箱子 iframe 装 artifact | `runtime/exports.ts:1195` `buildSandboxedPreviewDocument` |
| A1-6 | **Adapt** | Inspect 白名单值消毒 | `setVar/applyStyle` 套任意值 | CSS 属性白名单 + 不安全值正则；持久化时不信任原始 css 字符串、按白名单重推导 | `srcdoc.ts:1268-1286` |

### A2. 手动编辑体验（最大一次性提升，彼此配套；建议成组做）

| 编号 | 判定 | 技术点 | 为什么更好 | 做法 | 参考 |
|---|---|---|---|---|---|
| A2-1 | **Adapt** | 稳定 id 注入取代实时 cssPath（**地基**） | 我 `inspector.ts:35-48` cssPath 编辑后会指错、无法映射源码、pin 会飘 | 注入时给可选元素补 `data-vd-id="path-N-N-N"`（过滤注入节点算索引）；`select/selectByPath` 优先按属性命中；**serialize 时剥掉**（像现在剥 `data-vd-inspector`） | `edit-mode/bridge.ts:16-39,177-195`、`srcdoc.ts:948-958` |
| A2-2 | **Port** | 内联文本编辑：点击落光标 + 提交纪律 | 我现在要「画布选中 → 右侧 textarea 打字」，反直觉；这是体感差距最大处 | 对 `kind∈text/link` 叶子节点：`caretRangeFromClick` → `contenteditable="plaintext-only"` 就地打字；**绝不在 iframe blur 提交**（移到宿主浮层会 blur），只在 Enter/Esc/切目标/退出模式提交 | `edit-mode/bridge.ts:405-502`；宿主侧 `FileViewer.tsx:8084-8124` |
| A2-3 | **Port** | keydown 守卫（配 A2-2） | 内联打字会误触发原型自身快捷键（游戏 WASD、deck 方向键翻页） | 抄 `buildManualEditKeyboardGuard`：编辑态时吞掉原型注册的 keydown | `edit-mode/bridge.ts:84-165` |
| A2-4 | **Adapt** | 元素发现白名单 + kind 分类 | 我 `inspector.ts:115-120` 点谁选谁，含无意义 wrapper/空 span | click 时 `closestTarget` 向上找到语义白名单标签再选；`describe()` 加 `kind`（text/link/image/container）驱动 EditPanel 分支 | `edit-mode/bridge.ts:1-2,74-82,394-404` |

### A3. 评论/批注（质量提升最大、成本最低）

| 编号 | 判定 | 技术点 | 为什么更好 | 做法 | 参考 |
|---|---|---|---|---|---|
| A3-1 | **Port** | 结构化评论上下文 + 硬作用域约束（**第一优先**） | 我发给模型只有一句评论文本，模型容易越界乱改兄弟/父/全局 | 发送时把每条评论渲染成带 `selector/position/currentText/computedStyle` 的块，头部加硬约束「只准改点名元素，不准动全局/兄弟/父级，越界先问」。纯字符串、零依赖 | `apps/web/src/comments.ts:439-494` |
| A3-2 | **Adapt** | pin 随元素实时重定位 | 我 pin 是打点时静态算 `frameOffset+rect`，滚动/缩放/重渲染后不跟随 | 预览重渲染时按 selector 重新 `getBoundingClientRect` 重算 pin 位置（依赖 A2-1 稳定 id） | `comments.ts:201-240` |
| A3-3 | **Adapt** | 视觉标注（截图上手绘框/笔画/文字再发模型） | 我完全没有的批注粒度，「说不清就画给它看」 | 新增绘制 overlay + 截图桥，`markKind(click/stroke)` + 截图打包给模型 | `PreviewDrawOverlay.tsx` + `comments.ts:326-351` |

### A4. 设计大脑（**最高 ROI**：大量内容资产可直接搬，零架构风险）

| 编号 | 判定 | 技术点 | 为什么更好 | 做法 | 参考 |
|---|---|---|---|---|---|
| A4-1 | **Port（内容）** | 整个 `craft/` 13 篇设计法则文档 | 我的 `ai-slop-check`/`accessibility-audit` skill 内容质量远不如它（它给可校验 hex 清单、P0/P1/P2 分级、laws-of-ux） | 拷 `craft/*.md` 进 `server/brain/craft/`；先当增强版正文替换我现有对应 skill | `craft/anti-ai-slop.md:14-41`、`craft/README.md` |
| A4-2 | **Port（内容）** | anti-slop「七宗罪」+ P0 hex 黑名单 | 这是「每次生成都该叠加」的通用约束，不该藏在手选 skill 里 | 把七宗罪那段拼进 `brain.ts:44` 的 `RUNTIME_ADDENDUM`，**每轮生效** | `craft/anti-ai-slop.md:14-65` |
| A4-3 | **Adapt** | skill YAML frontmatter + `craft.requires` 按需注入 | 让 skill 声明需要哪些法则、只注入需要的省 token；分类下沉到后端 | 给 14 个 skill 顶部加 frontmatter；`loadSkills`（`brain.ts:21-33`）解析；新增 `loadCraftSections`（仿 `craft.ts:20-45`，~30 行）；`buildSystem` 在 DS 后、skill 前拼 craft | `apps/daemon/src/craft.ts:20-45`、`skills.ts:64-99` |
| A4-4 | **Port（内容）** | 155 个 DS 的 `DESIGN.md` + `tokens.css` | 现成高质量品牌语料（apple/linear/claude…），我的 DS 全靠用户手写 | 拷若干进我的 DS 存储做内置预设 | `design-systems/apple/{DESIGN.md,tokens.css}` |
| A4-5 | **Adapt** | DS 升级：9 段结构 + token 剥离成 `:root` 契约 | 把 DS 从「一段文本」升级成「9 段散文 + 可逐字粘贴的 token 契约」，anti-slop 才能落地（禁契约外裸 hex） | `DesignSystem` 加可选 `tokensCss` 字段；注入时单独成块「## 设计系统 tokens（逐字粘进第一个 `<style>`）」；`design-system-extract` skill 产出 9 段模板 | `apps/daemon/src/prompts/system.ts:775,796-800`、`design-systems/_schema/AGENTS.md` |
| A4-6 | **Adapt** | 多 skill 组合注入 | 我现在只能选 1 个 skill；组合能「prototype + make-tweakable + a11y」叠加 | `buildSystem` 接收 `skillIds[]`，循环拼 `## Composed skill —` 块 | `apps/daemon/src/server.ts:3541-3584` |
| A4-7 | **Adapt** | `SKILL_ID_ALIASES` + user skill 影子覆盖 | 我一旦重命名 skill，老会话就静默丢 prompt | 加别名 map；支持 `USER_SKILLS_DIR` 同名覆盖内置 | `apps/daemon/src/skills.ts:22-27,5-7` |
| A4-8 | **Port（内容）** | 117 个 design-templates 的 baked `example.html` | 我的模板卡缺「可预览成品」；它每个模板都有可直接进 iframe 预览的 HTML，且模板本身是带 frontmatter 的可注入 skill | 选几个 prototype/deck 模板的 `example.html` 做内置模板预览资产 | `design-templates/dashboard/example.html` |

### A5. 澄清流程 / Composer

| 编号 | 判定 | 技术点 | 为什么更好 | 做法 | 参考 |
|---|---|---|---|---|---|
| A5-1 | **Adapt** | `direction-cards` 澄清卡类型 | 我 `palette` 只有 2 色预览；它一张卡 = 色板 + serif/sans 活体「Aa」样本 + mood + 真实参考物，直接对应 `frontend-aesthetic-direction` | vdform JSON 加 `type:"direction"` + `DirectionCard` 字段；`QuestionFormView.tsx` 加卡片渲染分支 | `apps/web/src/artifacts/question-form.ts:51-82` |
| A5-2 | **Adapt** | 澄清答案结构化回填 | 我回填纯文本「Questions answered:」；它 `[form answers — id]` + `label [value: xxx]`，模型既懂人话又拿到机器值 | 改 `QuestionFormView` 提交格式 | `question-form.ts:691-709` |
| A5-3 | **Skip** | Lexical @-mention composer + HomeHero chip-rail | `HomeHero.tsx` 5004 行 + Lexical，重且与我 ChatPanel 架构不合 | 不搬；若要「意图轨」只借 `home-hero/chips.ts` 纯数据表思路用现有按钮实现 | `home-hero/chips.ts` |

### A6. Artifact 模型 / 流式 / 版本

| 编号 | 判定 | 技术点 | 为什么更好 | 做法 | 参考 |
|---|---|---|---|---|---|
| A6-1 | **Adapt** | 流式解析升级为增量事件 + markdown 跳过区 | 我每帧重跑正则；聊天里「引用」了一段 ```` ```html ```` 会被误抓进画布 | 用 `createArtifactParser` 的增量 `feed/yield` 事件模型 + `markdown-context` 跳过区替换正则；可保留 ```` ```html ```` 围栏只 adapt 跳过区 | `apps/web/src/artifacts/parser.ts`、`markdown-context.ts`、`strip.ts:338` |
| A6-2 | **Adapt** | 版本溯源 + 去重 | 我版本无 source/prompt 血缘、无去重 | `ArtifactVersion` 加 `source: 'ai'\|'manual'\|'restore'` + `prompt` + `restoreFromVersionId`；追加前判 `html===最新版` 去重（我内联存储已白送非破坏恢复） | `apps/daemon/src/project-file-versions.ts:21-35,544-566` |
| A6-3 | **Adapt** | 精简 manifest + renderer registry | 我是 HTML-only；它 React/Markdown/SVG/Deck 都是一等公民 | version 记录内联加 `{kind,renderer,title,exports,status}` + `{id,supportsStreaming,renderPartial?,canRender}` 注册表。解锁：①后续多类 artifact ②status 驱动流式 ③exports 驱动导出菜单 | `apps/web/src/artifacts/{types.ts:34-59,renderer-registry.ts,manifest.ts}` |
| A6-4 | **Adapt** | `supportsStreaming`/`renderPartial` 门控 | HTML 边流边渲会闪半成品布局；它 HTML 等 `complete` 才渲、markdown 才真流式 | 加最小 renderer 抽象；**做成开关**（我现在的即时 live 渲染也是一种即时反馈优点） | `renderer-registry.ts:11-23`、`ProjectView.tsx:3961-4006` |
| A6-5 | **Adapt** | transcript 压缩 | 我 `message.content` 仍留大段带围栏 HTML，项目 JSON 臃肿 | 聊天存指针，HTML 只存 version | `strip.ts:253` `summarizeArtifactsForTranscript` |
| A6-6 | **Adapt** | data-vd-props 扩旋钮词汇 + 持久化 | 我只有 `range/color` | 扩 `scale/density/motion`（calc 倍率）+ localStorage（按 artifact id）+ `prefers-reduced-motion` 默认 | `design-templates/tweaks/{SKILL.md,assets/wrap.html}` |

### A7. 换肤（**全新能力，用户价值高，自包含可移植**）

| 编号 | 判定 | 技术点 | 为什么值得做 | 做法 | 参考 |
|---|---|---|---|---|---|
| A7-1 | **Adapt** | Palette 换肤 bridge | **对任意生成 HTML 一键换整套配色家族，完全不需要模型配合** —— 我目前完全没有这个维度 | 把 `injectPaletteBridge` 那段自包含 IIFE 贴进 `inspector.ts`：host 发 `od:palette` → iframe 内遍历所有样式表 + computed style，把每个有彩度的颜色按 HSL 做 hue-shift（保饱和/明度），连 `:root` 自定义属性也改写。工具栏加调色板选择器 | `runtime/srcdoc.ts:738-931` |

### A8. 分享 / 导出

| 编号 | 判定 | 技术点 | 为什么更好 | 做法 | 参考 |
|---|---|---|---|---|---|
| A8-1 | **Port** | 升级 handoff bundle：`DESIGN-MANIFEST.json` + 富 `HANDOFF.md` | 我现在只有一句话 README；它是机器可读交付契约（screens/roles/tokens/interactions/响应式视口矩阵/checklist），纯字符串生成、零依赖 | 替换 `SharePopover.tsx:54-65` `exportBundle` | `runtime/exports.ts:138-363` |
| A8-2 | **Port** | `exportAsMd`（源码原样导出 .md） | 方便喂进 LLM 上下文 | SharePopover 加一项，几行 | `exports.ts:365-373` |
| A8-3 | **Port** | 图片导出 UX 打磨 | 原生保存对话框 + 复制图片到剪贴板 | PNG 导出加 `showSaveFilePicker` + `ClipboardItem`，失败降级现有 `a.click()` | `exports.ts:527-556,699-742` |

### A9. 演示模式（后置——前提是支持多页 deck）

| 编号 | 判定 | 技术点 | 说明 | 参考 |
|---|---|---|---|---|
| A9-1 | **Adapt/后置** | 讲者模式（独立窗口 + 备注 + 计时器 + 翻页） | 价值高但前提是设计本身是多页 deck；我当前多为单页 artifact，收益有限。建议引入 deck 结构后再做 | `runtime/speaker-notes.ts`、`FileViewer.tsx:8828` |

---

## Part B — Live Artifacts（用户点名的新功能）

> **MVP 已实现并前后端验证通过（2026-07-11）。** 决策：```vdlive 块创建 + model_prompt & http_json 刷新源。
> 落地：`server/src/liveArtifacts.ts`（store + `renderLiveHtml` 标量插值/HTML转义/安全校验 + `refreshLiveArtifact` all-or-nothing）+ `index.log` 路由（list/get/create/preview(CSP)/refresh/delete）；`web/src/lib/{artifact.ts(extractLiveSpec), liveApi.ts}` + `LiveArtifactViewer.tsx`（预览iframe/Data/来源 tab + 刷新）+ `EditorPage.tsx`（onDone 检测 vdlive→创建→渲染）+ `projects.ts(liveArtifactId)` + `brain.ts`（vdlive 教学）。
> 验证：web+server `tsc` + 生产 `build` 全过；**curl 端到端**：create→preview(占位)→refresh(拉 GitHub facebook/react→246394 stars)→preview(真实数据)→CSP 头正确；**真窗口**：viewer 渲染初始数据、点「刷新」拉取 vercel/next.js→140836、时间戳更新、无整页刷新。跳过了整个 token/CLI/MCP 层（洞察 1）。

### 进阶档 · 锁/快照/审计/回滚/恢复 —— **已实现并前后端验证通过（2026-07-11）**
把 Live artifact 做成**单机生产可用**（跳过 OAuth 连接器）。每个 artifact 一个 sidecar 目录 `.data/live-artifacts/<id>/`：`refresh-state.json`(单调 refreshId 计数)、`refresh.lock.json`(wx 独占锁)、`refreshes.jsonl`(append-only 审计)、`snapshots/<refreshId>/data.json`(每次成功/创建的快照)。
- 落地：`liveArtifacts.ts`（锁/单调 refreshId 防陈旧写、每次刷新写快照+审计、`rollbackLiveArtifact` 非破坏回滚、`recoverStaleLiveRefreshes` 启动崩溃恢复、创建写 baseline 快照）+ `index.ts` 路由（`/refreshes` 审计、`/rollback` 回滚、启动调恢复、创建调 initAudit）；`LiveArtifactViewer.tsx` 加「刷新历史」tab（事件徽标+时间+摘要+每个快照「回滚到此」）+ `liveApi.ts` + CSS；`deleteLiveArtifact` 一并清 sidecar。
- 验证：`tsc`+`build`+`bundle` 全过；**curl 端到端**：create→baseline 快照(refresh-000000)+created 审计→refresh→单调 refreshId(000001)+started/succeeded 审计+快照→rollback 到 baseline 恢复 init 数据；**锁**：手放锁文件→refresh 得 REFRESH_LOCKED；**崩溃恢复**：设 running+留锁→重启→启动日志「recovered 1 stale refresh」+状态 failed+锁清+可再刷新；**真窗口**：刷新历史 tab 渲染 3 行(成功/开始/创建)、点「回滚到此」→数据恢复 init+新增「回滚」审计条目。

### 本质
- **Normal Artifact** = 一份静态自包含 HTML，一次生成即死文件。
- **Live Artifact** = 把「展示层」和「数据层」拆开存储（`template.html` + `data.json`），数据层可被「刷新」——重新拉只读数据源 → 按声明式映射写回 `data.json` → 用同一模板重渲染。有锁、有快照、有审计、失败不毁旧版。
- 一句话区别：**Normal 刷新 = 让 agent 从头重画；Live 刷新 = 只换数据不换设计，且不需要 agent 参与**（服务端自己跑数据源）。

### 数据模型（`packages/contracts/src/api/live-artifacts.ts`）
- `LiveArtifact` record（:78-94）：id/title/slug/status/preview{type,entry}/refreshStatus/时间戳/`document`。
- `LiveArtifactDocument`（:37-46，**分离核心**）：`templatePath`（设计层，agent 写）/ `generatedPreviewPath`（派生）/ `dataPath`（数据层，权威）/ `dataJson`（派生缓存）/ `sourceJson`。
- `LiveArtifactSource`（:48-63，刷新声明）：`type: local_file|daemon_tool|connector_tool` + `input` + `outputMapping{dataPaths, transform: identity|compact_table|metric_summary}` + `refreshPermission`。
- 落盘（`apps/daemon/src/live-artifacts/store.ts:16-25`）：`.live-artifacts/<id>/` 内含 `artifact.json / template.html / data.json / index.html(派生) / provenance.json / refreshes.jsonl / refresh.lock.json / snapshots/<refreshId>/`。

### 生命周期
- **创建**：先写 `tmp-<hex>/` 再 rename（原子），同时渲染出 index.html。发 SSE `created`。
- **刷新**（核心，`refresh-service.ts:108-248`，只有手动、无定时）：拿锁（`wx` 独占 `refresh.lock.json`）→ 分配单调 refreshId → `running` → 校验权限 → 执行只读数据源（带超时）→ `outputMapping` 映射 + `deepMerge` 进 data.json → **先写 snapshot 再原子提交** → append `refreshes.jsonl`。失败保留旧 data/preview（all-or-nothing）。
- **渲染**：`GET /api/live-artifacts/:id/preview` → `template + data → html` + CSP 头 → iframe `src`（靠 reloadKey 强制刷新）。

### 模板引擎（`render.ts`，仅 84 行，**可整段照抄**）
- 只支持标量插值 `{{data.path.to.value}}`，默认全 HTML 转义，禁止裸插值 `{{{}}}`，安全预校验拦 `<script>`/`on*=`/`javascript:`。
- **两个坑**：① spec 承诺的 `data-od-repeat` 数组重复指令**没实现**（数组要手动展开 `rows.0…rows.13`）；② 预览 CSP `script-src 'none'`——**live 预览跑不了 JS**，和我现在能跑 JS + `window.claude.complete` 的静态 artifact 是两种安全模型，别混。

### 移植到 Vibedesign（可跳过整个 token/CLI/MCP 层）
**关键设计决定：刷新数据源怎么和现有 `window.claude.complete` 桥结合？**
- **方向 A（推荐）**：source 加一种 `type: 'model_prompt'`。刷新时**服务端**用 BYOK key 调一次模型（复用现有模型调用代码），prompt = 「按此 schema 返回 JSON」，写回 data.json。等于把 `window.claude.complete` 的「客户端一次性补全」升级成「服务端可持久化、可重复、可审计」。再加 `type: 'http_json'`（fetch URL）+ `type: 'local_file'` 覆盖 80% 场景。
- **方向 B**：live HTML 里保留刷新按钮，iframe 内调 `window.claude.complete` 拿新 JSON 客户端重渲染。不落服务端、无历史，适合纯 demo。

**三档：**
- **MVP（2-3 天）**：record `{id,title,templateHtml,dataJson,source,refreshStatus,...}` 落盘 → 抄 `render.ts` 服务端渲染套 CSP → `POST /create` + `GET /preview` + `POST /refresh`（先不加锁/快照）→ 前端 artifact viewer 加刷新按钮 + Data tab。source 先做 `http_json` 或 `model_prompt` 一种。
- **进阶（~1 周）**：+ outputMapping/transform + all-or-nothing 回退 + `refreshes.jsonl` + `snapshots/` + 刷新锁 + 单调 refreshId 防陈旧写 + provenance + SSE 事件 + 3 种 source。
- **完整（数周）**：OAuth 连接器 + 只读安全分类 + 崩溃恢复。除非要接第三方 SaaS，进阶档已够。

**可直接抄**：`render.ts`（renderHtmlTemplateV1 + 安全校验 + 转义）、`http-helpers.ts` 的 CSP/sandbox 头、`schema.ts` 的 bounded-JSON 约束 + 禁用键黑名单（`raw/token/secret/...` 防把凭证写进文件）。

---

## Part C — HyperFrames（用户点名的新功能）

> **MVP 已实现（2026-07-11）。** 关键洞察落地：HyperFrame = 会自播放的动效 HTML = 一个普通 ```html artifact，所以「生成 + 预览」两半**由现有管线免费提供**（动效 HTML 丢进现有 sandbox iframe 就自动播放）。
> 落地：`server/brain/skills/make-motion.md`（新技能，教模型输出自包含循环动效 HTML：4-8s 无缝循环、只动画视觉属性、确定性、`prefers-reduced-motion` 兜底；craft=[typography,color]，triggers 含 motion/动效/hyperframe）。**导出走现有 Standalone HTML**（循环动效 HTML，任意浏览器播放，清晰、分辨率无关，是最理想的动效交付物）+ 封面 PNG。
> 验证：`tsc`+`build` 全过；make-motion 大脑装配 6/6（frontmatter/craft/body 注入）；服务端加载 15 技能含 make-motion；真窗口动效 HTML 在现有 iframe 渲染（CSS animation 在真实聚焦标签页播放；自动化环境动画被节流是 harness 限制）。
> **导出取舍（诚实记录）**：曾试做客户端 GIF 导出（modern-screenshot 逐帧 + gifenc），但逐帧截图太慢（40s+ 未完）且自动化环境动画被节流，**已撤除**。

### 进阶档 · 视频导出 —— **已实现并前后端验证通过（2026-07-11）**
洞察落地：**CSS `@keyframes` 动画通过 Web Animations API（`document.getAnimations()` + `currentTime`）就能 seek**，不需要模型用特殊 API。服务端 Playwright 无头 Chromium 暂停所有动画→逐帧 `currentTime = f/fps` seek→`page.screenshot`→ffmpeg 编码 MP4/WebM。**确定性 seek 绕开了动画节流**（每帧都是时间轴精确位置）。
- 落地：`server/src/motionRender.ts`（从动画读循环时长/暂停/逐帧 seek+截图/ffmpeg 编码；fps/尺寸/时长/格式可配；MAX_FRAMES=900 上限）+ `index.ts` `POST /api/render-motion` 路由；`SharePopover.tsx`「视频 MP4」导出项；`build.mjs` 把 playwright/ffmpeg-static 标 external。
- 依赖：`playwright`（复用系统已缓存 chromium-1228）+ `ffmpeg-static`（+ 系统 ffmpeg 8.1 兜底）。
- 验证：server `tsc` + `bundle` + web `build` 全过；**curl 端到端**：脉动圆球动效→640×360 MP4、**72 帧**（24fps×3s，循环时长从 `animation:pulse 3s` 自动推出）、h264、3.9s 出片；**真窗口**：Share→「视频 MP4」→无头渲染 1280×720/30fps→下载 28925 字节 video/mp4 blob。
- **打包注意**：Electron 生产包若要视频导出，需随包附带 playwright + 一个 Chromium + ffmpeg（dev/tsx 已可用；`external` 已让 bundle 构建通过）。

### 本质
**HyperFrames = 「HTML 就是视频的源真值」。** 用 HTML+CSS+GSAP（或 Remotion TSX）把动画写成一条**可暂停、可精确 seek 的时间轴**；导出时用无头 Chrome 把时间轴 seek 到 `t=frame/fps`、对 DOM **逐帧截图**，再编码成 MP4/WEBM。
- 走 `kind: video` 但 `videoModel: "hyperframes-html"`——复用 video 后端结构，用本地 HTML 渲染器而非真视频模型。
- **为什么必须确定性**：渲染器要反复 seek 同一时间轴再截图，`Math.random()`/`Date.now()` 会让每次结果不同 → 帧抖动。SKILL 把「禁随机/时间依赖、时间轴 `paused:true`、只动画视觉属性、同步构建时间轴」列为不可协商规则（`design-templates/hyperframes/SKILL.md:333-357`）。

### 仓库里有三层「HyperFrames」（别混）
- **A 真身**：完整动效制作系统，HTML+GSAP → `npx hyperframes render`（puppeteer 逐帧）→ MP4。渲染管线 `apps/daemon/src/media/index.ts:3950-4143`。
- **B 模板库**：23 个成品帧模板（`plugins/_official/video-templates/frame-*`），两种引擎 `hyperframes`(HTML/CSS/GSAP) / `remotion`(React/TSX)。
- **C 轻量 skill**：`skills/video-hyperframes/` —— 一个自包含 HTML：N 个 `<section class="frame" data-duration>` + JS 自动播放 + 进度条。**本质就是普通 HTML artifact**，自己在 iframe 里就是一段「视频」，不导出也能看。

### 和普通 artifact 的关系
**HyperFrames = 「HTML artifact ⊕ 时间轴/帧调度契约 ⊕ 无头截图导出管线」。** 预览阶段**就是**普通 HTML 在 iframe 里跑；只有「导出 MP4」时才触发独立 puppeteer 逐帧管线。

### 移植到 Vibedesign
**核心洞察：我已经拥有「预览」那一半**——一个自播放动画 HTML（CSS keyframes / GSAP / Web Animations API）丢进我现有 sandbox iframe 就是「HTML 动效生成 + 预览」。只需补：(a) 让 LLM 稳定产出动画 HTML 的**提示词契约**，(b) **导出**能力。

- **MVP（1-3 天，纯前端，零新增服务端依赖）**：加「动效」artifact 类型，复用 `video-hyperframes` 提示词模式（N 个全屏 `<section>` + `data-duration` + 自播放 JS + 进度条，不强制 GSAP，CSS 足够）→ 现有 iframe 白嫖预览 → 导出用浏览器原生 `MediaRecorder + canvas.captureStream(30)` 录 WebM 下载。降级：连 WebM 都不做就下载自包含 HTML + 封面 PNG。
- **进阶（1-2 周）**：Express 加 `/api/render-motion`，用 **Playwright** 无头 Chromium 读 `window.__timelines.main` / `data-duration` → `tl.seek(t)` 逐帧 `page.screenshot()` → **ffmpeg** 拼 MP4。直接对标 `media/index.ts:3950-4143`（临时目录隔离、`--workers 1`、超时、流式进度经 SSE）。把「非协商规则」抄进 system prompt。依赖 Playwright(~300MB Chromium) + ffmpeg。
- **Skip**：真视频编码/生成式视频模型（Seedance/Veo/Sora provider）、Remotion 原生引擎（需 `@remotion/bundler` React 编译栈）、上游 `hyperframes` npm CLI 本体、云渲染农场。

---

## Part D — 推荐路线图（按波次）

> 原则：先内容/加固（零架构风险、当天/一两天见效、质量提升最大），再体验（成组配套），最后两个点名大功能。每波做完可独立交付、可停。

**第 0 波 · 止损与加固（当天，纯函数/几行）**
A1-1 HTML 校验门控 · A1-2 postMessage 来源校验 · A1-3 编辑护栏 · A1-4 焦点守卫 · A1-5 安全 PDF 弹窗。

**第 1 波 · 设计大脑内容注入（1-2 天，零机制风险，ROI 最高）**
A4-1/A4-2 搬 craft + anti-slop 黑名单进 RUNTIME_ADDENDUM · A4-3 frontmatter + craft 按需注入 · A4-4 DS 语料 · A4-8 模板 example.html · A4-5 DS token 契约。

**第 2 波 · 手动编辑 & 评论体验（数天，彼此配套）**
A2-1 稳定 id（地基）→ A2-2 内联文本编辑 + A2-3 keydown 守卫 + A2-4 kind 分类 → A3-1 结构化评论上下文 + A3-2 pin 重定位。

**第 3 波 · 新能力（各自独立，按价值挑）**
A7-1 Palette 换肤 bridge（推荐优先，价值高自包含）· A8-1/A8-2/A8-3 导出升级 · A5-1 direction-cards · A6-2 版本溯源去重 · A6-1 流式解析升级 · A6-3 manifest/renderer registry · A3-3 视觉标注。

**第 4 波 · Live Artifacts（点名，独立大功能，MVP 2-3 天）** —— 见 Part B。
**第 5 波 · HyperFrames（点名，独立大功能，MVP 1-3 天）** —— 见 Part C。

---

## Part E — 明确 Skip（别搬整套平台）

- `packages/host/`（桌面 Electron 外壳桥：updater/pdf.print/capture.page/working-dir token）——与我浏览器单页栈无关。
- daemon / MCP / plugin-runtime / sidecar / `OD_TOOL_TOKEN` 授权 / CLI wrapper——外部不可信 agent 才需要，我直接调模型不需要。
- `.file-versions/` 磁盘快照库——我版本内联存 JSON 即可（只搬 provenance 字段）。
- 「agent 写 canonical 文件 + `<artifact>` 当指针」架构——需模型有文件写工具；我「吐围栏 + 正则抽 + 校验」就够（只搬 validate/recover）。
- Figma 导出（`figma-plugin/` + OD Clipper Chrome 扩展 + IR-JSON）、OD Library、`packages/download/`（托管资源下载器，非导出）。
- 服务端像素级导出（daemon + 离屏 Chromium）——我现有 `window.print`/pptxgenjs/`exportPng` 正是它的客户端降级路径，保持现状。
- lazy srcdoc transport、palette/deck/brand-kit 之外的重型 bridge、token-first-tailwind（它自己产品 UI 的 CSS 重构，与 artifact 无关）。
- Lexical @-mention composer + HomeHero chip-rail（5004 行）。

---

## 附 · 关键文件索引

**open-design（`/Users/liuchen/Documents/github/open-design/`）**
- 编辑桥/源码 patch/类型：`apps/web/src/edit-mode/{bridge.ts, source-patches.ts, types.ts}`
- srcdoc 管线（沙箱/shim/焦点守卫/palette/截图桥）：`apps/web/src/runtime/srcdoc.ts`
- 评论：`apps/web/src/comments.ts`；视觉标注 `apps/web/src/components/PreviewDrawOverlay.tsx`
- 导出/演示：`apps/web/src/runtime/{exports.ts, speaker-notes.ts, slide-nav.ts}`
- artifact 模型/流式/校验：`apps/web/src/artifacts/{types.ts, manifest.ts, renderer-registry.ts, parser.ts, strip.ts, validate.ts, recover.ts, markdown-context.ts}`
- skills/craft/DS 注入：`apps/daemon/src/{skills.ts, craft.ts, prompts/system.ts, server.ts:3527-3584}`；`craft/*.md`；`design-systems/_schema/AGENTS.md`、`design-systems/apple/*`
- 澄清表单：`apps/web/src/artifacts/question-form.ts`
- Live Artifacts：`packages/contracts/src/api/live-artifacts.ts`、`apps/daemon/src/live-artifacts/{schema.ts, store.ts, render.ts, refresh-service.ts, refresh.ts, http-helpers.ts}`、`apps/daemon/src/routes/live-artifact.ts`
- HyperFrames：`apps/daemon/src/media/{index.ts:3950-4143, models.ts}`、`apps/web/src/components/home-hero/media-surfaces.ts`、`design-templates/hyperframes/SKILL.md`、`skills/video-hyperframes/{SKILL.md,example.html}`

**Vibedesign（本项目）**
- `server/src/{brain.ts, storage.ts, index.ts, providers/*}`、`server/brain/{system-prompt.md, skills/*.md}`
- `web/src/lib/{artifact.ts, inspector.ts, types.ts, projects.ts}`
- `web/src/components/{Canvas.tsx, EditPanel.tsx, TweaksPanel.tsx, CommentsPanel.tsx, CommentPopover.tsx, SharePopover.tsx, QuestionFormView.tsx, PresentOverlay.tsx}`
- `web/src/pages/EditorPage.tsx`

---

# 第1波 · 设计大脑 —— 文件级实现设计

> 状态：**已实现并验证通过（2026-07-11）**。总原则：全部增量、向后兼容 —— 新字段可选、frontmatter 缺失回退现有行为、craft 未命中静默跳过、现有项目/DS 数据不迁移，未破坏主框架。
> 验证：server+web `tsc` 全过；大脑装配 19/19 断言通过（frontmatter 剥离/标题保留/craft 注入/anti-slop 常驻/DS token 契约块/顺序正确）；`bundle` 产物含 `dist/brain/craft/`；bundle 服务器启动正常、14 skill 全加载。**待用户在真窗口用 BYOK 生成对标 anti-slop 观感（导演验收）。**
> 许可提示：open-design 为 Apache-2.0，其 `craft/` 内容改编自 MIT 的 refero_skill。移植内容时**保留出处标注**（在 `server/brain/craft/README.md` 记一行 attribution），或以其为参考自行撰写等价文档。我项目已 vendor 了开源的 claude-design-system-prompt，做法一致。

## 实现顺序（6 步，前 4 步是机制、后 2 步是内容）

### W1-1 建 craft 内容层（新目录）
- 新增 `server/brain/craft/`，放**精选**法则文档（先做高价值子集，其余后补）：
  `anti-ai-slop.md` · `color.md` · `typography.md` · `typography-hierarchy.md` · `accessibility-baseline.md` · `state-coverage.md` · `laws-of-ux.md`（动效/表单/RTL 可第3波按需补）。
- 每篇 = 一维通用工艺的密集规则表。**关键是 anti-slop 的可校验清单**：默认 Tailwind indigo 精确 hex 黑名单（`#6366f1`/`#4f46e5`/`#8b5cf6`…）、双色 trust 渐变、emoji 当图标、虚构指标、lorem 占位、`--accent` 滥用上限。
- 参考 `craft/anti-ai-slop.md`（84 行）、`craft/README.md`（第三轴定位 + 各文件「何时 require」表 `:77-89`）。
- 注意：open-design 文里的 hex 引用绑定它的 `var(--accent)` 令牌名；我这边**统一到 W1-5 定的令牌约定**（见下）后再落地引用，避免令牌名不一致。

### W1-2 craft 加载器 + buildSystem 接线（按需注入）
- 新增 `server/src/craft.ts`：把 open-design 的 `loadCraftSections`（`apps/daemon/src/craft.ts` 全 45 行）**改成 sync**（我 `brain.ts` 用 `readFileSync`）。签名 `loadCraft(requested: string[]): { body, sections }`：对每个 slug 校验 `^[a-z0-9-]+$`、去重、读 `craft/<slug>.md`、缺文件静默跳过、每篇前加 `### <slug>` 级 3 标题、用 `\n\n---\n\n` 拼接。
- 改 `server/src/brain.ts` 的 `buildSystem`：在 **DS 注入之后、skill body 之前**插一个新块（对标 `system.ts:818-826` 的措辞）：
  `## Active craft references — <sections>\n\n这些是通用工艺规则，叠加在 design system 之上；DESIGN.md 决定用哪些 token，craft 决定怎么用。冲突时品牌赢 token 值，craft 仍管品牌没覆盖的（字距/强调色上限/anti-slop）。\n\n<craftBody>`。
- craft 的 slug 来源 = 当前 active skill 的 `craft.requires`（见 W1-4）；无 active skill 时可给一组默认（如 `[typography, color, anti-ai-slop]`）。

### W1-3 anti-slop 常驻（每轮生效）
- 改 `server/src/brain.ts` 的 `RUNTIME_ADDENDUM`（`brain.ts:44`）：加一段**精简版 anti-slop 硬规则**（七宗罪一句话版 + indigo hex 黑名单 + 「~80% 成熟范式 + ~20% 独到选择」的 soul 原则），让**每一次生成**都带上，而非只在选中某个 skill 时。
- 分工：**常驻 = 精简可校验清单**（RUNTIME_ADDENDUM）；**按需 = 完整 craft 文件**（W1-2，随 skill 的 `craft.requires` 注入完整版）。避免重复膨胀 —— 常驻版只放最关键的「别做什么」，完整版放「怎么做好」。

### W1-4 skill frontmatter + `craft.requires` 映射
- 给 `server/brain/skills/*.md` 顶部加 YAML frontmatter：`name` / `triggers[]` / `od.craft.requires[]`。示例见 `skills/brainstorming/SKILL.md:1-15`。
- 改 `server/src/brain.ts` 的 `loadSkills`（`brain.ts:21-33`）：解析 frontmatter，**从 body 里剥掉 `---` 块**（否则会漏进 prompt），把 `craft.requires`/`triggers` 存进 `Skill` 结构；`title` 优先取 frontmatter `name`，回退现有的首个 `#`。
- **需你拍板的小决策**：frontmatter 解析用 ①新增依赖 `js-yaml`（省心、标准），还是 ②手搓一个极简解析器（零依赖，只认我用到的 name/triggers/craft.requires 简单结构）。我倾向 ②零依赖，因为 frontmatter 结构固定且简单。
- 我这 14 个 skill 的 `craft.requires` 建议映射（实现时随文件写入）：
  - `make-a-prototype` / `make-a-deck` → `[typography, typography-hierarchy, color, state-coverage, anti-ai-slop]`
  - `frontend-aesthetic-direction` / `wireframe` → `[typography, typography-hierarchy, color]`
  - `make-tweakable` / `generate-variations` → `[color, typography]`
  - `accessibility-audit` → `[accessibility-baseline, state-coverage]`
  - `ai-slop-check` → `[anti-ai-slop, color, typography]`
  - `hierarchy-rhythm-review` → `[typography-hierarchy, laws-of-ux]`
  - `interaction-states-pass` → `[state-coverage, accessibility-baseline]`
  - `polish-pass` → `[anti-ai-slop, typography, color]`
  - `design-system-extract` / `component-extract` → `[color, typography]`

### W1-5 DS 升级：9 段结构 + token 契约剥离
- 改 `server/src/storage.ts` 的 `DesignSystem`（`storage.ts:73-78`）：加可选 `tokensCss?: string`（和可选 `category?: string`）。**向后兼容**：老 DS 只有 `content` 照常工作。
- 改 `server/src/brain.ts` 的 `buildSystem`（`brain.ts:89-96`）：当 DS 有 `tokensCss` 时，在 DESIGN.md 散文块之外**再加一个 token 契约块**（对标 `system.ts:796-800`）：
  `## 设计系统 tokens（绑定契约）\n\n把下面的 :root{} 块逐字粘进 artifact 第一个 <style>；此后一律用 var(--*)。不要新造 token、不要改这些值、不要在此 :root 块外写裸 hex。DESIGN.md 是散文，这才是绑定契约。\n\n```css\n<tokensCss>\n````。
- 改 `design-system-extract` skill 的产出契约：输出 **9 段 DESIGN.md**（视觉氛围/色板与角色/排版/组件样式/布局/深度层次/Do's&Don'ts/响应式/Agent Prompt Guide）+ 一个 `:root{}` tokens 块。当前流程是模型吐 ```` ```vddesignsystem ```` 块存成 DS content（`EditorPage.tsx:175-186` + `artifact.ts` `extractDesignSystemSpec`）；扩展为**同时抓一个 tokens 块**存进 `tokensCss`。
- 改 `web/src/pages/DsSetupPage.tsx`：编辑器加一个可选「Tokens（:root CSS）」字段。
- 这是让 W1-3 的「禁止契约外裸 hex」真正能落地的前提（有了逐字契约，anti-slop 才有锚点）。

### W1-6 内置内容资产（可选，增量）
- 内置 2-3 个 design system 预设（自撰 9 段 DESIGN.md + tokens.css，可参考 open-design `design-systems/<brand>/` 的结构，注意 attribution），首页可直接选用。
- 给模板画廊补几个 baked `example.html` 预览（对标 `design-templates/<name>/example.html`），让模板卡从「引导语」升级成「可预览成品」。

## 改动文件清单（第1波）
- 新增：`server/brain/craft/*.md`、`server/brain/craft/README.md`(attribution)、`server/src/craft.ts`
- 改：`server/src/brain.ts`（loadSkills 解析 frontmatter + RUNTIME_ADDENDUM 加 anti-slop 常驻 + buildSystem 接 craft 块 + DS token 契约块）、`server/src/storage.ts`（DesignSystem 加 tokensCss）、`server/brain/skills/*.md`（加 frontmatter）、`server/brain/skills/design-system-extract.md`（9 段 + tokens 产出）、`web/src/pages/DsSetupPage.tsx`（tokens 字段）、`web/src/lib/artifact.ts`（extractDesignSystemSpec 兼容 tokens）
- 不动：前端主流程、Canvas/inspector/EditPanel、现有项目与 DS 数据（新字段可选）

## 验证方式（第1波做完）
1. `tsc`（server + web）过。
2. 起 `npm run dev`，发一条生成请求，在 server 侧打印组装后的 system prompt，确认 craft 段按 skill 的 `requires` 正确注入、anti-slop 常驻段每轮都在。
3. 真窗口生成一个落地页，肉眼核对：不再默认 indigo、无 emoji 图标、无 lorem —— anti-slop 生效。
4. 建一个带 tokensCss 的 DS，生成时确认模型把 `:root{}` 逐字粘进了 artifact。

---

# 第2波 · 手动编辑 & 评论体验 —— 文件级实现设计

> 状态：**A2-1~A2-4 + A3-1 已实现并真窗口验证通过（2026-07-11）；A3-2 持久 pin 按约定后置**。改动集中在 `web/src/lib/inspector.ts`（注入桥）+ `Canvas.tsx` + `EditorPage.tsx` + 评论组件。
> 决策落地：① 工作态带 data-vd-id 存、导出剥离；② 单击进内联编辑；③ A3-2 后置。
> 验证：web `tsc` + `vite build` 全过；18 条纯函数断言（注入位置/新桥函数/serialize clean/stripWorkingAttrs）；**真窗口**（冥想落地页 artifact）实测——20 元素获 data-vd-id、h1 kind=text、点击进 `contenteditable=plaintext-only`、Enter 提交且 vid(v7) 稳定回传、`serialize(clean)` 剥 id 保留新文本、工作态保留 id、keydown 守卫编辑态吞 'a' 放行 Enter、加载/交互零控制台报错。
> 总原则不变：增量、向后兼容（旧 CommentPin 无 vid 时回退 cssPath；旧版本 HTML 无 data-vd-id 时按需补注入）；不破坏「DOM 即真值」的现有模型（我们只补 open-design 的稳定定位/内联编辑/护栏，不换真值模型）。

## 我方现状（对标基线）
- 定位：`inspector.ts:35-48` `cssPath()` 每次选中实时算 `tag:nth-of-type` 链；`CommentPin.path`/`TreeNode.path` 都存它。**编辑打乱兄弟顺序后会指错**。
- 改文字：`EditPanel.tsx:461-471` 右侧 `<textarea>` → `applyText` → `inspector.ts:340` `selected.textContent=`。**不是所见即所得**，且会吃掉含子元素的结构。
- 选中：`inspector.ts:115-120` 点谁选谁（含无意义 wrapper）。
- 评论：`CommentPopover.tsx:29-32` pin 位置 = 打点时 `frameOffset+selected.rect`（静态）；发给模型只有评论文本（`EditorPage.tsx:333-353`）。

## A2-1 稳定 id（data-vd-id）—— 地基
**目标**：给结构元素注入稳定 `data-vd-id`，让选择/pin/重定位在手动编辑（兄弟重排、撤销重做）后不失配；导出时剥离，保持产物干净。

- `inspector.ts`：
  - 新增 `assignIds()`：从 `document.body` 遍历「可选中」元素（见 A2-4 白名单），缺 `data-vd-id` 的补 `data-vd-id="v"+(++idCounter)`；跳过宿主注入节点（`[data-vd-inspector]`/`#vd-draw-layer`/`[data-vd-drawn]`）。`ready` 时跑一次；idempotent（已有的不覆盖）。
  - `describe()` 加 `vid: el.getAttribute("data-vd-id") || ""`。
  - 新增命令 `selectByVid`：`querySelector('[data-vd-id="…"]')`，未命中回退 `selectByPath`。
  - `serialize(clean)`：**工作态序列化保留 data-vd-id**（撤销/存版本/回传模型都带，保证跨手动编辑稳定）；**clean 模式额外剥离 data-vd-id**（用于导出）。命令 `serialize` 增加 `clean` 标志。
- `types.ts`：`SelectedInfo` 加 `vid: string`。
- `Canvas.tsx`：`serialize(clean?: boolean)` 透传；`CanvasHandle` 类型更新。
- `projects.ts`：`CommentPin` 加 `vid?: string`。
- **导出干净化**：新增工具 `stripWorkingAttrs(html)`（正则去 ` data-vd-id="…"`），在导出/演示路径调用——`SharePopover.tsx`（PDF/HTML/bundle/PNG/PPTX 用 activeVersion.html 处先过一遍）、`PresentOverlay`、`EditorPage.openInNewTab`、SkillsModal 的 save-pdf。
- **权衡（要你拍板 ①）**：存进 `ArtifactVersion.html` 的是**带 data-vd-id 的工作态**（open-design 同款：id 在源码里，导出时剥）。好处：跨手动编辑/撤销/重做/回传模型都稳定；代价：内部存储 HTML 多了 `data-vd-id` 小属性（导出已剥离，用户看不到）。备选：版本存纯净 HTML、每次加载重新注入位置 id——但那样 pin 存的 vid 在重载后会错位。**推荐带 id 存 + 导出剥。**

## A2-2 内联文本编辑（点击落光标 + 提交纪律）
**目标**：编辑模式下点文本元素 → 在点击处落光标 → 就地打字，取代「右面板 textarea」。

- `inspector.ts`：
  - 新增 inline-edit 态：click 命中 `kind∈{text,link}`（见 A2-4）时，`caretRangeFromPoint`/`caretPositionFromPoint` 在点击处落光标 → `el.contentEditable="plaintext-only"`（回退 "true"）→ focus → 记 `editingEl`/`editingOrig`。
  - `finishEdit(commit)`：移除 contentEditable；commit 且变了 → `post({type:"textCommit", vid, path, value})`（文字已在活 DOM，父层只需标脏+快照）；否则还原 textContent。
  - **提交纪律（核心，防 blur 丢焦点 bug）**：只在 Enter（提交）/ Escape（回滚）/ 选中别的元素（先提交）/ 点空白背景（提交）/ 退出编辑模式（提交）时结束；**绝不在 iframe blur 时提交**（鼠标移到宿主浮层就会 blur）。
  - 新增开关命令 `textEdit:bool`：只有 `tool==="edit" && editTool==="select"` 时开；**annotate 模式关**（annotate 下点击仍是打 pin，不进内联编辑）。
- `Canvas.tsx`：处理 `textCommit` → 新 prop `onTextCommit()`。
- `EditorPage.tsx`：`onTextCommit` → `setDirty(true); void snapshot()`（复用现有撤销栈）；`refineActive`/工具切换时给 iframe 发 `textEdit` 开关。右面板 `TypographySection` 的 textarea 保留（并存，偏好键盘/精确编辑的仍可用）。
- **权衡（要你拍板 ②）**：编辑模式 select 下，点文本元素默认进**内联编辑**（同时也选中让面板显示）。这改变了「先选再去右面板改」的现有习惯。可选：单击选中、**双击**才进内联编辑（更保守）。**推荐单击进内联**（对齐 Figma/Claude Artifacts）。

## A2-3 keydown 守卫（配 A2-2）
**目标**：内联打字时不误触发原型自身快捷键（游戏 WASD、deck 方向键翻页）。

- `inspector.ts` 的 `injectInspector`：**新增第二个注入点**——在 `<head>` 开头（用户脚本注册监听之前）注入一小段守卫：patch `EventTarget.prototype.addEventListener`，包裹 `keydown/keyup/keypress` 监听器，当 `window.__vd_editing` 为真且键不是 Enter/Esc/Tab 时跳过原始 handler。主桥在进出内联编辑时置 `window.__vd_editing`。
- 注：这是本波**最微妙**的一处（必须在用户脚本前 patch，所以要第二注入点）。若想降风险，可先只 patch `document`/`window` 两个目标（覆盖 90% 原型），不做全量 prototype patch。

## A2-4 元素发现白名单 + kind 分类
**目标**：只让语义元素可 hover/选中，按 kind 决定点击行为与面板分支。

- `inspector.ts`：
  - `DISCOVERY_SELECTOR`：语义标签白名单（h1-6/p/span/a/button/li/img/label/input/td/th/blockquote/figcaption/strong/em…）。hover/click 时 `closestSelectable(el)` 向上找最近白名单祖先；min-size 过滤（rect≥4px）跳过极小 wrapper。
  - `kindOf(el)`：`text`（有文本的叶子）/`link`(<a>)/`image`(<img> 或有 background-image)/`container`。`describe()` 加 `kind`。
- `EditPanel.tsx`：`TypographySection` 的文字编辑区只在 `kind∈{text,link}` 显示（现在靠 `selected.editable`）。
- 轻量落地：核心就是 `describe()` 加 `kind` + click/hover 加白名单&min-size 过滤，其余分支复用。

## A3-1 结构化评论上下文 + 硬作用域约束（第一优先，纯字符串、零依赖）
**目标**：发给模型的评论/精修带 selector/vid/当前文本/关键 computed styles/位置 + 一段硬约束，压制模型越界乱改。

- `EditorPage.tsx`：
  - 新增 `renderTargetContext(info|pin)`：产出 `<target vid=… selector=… tag=…>当前文本:"…" 关键样式:color/bg/font-size/… 位置:x,y,w,h</target>` 块。
  - `sendTargeted`（有实时 `selected`）→ 用 `selected` 拼**全量富上下文**。
  - `sendAllComments` / `submitCommentToClaude` → 头部加硬约束前言：「只准修改下面点名的元素；不要重构其兄弟/父级布局、不要动全局 CSS 或 design tokens；若某处改动必须触及点名元素之外，先提问。重新输出完整文档。」
  - 为让 `sendAllComments` 也带当前文本：`CommentPin` 加可选 `ctx?: {tag?:string; text?:string}`，打点时从 `selected` 存一份（全局评论无元素则略）。
- `projects.ts`：`CommentPin` 加 `ctx?`。

## A3-2 pin 随元素实时重定位 —— **已实现并验证（2026-07-11）**
**目标**：把「当前只显示选中项一个 pin」升级为「所有未解决评论都在画布上有编号 pin，且随滚动/缩放/重渲染实时跟随」。
> 实现：inspector 加 `getRects` 命令 + scroll/resize 的 rAF 节流 `viewport` 通知；Canvas 加 `getRects`/`onViewport`；EditorPage 加 `pinRects` 状态 + 稳定 `onViewport` + 刷新 effect（annotate/comments/selection/reload/artifact 变化）+ 画布上渲染编号 pin（滚出视口自动隐藏、tooltip 显示评论文本、旧评论无 vid 时按 path 回退）。CSS `.pin-badge.persistent`。
> 验证：`tsc`+`vite build` 过；真窗口（冥想落地页，2 条旧评论）——getRects 桥对 path/vid 均解析、annotate 模式渲染 2 个编号 pin 贴在按钮右上角、**父层跟随链路确证**（真实插入 200px spacer 使按钮下移→发 viewport 消息→pin 精确跟随 +189px→移除后精确复位）。注：iframe scroll 事件发射依赖真实用户滚轮（自动化程序化滚动不触发 trusted scroll 事件，无法在测试环境复现，但 capture 监听已正确注册）。

- `inspector.ts`：新增命令 `getRects(vids[])` → 返回各 vid 当前 `getBoundingClientRect`（相对 iframe）。
- `EditorPage.tsx`：新增持久 pin overlay，渲染所有 open 评论的编号徽标；用 `getRects` + iframe 内 scroll/resize 事件（经 postMessage 通知）+ 选择变化时重算位置。
- **要你拍板 ③**：A3-2 是本波工作量最大的新增（持久 pin 层）。**建议先做 A2-1→A2-4 + A3-1（手感与质量提升的主体），A3-2 作为紧接的可选增量**，避免一次动太多。

## 实现顺序 & 改动文件清单（第2波）
顺序：**A2-1（地基）→ A2-4（kind）→ A2-2（内联编辑）→ A2-3（keydown 守卫）→ A3-1（评论上下文）→ A3-2（持久 pin，可选）**。
- 改：`web/src/lib/inspector.ts`（大头：assignIds/vid/kind/白名单/内联编辑/keydown 守卫/serialize clean/getRects）、`web/src/components/Canvas.tsx`（serialize clean + onTextCommit + 转发新消息）、`web/src/lib/types.ts`（SelectedInfo 加 vid/kind）、`web/src/lib/projects.ts`（CommentPin 加 vid/ctx）、`web/src/pages/EditorPage.tsx`（textEdit 开关 + onTextCommit + 富评论上下文 + 硬约束 + 可选 pin overlay）、`web/src/components/EditPanel.tsx`（文字区按 kind）、`web/src/components/SharePopover.tsx` + `PresentOverlay.tsx`（导出剥 data-vd-id）、`web/src/lib/artifact.ts`（stripWorkingAttrs 工具）。
- 不动：后端、生成大脑（第1波已成）、Tweaks/绘图工具主体。

## 验证方式（第2波做完）
1. `tsc`（web）过。
2. 真窗口：编辑模式点标题就地改字、Enter 提交、Esc 回滚、移到面板不丢失编辑；改完 serialize/存版本，产物**不含** data-vd-id（导出剥离生效）。
3. 手动重排/撤销后，pin 仍指向同一元素（vid 稳定）。
4. 一个带自身键盘快捷键的原型（如方向键翻页），内联打字时不触发其快捷键。
5. 评论发给模型：检查请求体含 `<target>` 结构化上下文 + 硬约束前言。

---

# 第3波 · 新能力（各自独立，按价值挑）—— 文件级实现设计

> 状态：**W3-A/B/C/D 已实现并验证通过（2026-07-11）；W3-E 后续按需**。这一波每项互相独立、可单独交付。全部增量、未破坏主框架。
> 验证：web+server `tsc` + `vite build` 全过；15 条纯函数断言（handoff manifest/tokens/结构/交互检测 + palette 命令/函数存在）；**真窗口**——换肤桥 hue+60° 使 5/10 彩色 token 平移、灰阶不动、复位 10/10 精确还原；UI 点「对比 +180°」预设，呼吸圆环暖棕→冷蓝青、文字/背景/CTA 中性不变、「存为新版本」正确置脏；零控制台报错。
>
> 各项落地文件：W3-A `inspector.ts`(palette 桥) + `PalettePopover.tsx` + `EditorPage.tsx`(换肤按钮)；W3-B `lib/handoff.ts`(新) + `SharePopover.tsx`(bundle/Markdown/存盘对话框/复制剪贴板)；W3-C `lib/artifact.ts`(DirectionCard) + `QuestionFormView.tsx`(卡片) + `styles.css` + `brain.ts`(vdform 说明)；W3-D `types.ts`/`storage.ts`(source/prompt/restoreFromVersionId) + `EditorPage.tsx`(溯源+去重+版本徽标)。

## W3-A 【Palette 换肤 bridge】—— 全新能力，自包含，价值最高
**目标**：对任意生成 HTML 一键换整套配色家族（色相平移，保饱和/明度），**无需模型参与**。这是我完全没有的维度。

- `web/src/lib/inspector.ts`：新增 palette 桥函数 + 命令。
  - 命令 `palette`：`{hueDelta:number, satScale?:number}`（或预设 accent）。
  - 机制：① 优先处理 `:root` 自定义属性——遍历 `document.documentElement` 的 inline/computed 自定义属性，把**有彩度**的颜色值（HSL 饱和度 > 阈值）做 `hue = (hue + hueDelta) % 360`，写回 `documentElement.style.setProperty`（覆盖 token 值，token-based 设计一步到位，尤其第1波 token 契约之后是主流）。② 兜底：扫描 `document.styleSheets` 的 `color/background-color/border-color` 规则，对彩色值 hue-shift，写进一个 `<style data-vd-palette>` 覆盖层。③ 灰色/近黑白（低饱和）不动，避免文字变色。
  - 提供 `paletteReset` 清除覆盖层 + 复原 token。
  - `serialize` 时：palette 覆盖层若要烘焙进版本，则保留（存版本时）；导出 clean 时 `data-vd-palette` 作为工作层可选保留（它是真实样式，属于设计的一部分，**保留**）。
- `web/src/components/`：新增 `PalettePopover.tsx`——工具栏「换肤」按钮 → 弹出色相滑块（−180…180）+ 4-6 个预设方向（暖/冷/单色等）；拖动 → `postCmd({__vd_cmd:"palette", hueDelta})` 实时；「存为新版本」烘焙。
- `EditorPage.tsx`：canvas-head 加「换肤」toggle（与 Annotate/Tweaks/Edit 并列）；接 palette 命令 + 存版本。
- 成本：中（inspector ~80 行 + 一个 popover）。参考 open-design `runtime/srcdoc.ts:738-931`。

## W3-B 【导出升级】—— drop-in，低成本，纯字符串/浏览器原生
**目标**：把「一句话 README」升级成机器可读交付契约 + 加 Markdown/剪贴板导出。

- 新增 `web/src/lib/handoff.ts`：
  - `buildDesignManifest(html, name)` → `DESIGN-MANIFEST.json`（schema 版本 + 从 HTML 解析出的 `:root` tokens 清单 + section/screen 计数 + 响应式视口矩阵 360×800…1920×1080 + interactions/states 提示 + implementation checklist）。纯解析 + 字符串，零依赖。
  - `buildHandoffMd(html, name)` → 详尽的 `DESIGN-HANDOFF.md`（给 coding agent 的交付指令）。
- `web/src/components/SharePopover.tsx`：
  - A8-1：`exportBundle` 换成 zip = `index.html + DESIGN-HANDOFF.md + DESIGN-MANIFEST.json`。
  - A8-2：新增导出项「Markdown（喂 LLM）」→ 把源码作为 ```html 围栏写进 .md 下载。
  - A8-3：PNG/图片导出加 `showSaveFilePicker`（失败降级现有 `a.click()`）+「复制图片到剪贴板」（`ClipboardItem`）。
- 成本：低。参考 `runtime/exports.ts:138-373, 365-373, 527-556`。

## W3-C 【direction-cards 澄清卡】—— 对齐 frontend-aesthetic-direction
**目标**：把「选美学方向」从纯文字选项升级成 色板 + 活体字体样本 + mood 的可视卡。

- `web/src/lib/artifact.ts`：`FormQuestion` 加 `type: "direction"`；options 项结构 `DirectionCard { label, palette: string[], displayFont?, bodyFont?, mood?, references?: string[] }`。
- `web/src/components/QuestionFormView.tsx`：`Question` 加 `type==="direction"` 分支——渲染卡片：色板 swatch 行 + 用 displayFont/bodyFont 显示的「Aa 标题 / 正文样本」+ mood 描述；选中高亮；沿用现有 `onPick(label)`。
- `server/src/brain.ts` 的 `RUNTIME_ADDENDUM`（vdform 段）：补充 `direction` 类型说明 + 示例，让模型在「无品牌、需定美学方向」时输出它（对应 `frontend-aesthetic-direction` skill）。
- 提交回填：`submit` 里 direction 类型输出 `- <id>: <label>（palette+font 已选）`。
- 成本：中低。参考 `apps/web/src/artifacts/question-form.ts:51-82`。

## W3-D 【版本溯源 + 去重】—— 低成本，版本列表 UX 立升
**目标**：版本记录带来源血缘 + 去重，避免重复版本堆积。

- `server/src/storage.ts` + `web/src/lib/types.ts`：`ArtifactVersion` 加可选 `source?: 'ai'|'manual'|'restore'`、`prompt?: string`、`restoreFromVersionId?: string`。向后兼容。
- `web/src/pages/EditorPage.tsx`：
  - `onDone` 存版本时 `source:'ai'` + `prompt`（取最后一条 user 消息前 60 字）；追加前判 `art === 最新版.html` 去重（相同则不追加、只切 active）。
  - `saveVersion`（手动微调）`source:'manual'`；undo/redo 已有。
  - 版本下拉 `option` 文案加来源徽标（🤖 AI / ✎ 手动 / ↩ 恢复）。
- 成本：低。参考 `apps/daemon/src/project-file-versions.ts:21-35,544-566`。

## W3-E（可选，更重）后续项
- **A6-1 流式解析升级**（增量事件 + markdown 跳过区，防聊天里引用的 ```` ```html ```` 被误抓进画布）：改 `web/src/lib/artifact.ts` 的提取为增量解析器。中等成本。
- **A6-3 精简 manifest + renderer registry**（解锁 markdown/svg/react artifact + status 驱动流式 + exports 驱动导出菜单）：架构价值高、中等成本。
- **A3-3 视觉标注** —— **已实现并验证（2026-07-11）**：annotate 模式加「✎ 画笔」，画布上手绘框/箭头/涂画（host 侧 SVG overlay，不碰 artifact DOM）→ exportPng 截全图 + getScroll 取滚动/文档尺寸 → 按真实缩放比把标注合成到截图 → 作为图片评论发模型。文件：`AnnotateDrawOverlay.tsx`(新) + `inspector.ts`(getScroll) + `Canvas.tsx`(getScroll/dw/dh) + `EditorPage.tsx`(sendVisualAnnotation/compositeMarks) + `CommentsPanel.tsx`(画笔开关) + `styles.css`。真窗口：画框渲染、发送按钮启用、getScroll 返回 dw=1169、合成管线产 PNG、零报错。
- **A6-1 流式解析健壮化** —— **已实现并验证（2026-07-11）**：提取 artifact 时 `withoutQuotedFences` 屏蔽 4-backtick 引用围栏，模型用 ```` ```` 引用含 ``` 的代码时里面的 ```html 不再被误抓；strip/open-fence 一并处理。
- **A6-3 renderer registry + markdown 文档类型** —— **已实现并验证（2026-07-11）**：不再是过早抽象——配了**具体的第二种 artifact 类型**。`extractDeliverable(text)` 是注册表分发：html vs ```mddoc（markdown），谁在后面谁是交付物 → 统一返回 canvas-ready HTML + kind。新增 `web/src/lib/mddoc.ts`（原创紧凑 md→排版 HTML：标题/列表/引用/代码块/行内 bold/italic/code/link + 编辑感文档外壳）；`ArtifactVersion` 加 `kind`；`EditorPage` onDone 用 extractDeliverable 存 kind+title；`brain.ts` 教模型对文档类交付物用 ```mddoc。因产物就是 HTML，画布/标注/微调/编辑/换肤/演示/导出/版本**全部复用**。
  - 验证：web+server `tsc` + `build` 全过；16 条纯函数断言（md 渲染各元素 + **真实数字不被占位符误伤的回归** + 注册表 html/markdown/后者胜分发）；**真窗口**：样例内容策略文档在画布渲染为排版精良的编辑体（无衬线标题/衬线正文/带边框 h2/列表/引用/行内代码）。

## 建议优先级
**W3-A（换肤，价值最高）→ W3-B（导出，最省）→ W3-D（版本溯源，最省）→ W3-C（direction-cards）**；E 组按需再挑。

---

## 平台层能力（把 open-design 的平台能力「做进来」，不降级/不适配 sandbox）—— 已实现并验证（2026-07-12）

用户要求：**不要改写成内联自实现或降级适配 sandbox**，而是把平台能力真正建进 Vibedesign。六项全部完成、真窗口验证、分别独立提交：

1. **CDN 字体 + WebGL**（`220d7a0`）：先真窗口验证普通 artifact iframe 本就支持（`allow-scripts allow-same-origin`、无 CSP、WebGL=true、CDN 字体 LOADED）→ 撤回 deck/动效技能里错误加的「禁 CDN/WebGL」限制。**结论：能力本就在，是我此前误加限制。**
2. **PNG/PDF 像素级导出**（`220d7a0`）：`server/src/screenshotRender.ts`（Playwright 无头 Chromium 真渲染 → PNG / print-PDF，正确渲染 CJK 字体 + WebGL，客户端 modern-screenshot 做不到）+ `POST /api/render-screenshot` + SharePopover「PNG/PDF（像素级）」。验证：CJK(Noto Serif SC) 800×2=1600×1800 PNG、`%PDF-`、~1.3s。
3. **copy starter 种子**（`220d7a0`）：捆绑 web-prototype/mobile-app/magazine-deck 的起手模板（`server/brain/skill-seeds/`，Apache-2.0 已署名），技能选中时注入 prompt 作起手（token 系统/设备框/翻页 runtime 已接好）。
4. **inputs 表单**（`1fb0b0c`）：`SkillEntry.inputs?: QuestionForm`，选中带 inputs 的技能后首次发送先弹表单（**复用 QuestionFormView**），答案折进 brief 再生成。纯前端、零服务端改动、走与 pendingForm 相同画布插槽。已为 saas-landing/dashboard/social-carousel/finance-report 声明。
5. **多窗口 presenter**（`1b844b8`）：`web/src/lib/presenter.ts` 从 deck artifact 提取幻灯+备注（兼容 make-a-deck 的 `<deck-stage>`+`#speaker-notes`、consulting/magazine 的 `.slide`+`.notes`），单张独立渲染+letterbox 缩放。控制窗（当前/下一张+备注+计时+计数+←/→）+ 观众窗（全屏），blob URL + BroadcastChannel 同步。接入既有 Present 菜单，仅 `looksLikeDeck` 显示。真窗口：提取/缩放/预览/备注/计时/翻页联动全过。
6. **多文件 + preview.entry**（`9d1d25f`）：**独立渲染路径，完全不碰单文件 Canvas 框架**。`\`\`\`vdfiles` 约定（`entry:` + `=== path ===`）→ `extractFiles`；`ArtifactVersion` 加 `kind:multifile`+`files`/`entry`（`html` 镜像 entry 保兼容）；`server/src/multiFile.ts`+`GET /api/mf/:pid/:vid/*` 从已存版本按路径提供文件（content-type/路径归一化/穿越防护）；`MultiFileViewer.tsx` 预览 iframe（兄弟文件经 /api/mf 相对解析）+ 每文件源码页签 + 落库前 404 重探；`brain.ts` 增 vdfiles 契约（默认仍单文件）。真窗口：三文件演示，styles.css 应用 + app.js 运行（计数 0→2）+ 源码页签；穿越防护仅返回 not found。
</content>
</invoke>
