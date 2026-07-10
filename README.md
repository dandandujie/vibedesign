# Vibedesign — Claude Design 的 1:1 本地复刻（BYOK）

目标：使用时**感觉完全在用 Claude Design**——UI/UX/交互/设计逻辑/全流程 1:1，唯一差异是 BYOK（自带模型服务：Anthropic / OpenAI / OpenAI-Responses / Gemini 格式 + 自定义 baseURL）。

- 复刻真值来自**实地考察** claude.ai/design（`docs/field-study.md`、`docs/tokens-field.md`——含整套扒下来的 `--om-*` design tokens），流程规格见 `docs/replication-spec.md`。
- 设计大脑用开源的 [Claude Design 系统提示词 + 14 skills](https://github.com/Trystan-SA/claude-design-system-prompt) 驱动。
- 最终形态：Electron 跨端桌面应用（Win + Mac），当前为本地 web 开发形态。

## 架构

```
Vibedesign/
├─ server/                 Express 薄后端
│  ├─ src/index.ts         SSE 流式聊天 + 配置/项目接口
│  ├─ src/providers/       多格式适配（anthropic / openai / openai-responses / gemini）
│  ├─ src/brain.ts         大脑接线：system-prompt + 14 skills + 运行时说明
│  ├─ brain/               system-prompt.md + skills/*.md（来自开源仓库）
│  ├─ src/config.ts        模型服务配置（本地 .data/，含 key，不入库）
│  └─ src/storage.ts       项目/artifact 版本持久化
└─ web/                    Vite + React + TS 工作台
   └─ src/
      ├─ App.tsx           编排：对话流 / 版本 / 精修回路
      ├─ components/       ChatPanel · Canvas · RefinementOverlay · SettingsModal · TopBar
      └─ lib/              artifact 提取 · SSE 客户端 · inspector 桥
```

## 核心操作流程（复刻自原版）

1. **对话生成** — 左侧自然语言描述 → Claude（带 system prompt + skills）产出自包含 artifact
2. **画布渲染** — 右侧沙箱 iframe 实时渲染
3. **精修** — 开「精修」→ 点选画布元素 → 直接改字 / 调间距·颜色·字号 knobs / 写评论让 Claude 改
4. **版本 / 变体** — 每次生成存一个版本，可切换、导出 HTML

## 运行

### 开发（网页）

```bash
npm install                # 装根依赖（concurrently / electron / electron-builder）
npm run install:all        # 装 server + web 依赖
npm run dev                # 同时起后端(8787) + 前端(5473)
```

打开 http://localhost:5473 → 「设置模型」添加模型服务（Base URL / 模型名 / API Key）→ 开始对话。

### 桌面应用（Win + Mac）

```bash
npm run app                # 构建并本机运行 Electron 应用
npm run dist:mac           # 打 Mac 安装包（dmg/zip）→ release/
npm run dist:win           # 打 Windows 安装包（nsis/zip）→ release/
```

桌面版把 Express 服务内嵌进主进程（端口 8788），数据存在系统 userData 目录，与开发环境隔离。

## 功能清单（对齐 Claude Design 实地考察，docs/field-study.md）

- 首页：衬线大标题 / 输入卡（＋图片、Design system ▾、Template ▾、Model ▾=BYOK）/ 扇形模板卡 / Projects·Design systems·Templates 三 tab
- 生成：澄清问题 → **画布交互表单**（色板/chips/Decide for me/Continue）→ 「Questions answered:」回填 → 流式生成 → ✦ 步骤组 + 文件 chip + 👍👎
- 画布顶栏：↻ / 文件·版本 ▾ / 100% / **Annotate** / **Tweaks** / **Edit** / **Present** / **Share**（含 Export）
- Annotate：左栏 Comments 面板、点选 pin（编号）、Add comment 攒批 / Send to Claude 立即改、批量处理
- Tweaks：描述想调什么 → 模型按 `data-vd-props` 协议声明 → 面板自动渲染滑块/色板 → CSS 变量实时生效 → 可存版本
- Edit：四 tab（Simple 属性 / Pro 图层树 / Code 源码 / Tweaks）+ Discard/Save
- Present：全屏深色演示模式（Esc 退出）
- 多模态：消息可带图片（四种 API 格式全适配）
- Design systems：创建/编辑品牌上下文，注入每次生成
- Share/Export：Copy link、PDF、Standalone HTML、Claude Code handoff bundle

## 技能（14 个，来自开源系统提示词）

生产类：`discovery-questions` `frontend-aesthetic-direction` `wireframe` `make-a-prototype` `make-a-deck` `make-tweakable` `generate-variations`
系统类：`design-system-extract` `component-extract`
审查类：`accessibility-audit` `ai-slop-check` `hierarchy-rhythm-review` `interaction-states-pass` `polish-pass`

在输入框上方的「技能」下拉里为下一条消息启用；不选则由模型按系统提示词自动决定。

## 说明

- 系统提示词让模型**不透露内部机制/技能名**，并按「一个自包含 HTML 文档」的约定交付——这样画布才能干净地渲染与精修。
- inspector 桥注入 iframe 后，序列化时会把自身完全剥离，**精修不污染 artifact 主体**。
