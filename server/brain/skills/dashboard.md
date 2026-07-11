---
craft: [state-coverage, accessibility-baseline, laws-of-ux, color]
triggers: [dashboard, admin panel, analytics, control panel, 后台, 管理后台, 数据看板]
---

# Dashboard: Admin / Analytics Screen

A single-screen admin or analytics dashboard as one self-contained HTML document.

## Layout (three zones)
- **Left sidebar** (220–260px): brand mark + 6–8 nav items (monoline icon + label,
  the active one marked with the accent). Sticky.
- **Top bar**: page title on the left, search + avatar on the right. Sticky.
- **Main area**: independently scrollable, laid out on a CSS grid.

## Main area (three rows)
1. **KPI row** — 3–4 stat cards (label + big number + a delta with direction).
2. **Primary chart** — full-width or 2/3, drawn as **inline SVG** (a polyline with
   a soft area fill, or a bar/area chart). No chart library.
3. **Secondary** — a smaller chart or a data table (with header, zebra rows,
   right-aligned numbers using tabular figures).

## Hard rules
- **Accent ≤2 times** (active nav + one highlight). Everything else neutral.
- Charts are inline SVG only. Design at least the empty and loading states for the
  data areas (skeleton rows beat a spinner).
- Semantic `<aside> <header> <main>`; keyboard-reachable nav; ≥4.5:1 text contrast.
- Density follows the brand's mood (airy vs. utilitarian).

## Runtime
ONE self-contained `html` document; inline CSS/SVG; tokens from the attached
design system or a small inline `:root` set.

_(Artifact shape adapted from open-design's `dashboard` design template.)_
