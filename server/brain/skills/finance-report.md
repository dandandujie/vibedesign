---
craft: [state-coverage, color, typography]
triggers: [financial report, quarterly report, p&l, mrr review, 财报, 财务报告]
---

# Finance Report: Exec Financial Summary

A single-screen financial report as one self-contained HTML document.

## Structure
- **Masthead** — company / period + a "Confidential — Finance" badge.
- **KPI strip** — 4 cards: Revenue / Net new MRR / Gross margin / Cash runway
  (each with a labelled delta).
- **Revenue trend** — inline SVG line + area chart.
- **Cost breakdown** — inline SVG bars + 2–3 bullet captions.
- **P&L table** — Revenue / Gross profit / Opex / Net, current vs. prior period.
- **Top accounts** — a table (logo placeholder / plan / ARR / status badge).
- **Outlook** — a paragraph + a signed footer.

## Hard rules
Every number must attach to a labelled chart or table row. Deltas show direction +
percent. Accent ≤2 times; charts inline SVG only. Numbers use tabular figures.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set. If the audience uses a right-to-left language, mirror the
layout and keep numerals LTR.

_(Artifact shape adapted from open-design's `finance-report` design template.)_
