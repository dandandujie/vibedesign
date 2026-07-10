# Claude Design 实地扒取的 Design Tokens（真值）

> 来源：claude.ai/design DOM 实地读取（2026-07-09）。命名空间 `--om-*`。
> 这是视觉校准的**最高优先级真值**。

## 字体

- 标题（衬线）：`"Anthropic Serif Variable", "Anthropic Serif", ui-serif, Georgia, "Times New Roman", serif`
- 正文/UI：`"Anthropic Sans Variable", "Anthropic Sans", ui-sans-serif, system-ui, -apple-system, ...`
- 私有字体不可用 → 本地替代：衬线 `ui-serif/Georgia`（形态接近），无衬线 `system-ui`
- 首页大标题实测：36px / weight 420（variable）/ letter-spacing -0.4px / line-height 1.1 / #0B0B0B

## 核心组件实测

- 首页输入卡片：白底 / radius **17px** / border `1px solid rgba(15,12,8,0.1)` / 双层阴影 / max-width **800px**
- 发送按钮：**#D97757** / 48×48 / radius 10px / 白色图标
- body 背景 `#FAF9F5`，正文色 `rgba(15,12,8,0.92)`

## Token 表（--om-*）

```css
/* 背景 */
--om-bg-app: #faf9f5;
--om-bg-panel: #f8f7f3;
--om-bg-surface: #fff;
--om-bg-elevated: #fff;
--om-bg-hover: #0f0c080a;
--om-bg-active: #e8e6dc;
--om-bg-selected: #e3dacc;
--om-bg-muted: #f0eee6;
--om-bg-stripe: #0f0c0805;
--om-bg-tint-design-system: #f6e3e3;
--om-bg-tint-template: #e4e2f1;
--om-bg-primary-tab-bar: #e8e6dc;
--om-bg-secondary-tab-bar: #f6f5f0af;
--om-bg-error-tint: #a632440d;
--om-bg-intro-splash: #e1dacd;
--om-bg-thumb: #fff;
--om-bg-scrim: #0f0c0866;

/* 边框 */
--om-border-subtle: #0f0c0814;
--om-border-card: #0f0c081f;
--om-border-default: #0f0c081a;
--om-border-strong: #0f0c0838;
--om-border-focus: #0f0c085c;
--om-border-modal: #0000001a;

/* 文字 */
--om-text-primary: #0f0c08eb;
--om-text-prose: #0f0c08cc;
--om-text-secondary: #0f0c08a3;
--om-text-tertiary: #0f0c0899;
--om-text-disabled: #0f0c0852;
--om-text-design-system-badge: #c67878;
--om-text-inverse: #faf9f5;
--om-text-link: #6a9bcc;

/* 强调色 */
--om-accent-primary: #d97757;
--om-accent-primary-bg: #d977571f;
--om-accent-primary-tint: #d977570a;
--om-accent-primary-hover: #c46a4d;
--om-accent-primary-active: #b05e43;
--om-accent-secondary: #6a9bcc;
--om-accent-secondary-hover: #5a8bbb;
--om-accent-secondary-active: #4e7caa;
--om-accent-success: #558a42;
--om-accent-sage: #788c5d;
--om-accent-warning: #c9a82d;
--om-accent-error: #a63244;
--om-accent-error-hover: #992e3f;
--om-accent-error-active: #8d2b3a;
--om-accent-pro: #473aa6;
--om-accent-pro-bg: #e7e4fb;
--om-accent-blue: #2a78d6;
--om-accent-blue-bg: #2a78d61a;
--om-accent-blue-hover: #2569bf;
--om-accent-review: #3987e5;
--om-accent-verifier: #8b6ac8;
--om-accent-verifier-soft: #b7a3dc;
--om-accent-black: #191915;
--om-accent-black-hover: #2b2b26;
--om-accent-black-active: #0f0c08;

/* 滚动条 */
--om-scrollbar-thumb: #00000026;
--om-scrollbar-thumb-hover: #00000040;

/* 阴影 */
--om-shadow-xs: 0 1px 2px #1414130a;
--om-shadow-sm: 0 1px 3px #1414130f;
--om-shadow-md: 0 4px 6px #1414130f;
--om-shadow-diffuse: 0 4px 20px #1414130a;
--om-shadow-lg: 0 10px 15px #14141314;
--om-shadow-inset: inset 0 1px 2px #1414130f;
--om-shadow-modal: 0 24px 48px #0f0c0829, 0 8px 16px #0f0c0814;
--om-shadow-card: 0 18px 44px #1414131a, 0 3px 10px #1414130d;
--om-shadow-pin: 0 2px 6px #00000040;          /* comment pin 实锤 */
--om-shadow-pin-hover: 0 3px 10px #0000004d;
--om-shadow-thumb: 0 1px 2px #0000001f;

/* 演示模式（幻灯片 presenter，深色） */
--om-presenter-bg: #1a1a1a;
--om-presenter-text: #e8e8e8;
--om-presenter-border: #333;
--om-presenter-divider: #2a2a2a;
--om-presenter-slide-bg: #000;
--om-presenter-control-bg: #2a2a2a;
```

## 首页结构（实地）

- 顶栏：左 = 衬线字标「Claude Design」+ 小字 Beta；右 = What's new + 头像
- 中央：衬线大标题 "What will you design today?"
- 输入卡片（800px）内工具条：`+`（附件）| `Design system: None ▾` | `Template: None ▾` | `</>` | 右侧 `Model: Claude Opus 4.8 ▾` + 橙色 48px 发送钮
  - **原版首页就有 Model 下拉** → BYOK 模型选择放同位置，形态一致！
- 模板扇形轮播："Start with a template…" → Prototype / Slides / Document / Wireframe / Animation
- "...or start a blank project →"
- 项目区 tabs：Projects / Design systems / Templates ＋ Search ＋ 星标 ＋ 列表/网格切换
- 右下角贴纸："Set up a design system!"（蓝色爆炸形）
