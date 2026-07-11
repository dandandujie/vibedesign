---
craft: [typography, color, anti-ai-slop, laws-of-ux]
triggers: [saas landing, marketing page, product landing, saas 落地页, 产品官网]
---

# SaaS Landing: Single-Page Product Landing

A single-page SaaS landing as one self-contained HTML document, in a fixed
six-section order.

## Sections (in order)
1. **Hero** — logo/wordmark, headline, one-line subhead, primary + secondary CTA.
2. **Features** — 3–6 tiles (monoline SVG icon + title + one line).
3. **Social proof** — logo wall or 1–3 testimonials. Skip entirely if there is no
   real proof to show (don't invent it).
4. **Pricing** — 2–3 tiers with a clearly recommended plan; omit if not a
   pricing-led page.
5. **Footer CTA** — a full-width accent band with one decisive action.
6. **Footer** — nav, legal, small print.

## Hard rules
- **Accent used ≤2 times total** across the page (hero + footer CTA). Links may
  reuse it sparingly.
- All colors from tokens — no invented hex. Display font carries the headline.
- No external JS; semantic tags; check reflow at ~1440 / 768 / 375 in your head.
- Copy must be real and specific — no lorem, no "Feature one / two / three", no
  invented metrics.

## Parameters (read from the prompt, else default)
Hero density (spacing), accent strength, whether pricing/proof appear — take from
the brief or choose sensible defaults; expose them later via Tweaks if asked.

## Runtime
ONE self-contained `html` document; inline CSS; root in the attached design
system or a small inline `:root` token set.

_(Artifact shape adapted from open-design's `saas-landing` design template.)_
