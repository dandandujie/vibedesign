---
craft: [typography, typography-hierarchy, color, laws-of-ux]
triggers: [consulting deck, strategy deck, client deck, pitch deck, html slides, 咨询汇报, 战略汇报]
---

# Consulting Deck: Token-Driven Strategy Slides

A polished consulting / strategy deck as one self-contained HTML document with a
built-in horizontal pager and speaker notes.

## Ask three things first (before building)
1. Content / audience / slide count.
2. Tone → pick ONE theme (a `:root` token set: text-1/2/3, bg, accent, …). Suggest
   2–3 that fit the tone.
3. Start point → a full-deck arc (title → agenda → situation → insight →
   recommendation → plan → close) or from scratch.

## Authoring rules (hard)
- **Use tokens, never literal colors** (`var(--text-1)` good, `#111` bad).
- One `.slide` = one logical page; a consistent chrome slot on every slide
  (header / footer / slide number + a progress bar).
- Keep a shared "base" type scale and spacing; layouts are variations on it, not
  ad-hoc.
- One idea per slide; the audience-visible content is spare and confident.

## Speaker notes
Put presenter script in a `<div class="notes" hidden>` per slide (150–300 words),
never on the visible slide. A key (e.g. "S") toggles a notes overlay for the
current slide. (Multi-window presenter view isn't available in the sandbox — a
toggled notes layer is the fallback.)

## Runtime
ONE self-contained `html` deck with an **inline** pager: ← / → keyboard first,
wheel/touch, a dot rail, Esc index. Real CDN webfonts are fine (the iframe allows
them). Tokens from the attached design system or an inline `:root` set. Move
slides with `transform`, not `scrollIntoView`.

_(Artifact shape adapted from open-design's `html-ppt` deck template.)_
