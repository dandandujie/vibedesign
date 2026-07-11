---
craft: [typography, color]
triggers: [motion, animation, animate, animated, loop, 动效, 动画, hyperframe, 逐帧, motion graphic]
---

# Make Motion: Self-Contained HTML Motion Piece

Produce a short, looping motion graphic as ONE self-contained HTML document.
The canvas plays it automatically, and it exports as the HTML itself — a crisp,
resolution-independent motion file that loops in any browser. This is "HTML is
the source of the motion": the animation is authored declaratively in CSS/JS,
not rendered as a video.

## Deliverable

Output a normal ` ```html ` block (the standard delivery contract). It must:

- Be **self-contained** — inline all CSS and JS; no external CDN or fonts. Embed
  assets as data URIs or draw them with CSS/SVG.
- **Loop cleanly** — a 4–8 second loop that returns to its start with no visible
  jump. Prefer `animation: … infinite` with matched start/end keyframes.
- **Fill the viewport** — `html,body{margin:0;height:100%;overflow:hidden}` and a
  full-bleed stage, so the frame reads as a finished motion piece.
- **Animate visual properties only** — `transform`, `opacity`, `filter`, `color`,
  `clip-path`, SVG attributes. Avoid animating layout (width/height/top/left) —
  it stutters and does not capture cleanly.
- Be **deterministic** — do NOT drive motion from `Math.random()` or `Date.now()`.
  Seed any variation from fixed values so every playthrough is identical (this is
  what lets a clean GIF be captured).
- Honor `@media (prefers-reduced-motion: reduce)` — fall back to a static,
  composed final frame.

## Structure options

- **Continuous motion** — one stage with CSS `@keyframes` (a pulsing orb, a
  drifting gradient, an SVG line that draws itself, kinetic type).
- **Frame sequence** — several full-screen `.frame` sections shown in turn by a
  small timing loop (a title card → a stat → a closing card). Give each a
  `data-duration` in ms and a tiny script that cross-fades between them and
  loops. Add a thin progress bar if it helps the read.

## Craft

Motion is punctuation, not decoration. One or two coordinated moves with good
easing (`cubic-bezier`, `ease-out` for entrances) beats many competing ones.
Keep type legible while it moves; never animate body text opacity so low it
can't be read. Respect the brief's palette and voice.
