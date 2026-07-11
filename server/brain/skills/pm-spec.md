---
craft: [typography, typography-hierarchy]
triggers: [prd, spec, product spec, feature brief, 需求文档, 产品文档]
---

# PM Spec: Product Spec / PRD

A single-page product spec (PRD) as one self-contained HTML document.

## Structure
- **Header bar** — title + status pill (Draft / Review / Approved) + date + owner.
- **Summary** — three lines: what / who / why now.
- **Problem** — a panel with one paragraph + a customer or internal quote.
- **Goals & non-goals** — two columns.
- **Success metrics** — a table (metric / target / how measured).
- **User stories** — "As a … I want … so that …" rows.
- **Scope** — a milestone tracker across 3–4 phases.
- **Open questions** — with assignee chips.

## Hard rules
Single inline `<style>`; semantic HTML; accent used ≤2 times. Content is concrete
(real metrics/targets or clearly-labelled placeholders), never lorem. Clean
document typography — measured line length, one clear heading level per depth.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set.

_(Artifact shape adapted from open-design's `pm-spec` design template.)_
