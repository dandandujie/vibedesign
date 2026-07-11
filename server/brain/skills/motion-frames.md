---
craft: [typography, color]
triggers: [motion design, animated hero, loop animation, video poster, title card, kinetic typography, 动效海报]
---

# Motion Frames: Looping CSS Motion Hero

A single motion composition (rotating type ring / wireframe globe / countdown /
parallax labels) as one self-contained HTML document — a looping hero that also
reads as a still poster.

## Layers (back to front, 16:9)
1. **Stage** — off-white (or DS canvas) with a faint `radial-gradient` dot grid.
2. **Rings** — 2–3 concentric SVG circles (0.5–1px lines) rotating at different
   speeds (~60 / 90 / 180s).
3. **Focal mark** — a wireframe globe or monogram (inline SVG), ~28% width.
4. **Ring labels** — multilingual greetings as `<text>` on the ring,
   counter-rotated so they stay upright.
5. **Headline** — bottom display serif, one word italic in the accent, with a
   reveal.
6. Static corner chrome (a mono tag / index).

## Hard rules
- Animate with `@keyframes` ONLY — **no JS** (so the frame is deterministic and
  can be captured to video by the canvas's video export).
- Paused at frame 0 it must still be a complete poster; ≥3 layers moving at
  different speeds; accent used once.
- Real CDN webfonts are welcome for the headline; keep all animated GRAPHICS as
  inline SVG/CSS so the loop captures deterministically to video.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set. Export to MP4 via the canvas「视频」export.

_(Artifact shape adapted from open-design's `motion-frames` design template.)_
