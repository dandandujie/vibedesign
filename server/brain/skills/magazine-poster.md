---
craft: [typography, typography-hierarchy, color]
triggers: [magazine poster, editorial poster, newsprint, essay, manifesto, 杂志海报, 报纸版式]
---

# Magazine Poster: Editorial One-Pager

An editorial newsprint-style poster as one self-contained HTML document — an
oversized serif headline commanding a two-column body with six numbered sections.

## Structure
- **Dateline** — a hairline black rule + a typewriter-font line: "01 · A · YOUR
  LAB" on the left, a date on the right.
- **Eyebrow** — a mono tag above the headline.
- **Headline** — 2–3 lines of huge serif; one word struck through (`line-through`
  2px), one word italic in the accent.
- **Deck** — an italic serif subtitle around 60% of the headline size, ending with
  a "— what works" fragment.
- An ~80px accent rule, then a **2×3 grid of six sections**. Each: mono accent
  eyebrow ("01 · SHIP FAST") + bold serif subhead + 2–3 serif sentences + a mono
  callout quote inside a tinted block.
- **Footer band** — three cells + a "PRO TIP" plaque.

## Hard rules
Cream paper background (~`#f3eee2`) with a faint `radial-gradient` grain. CSS grid
two-column; page min-width ~1100px. The strike-through and the italic accent each
appear exactly once. The headline must dominate the page.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set.

_(Artifact shape adapted from open-design's `magazine-poster` design template.)_
