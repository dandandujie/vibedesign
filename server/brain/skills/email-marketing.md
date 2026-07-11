---
craft: [typography, color]
triggers: [email, email template, newsletter, product launch email, 邮件营销, 邮件模板]
---

# Email Marketing: Brand Product Email

A branded product-launch email as one self-contained HTML document — a centered
single column that reads as "an email sitting on a page".

## Frame
600–680px centered column; tint the page background so the column floats
(`body{background:<tint>}` + `margin: 0 auto`).

## Structure (in order)
1. **Masthead** — wordmark + 3 links + a hairline underline.
2. **Hero** — a 16:9 product image placeholder (SVG silhouette / gradient block).
3. **Eyebrow** — small-caps accent, `·`-separated.
4. **Headline lockup** — display, mostly uppercase, tight tracking; one word
   given a slight `skew(-6deg)` for tension.
5. **Body** — 2–3 sentences.
6. **CTA** — a single pill / block button.
7. **Spec grid** — 2×2 of big number + unit + label.
8. **Footer** — wordmark + address + unsubscribe.

## Hard rules
One CTA; accent ≤2 times; no external images (SVG / gradient blocks). Readable in
8–10 seconds; reflows at ~480px.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set.

_(Artifact shape adapted from open-design's `email-marketing` design template.)_
