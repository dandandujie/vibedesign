---
craft: [typography, color]
triggers: [sprite animation, pixel art animation, 8-bit explainer, retro animation, 像素动画, 复古动画]
---

# Sprite Animation: Pixel / Retro Explainer Frame

A pixel/sprite-style animated explainer frame as one self-contained HTML document
— a cream stage with an oversized year, a pixel mascot, kinetic kana, and a
scrolling timeline. Reads as a single frame of a vertical video.

## Stage
Cream background (~`#f5efe2`) with paper grain, a fixed 16:9 letterbox. A top mono
bar: a title slug on the left, a progress dot readout ("01/12") + a "REC" stamp on
the right.

## At least three independent looping animations
1. **The year** — serif display, a `clip-path` scanline-glitch sweep plus a small
   pop each loop.
2. **A 96×128 pixel card** — inline SVG (`shape-rendering: crispEdges`) or a
   box-shadow grid, bobbing ±4px over ~1.6s.
3. **Kinetic kana / label** — fade-slides in sync with the bob.
4. A bottom year-tick ribbon scrolling left at a constant speed.

## Hard rules
Mono caption carries the trivia. Restrained palette (cream + one accent red + ink
black). All inline SVG / CSS, no external assets. Reading order: year → sprite →
caption. Animate with `@keyframes` only (no JS) so it captures cleanly to video.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set.

_(Artifact shape adapted from open-design's `sprite-animation` design template.)_
