---
name: site-prototype
craft: [typography, color, laws-of-ux]
triggers: [site prototype, multi-page, user flow, journey, funnel, 站点原型, 多页, 流程原型, 页面流]
---

# Site Prototype Skill — multi-page flow prototypes

Produce a **multi-page, click-through prototype** delivered as ONE `vdsite` block (see the runtime contract's vdsite section). The goal is a coherent *system* of pages — shared tokens, shared chrome, real navigation — not a set of disconnected mockups. Think skeleton → content → refine: get the whole flow standing first, then deepen page by page.

## Workflow

### Step 1 — Confirm the sitemap (vdform, once)

Unless the brief already names the pages, output a `vdform` (no design yet) asking:

- **Pages**: which screens exist (offer a concrete default list as chips, e.g. "首页 / 定价 / 注册 / 引导 / 仪表盘" — 3–7 pages is the sweet spot).
- **Core flow**: the 1–2 journeys that must click through end-to-end (e.g. "落地页 → 注册 → 引导 → 仪表盘").
- **Direction**: a `direction` question for the visual language (palette + type mood), unless a design system is attached.
- **Density**: rich marketing pages vs. functional app screens.

### Step 2 — Generate the full skeleton (one vdsite block)

Emit the COMPLETE site in one `vdsite` block:

1. **`site.json`** — every page `{path, title}` in reading order + the `flows` from step 1.
2. **`styles.css`** — the single source of truth: all tokens in `:root{}` (color, type scale, spacing, radius, shadow), the shared header/nav/footer classes, buttons, cards, form controls. Pages must contain ZERO page-specific `<style>` blocks for shared chrome — page-local layout tweaks only.
3. **One `.html` per page** — each links `./styles.css`, repeats the shared header/footer verbatim (mark the active nav item), and contains real layout + real copy. Prioritize *flow integrity*: every link in the primary journeys resolves to a real page; secondary links may point to the most plausible existing page.

State the page list in one sentence before the block so the user can redirect cheaply.

### Step 3 — Refine per page (iteration turns)

When the user names a page or flow ("把定价页做完整", "引导第三步加上权限请求"):

- Re-output the COMPLETE `vdsite` block — unchanged pages byte-identical, the named page(s) deepened.
- Keep `site.json` and shared `styles.css` unless the change is genuinely global (then say so in one line).
- Deepening a page means: full section rhythm, interaction states, edge cases (empty/loading/error where relevant) — the single-page quality bar applied to that page.

## Hard rules

- **Consistency is the product.** Same tokens, same nav, same footer, same button styles on every page. If a page needs a new component, add it to `styles.css`, not inline.
- **No dead ends in the core flows.** Every step in `flows[*].steps` exists and links forward/back.
- **Mobile reflow included** in `styles.css` (one media query, shared rules).
- **Images are honest placeholders** (styled divs / data-URI), never stock URLs.
- The anti-AI-slop floor applies site-wide: one accent budget per page, no emoji icons, no invented metrics.

## Output contract

Always ONE `vdsite` block (never `html`, never `vdfiles`) while this skill drives the work. Precede it with a `#### <Site name>` line and keep prose outside the block to a minimum.
