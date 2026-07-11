---
craft: [state-coverage, color]
triggers: [okr, okrs, key results, objectives, 目标, 季度目标]
---

# Team OKRs: OKR Scorecard

A single-screen OKR tracker as one self-contained HTML document.

## Structure
- **Quarter banner** — "Q4 FY25" + date range + an overall-progress chip.
- **Three objective cards** — each: title + owner avatar + status pill (On track /
  At risk / Off track); inside, 3 key-result rows (metric / current → target / a
  progress bar).
- **Right sidebar** — at-a-glance KPIs, top movers, and a blockers callout.

## Hard rules
Clear progress visualization (CSS progress bars, not images). Calm palette, one
accent. Status pills use color + a label (never color alone). Numbers use tabular
figures. Semantic HTML; accent ≤2 times.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set.

_(Artifact shape adapted from open-design's `team-okrs` design template.)_
