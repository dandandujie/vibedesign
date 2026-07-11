---
craft: [typography, color]
triggers: [social carousel, carousel post, instagram carousel, linkedin carousel, 轮播图, 三连发]
---

# Social Carousel: 3-Card Square Post

A 3-card social carousel as one self-contained HTML document — three cinematic
1080×1080 square panels whose titles read as one sentence across the set.

## Stage
Dark full-bleed stage with a top header bar: serif italic title on the left + a
mono descriptor line, a mono badge on the right ("SERIES · 01→03").

## The three cards
- Three `aspect-ratio: 1/1` cards (12px radius, 1px border, soft shadow), in a row
  that stacks below ~1100px; each card `clamp(280px, 30vw, 380px)` wide.
- Backgrounds are `radial-gradient` + `linear-gradient` compositions that read as
  cinematic photography — **a different dominant hue per card**, no real images.
- Each card: top-left serif-italic brand chip + accent dot; a mono index
  ("AI · 01/03"); a bottom white serif title lockup (one word italic in the
  accent); a bottom-right "1× LOOP" mono stamp; a small-caps mono caption.
- The three titles stacked together must form one continuous sentence.

## Hard rules
Mono only for the index / loop stamp / caption — titles stay serif. One accent
family. Inline everything; no external images or fonts.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set.

_(Artifact shape adapted from open-design's `social-carousel` design template.)_
