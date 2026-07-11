---
craft: [typography, color, anti-ai-slop, laws-of-ux]
triggers: [prototype, mockup, landing, single page, marketing page, homepage, 落地页, 官网]
---

# Web Prototype: General Desktop Web Page

Build a general desktop web page (landing / marketing / docs / SaaS) as one
self-contained HTML document. Compose from a small set of proven sections rather
than improvising layout.

## Section library
Pick and arrange from: **hero** (eyebrow + headline + subhead + primary/secondary
CTA), **features** (3 tiles), **stats** (2–4 big numbers), **quote** (single
testimonial), **split** (image/text 50-50), **cta** (full-width accent band),
**log-list** (changelog / feature rows), **comparison-table**.

## Page rhythms (default arrangements)
- Landing → hero → 3 features → stats or quote → split → cta → footer.
- Pricing → hero → comparison-table → cta → footer.
- Docs → hero → log-list → cta → footer.

Before writing, state the section list in one line so the user can adjust.

## Hard rules
- **One accent, ≤2 visible uses per screen** (eyebrow + primary CTA). Everything
  else neutral.
- Display type = serif; body = sans; numbers / captions / eyebrows = mono.
- Images use a styled placeholder block (a subtle gradient/`.ph-img` div) — never
  an external image CDN.
- Mobile reflow via a `@media (max-width: 920px)` block (stack columns, shrink
  type). Every `<section>` gets a `data-vd-id`-friendly semantic wrapper.
- Real copy, never lorem. Inline all CSS; no external fonts/JS.

## Runtime
Deliver ONE self-contained `html` document. If a design system is attached, root
every color/type/spacing choice in it; otherwise inline a small `:root` token set
(2–3 neutrals, 1 accent, a type scale) and reference it via `var(--*)`.

_(Artifact shape adapted from open-design's `web-prototype` design template.)_
