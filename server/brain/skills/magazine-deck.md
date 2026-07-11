---
craft: [typography, typography-hierarchy, color, anti-ai-slop]
triggers: [magazine deck, html deck, html slides, editorial ppt, 杂志风 ppt, 网页 ppt, 幻灯片]
---

# Magazine Deck: Editorial Horizontal-Swipe Slides

A single-file HTML deck in an editorial "electronic magazine" style — one
self-contained document with a built-in horizontal pager.

## Step 0 — commit to a direction and a theme (state them first)
- Pick ONE editorial direction and hold it for the whole deck: Monocle-editorial
  (default) · Wired-tech · Kinfolk-slow · Domus-architectural · Lab.
- Pick ONE theme = 6 `:root` variables (ink/paper/accent/…): e.g. Ink Classic ·
  Indigo Porcelain · Forest Ink · Kraft Paper · Dune. Don't accept a free-form
  hex palette — recolor only those variables.

## Layout skeletons (compose slides from these)
Cover · Act divider · Big numbers · Lead image + text · Image grid · Pipeline ·
Question close · Big quote · Before/after · Lead image + side text.

## Rhythm rules (hard)
Tag every slide `light / dark / hero-light / hero-dark`. Never 3+ consecutive
slides of the same tone. For 8+ slides include ≥1 hero-dark and ≥1 hero-light, and
insert a hero slide every 3–4. Serif for headings, sans for body, mono for
metadata. Load real webfonts from a CDN (e.g. Google Fonts: Noto Serif SC /
Playfair Display / Noto Sans SC / Inter / IBM Plex Mono) — the canvas iframe
allows external fonts. **Icons = inline monoline SVG, never emoji.** CJK
headlines ≤5 chars, `white-space: nowrap`. Images = standard ratios via fixed
`height` (not `aspect-ratio`); styled placeholder blocks for imagery.

## Runtime
Deliver ONE self-contained `html` deck with an **inline** pager script: one
`.slide` per logical page, one `.active` at a time; ← / → and wheel and touch
advance; a bottom dot rail (`aria-current`); Esc shows an index grid. A subtle
**WebGL** fluid/shader background is welcome (the iframe supports WebGL) — keep it
behind the content and pausable. Do not use `scrollIntoView`; move slides with
`transform`.

_(Artifact shape adapted from open-design's `guizang-ppt` deck template.)_
