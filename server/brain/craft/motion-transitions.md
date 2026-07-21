# Motion transitions craft rules

A transition tells the viewer how two scenes relate. A crossfade says "this
continues." A push says "next point." A blur crossfade says "drift with me."
Pick transitions by what the content is doing emotionally, not by what looks
flashy. Pick ONE primary transition (60–70% of scene changes) plus 1–2
accents — never a different transition for every scene.

Non-negotiables for multi-scene compositions:

1. Every scene change uses a transition — no jump cuts.
2. Every scene's elements animate IN (opacity, position, scale, staggered).
   Nothing pops on fully formed.
3. Exit animations are banned except on the final scene. The transition IS
   the exit; outgoing content stays fully visible until the transition fires.
4. The final scene may fade out (to black, typically). Only scene allowed to.

For frame-captured renderers (a seekable timeline): author transitions as CSS
`@keyframes` on a shared master duration so every frame is deterministic.
Declare the total with `<body data-duration="<ms>">`. The snippets below use
GSAP timeline notation (`old`/`new` = outgoing/incoming scene, `T` = start);
translate the steps and easings into equivalent CSS keyframes.

## Energy → transition

| Energy | Primary | Accents | Duration | Easing |
|---|---|---|---|---|
| Calm (wellness, luxury, brand story) | Blur crossfade, focus pull | Light leak, circle iris | 0.5–0.8s | `sine.inOut`, `power1` |
| Medium (corporate, SaaS, explainer) | Push slide, staggered blocks | Squeeze, vertical push | 0.3–0.5s | `power2`, `power3` |
| High (promos, sports, launch) | Zoom through, overexposure | Staggered blocks, gravity drop | 0.15–0.3s | `power4`, `expo` |

## Mood → transition type

- Warm/inviting: light leak, blur crossfade, focus pull, film burn.
- Cold/clinical: squeeze, zoom out, blinds, shutter, grid dissolve.
- Editorial/magazine: push slide, vertical push, diagonal split, shutter.
- Tech/futuristic: grid dissolve, staggered blocks, blinds, chromatic aberration.
- Tense/edgy: glitch, VHS, chromatic aberration, ripple.
- Playful/fun: elastic push, 3D flip, circle iris, morph circle, clock wipe.
- Dramatic/cinematic: zoom through, zoom out, gravity drop, overexposure, color dip to black.
- Premium/luxury: focus pull, blur crossfade, color dip to black. Restraint.
- Retro/analog: film burn, light leak, VHS, clock wipe.

## Narrative position

- Opening: most distinctive transition, 0.4–0.6s — sets the visual language.
- Between related points: the primary, consistent, ~0.3s — don't distract.
- Topic change: something different (staggered blocks, shutter, squeeze) — signals "new section".
- Climax/hero reveal: boldest accent, fastest or most dramatic — spend it here.
- Wind-down: back to gentle (blur crossfade, crossfade), 0.5–0.7s.
- Outro: slowest, simplest (crossfade, color dip to black), 0.6–1.0s. No new energy at the end.

## The catalog

### Push slide
Both scenes move together; the new pushes the old out. The editorial default.
```
old → x: -1920 (0.5s, power3.inOut); new from x: 1920 → 0 (same tween).
```
Vertical push: same on Y. Use for "next point" continuity, page-turn feel.

### Elastic push
Push with overshoot bounce on the incoming scene. Playful.
```
old → x: -1920 (0.5s, power3.in); new from x: 1920 → 30 (0.4s, power4.out)
→ -15 (0.15s, sine.inOut) → 0 (0.1s, sine.out).
```

### Squeeze
Old compresses horizontally, new expands from the opposite edge. Cold, mechanical.
```
old → scaleX: 0, origin left (0.4s, power3.inOut);
new from scaleX: 0, origin right → 1 (0.4s, power3.inOut, +0.1s).
```

### Circle iris / diamond iris / diagonal split
Shape masks reveal the new scene. Iris: friendly, retro. Diagonal split: editorial slice.
```
iris: new clip-path circle(0% at 50% 50%) → circle(75% at 50% 50%) (0.5s, power2.out); hide old at end.
diamond: polygon(50% 50% ×4) → polygon(50% -20%, 120% 50%, 50% 120%, -20% 50%).
diagonal split: old (zIndex 10) clip-path polygon shrinks to a corner triangle (0.5s, power3.inOut).
```

### 3D card flip
180° Y-rotation. Needs `backface-visibility: hidden; transform-style: preserve-3d` on both scenes, `perspective: 1200px` on the parent. Playful, presentational.
```
old rotationY 0 → 180 (0.6s, power2.inOut); new rotationY -180 → 0 (same).
```

### Zoom through / zoom out
Zoom through: old zooms past camera with blur, new arrives from behind. High-energy hero move.
```
old → scale 2.5, opacity 0, blur(8px) (0.4s, power3.in);
new from scale 0.5, blur(8px) → 1/0px (0.4s, power3.out, +0.15s).
```
Zoom out: old shrinks away (scale → 0.3, power3.in) revealing new behind it — needs old zIndex 10 over new zIndex 1.

### Crossfade
Opacity swap, 0.5s power2.inOut both ways. The baseline; the outro default.

### Blur crossfade
Dissolve with blur + slight scale shift. Scale blur by energy: calm 20–30px with a 0.3–0.5s hold at peak; medium 8–15px; high 3–6px no hold.
```
old → blur(10px), scale 1.03, opacity 0 (0.5s, power2.inOut);
new from blur(10px), scale 0.97 → sharp (0.5s, +0.1s).
```

### Focus pull
Outgoing slowly blurs (0.5s+ power1.in) while incoming fades in already sharp. Depth-of-field, premium. Calm version: long rack focus with a hold at peak defocus before the new scene resolves.

### Color dip
Fade to a solid color (or black), hold ~0.05s, fade the new scene up. Closure; the classic outro.
```
old → opacity 0 (0.2s, power2.in); new from 0 → 1 (0.2s, power2.out, +0.25s).
```

### Staggered color blocks
Full-screen (NOT thin strips) colored divs slide across staggered; the scene swaps while fully covered. 2 blocks at 0.06s stagger standard; 5 blocks at 0.04s for dense/high energy. Use palette colors.
```
blocks from x: -1920 → 0 (0.25s each, power3.inOut, staggered);
swap at full cover; blocks exit x → 1920 (staggered).
```

### Blinds (horizontal / vertical)
N full-width strips slide across staggered, swap under cover, exit staggered. Count by energy — calm: 4h/6v; medium: 6–8h/8v; high: 12–16h/16v. 6 strips: 0.03s stagger; 12 strips: 0.018s.

### Light leak
A flat warm tint layer plus 2–3 bright radial-gradient divs, ALL larger than the frame (2400px+) so edges never show. Warmth builds (sine.inOut drifts), swap at peak warmth, leaks fade. Warm, analog.

### Overexposure burn
Scene blows out via `filter: brightness()` (1.5 → 3, with slight scale-up) while a white overlay fades in; swap at peak white; white recedes to reveal the new scene. High-energy, photographic. Use brightness on the scene — a plain white overlay alone reads flat.

### Film burn
Staggered warm overlays (amber, orange, red — large radial gradients) bleed in from one edge at 0.05s staggers; swap mid-bleed; overlays fade out staggered. Retro, organic.

### Glitch
RGB-tinted overlay copies jitter with large offsets (±30–60px) at 0.03s intervals for ~6 frames; the scene itself jitters too; swap and clear at ~0.2s. Overlays use NORMAL blending at 35% opacity — `mix-blend-mode: multiply` is invisible on dark backgrounds. Tense, digital breakdown.

### Chromatic aberration
RGB overlays start aligned, spread apart (±80px) as the scene fades, converge onto the new scene. Tech, edgy.

### Ripple
Rapid oscillation (±30px, scale 0.97–1.03) with increasing blur; swap at peak distortion; incoming stabilizes with decreasing wobble.

### VHS tape
Clone the actual scene content (`cloneNode(true)` — never colored bars) into ~20 horizontal strips (each ~54px, clip-path'd, wider than the frame at left:-50px). Each strip shifts X independently with seeded pseudo-random offsets at per-strip intervals; red+blue chromatic copies sit above at 35% opacity. Seeded PRNG keeps it deterministic for frame capture. Retro/analog.

### Shutter
Two full-screen halves close from top and bottom (0.25s, power3.in), meet, swap while closed, reopen (power3.out). Clean, mechanical, editorial.

### Clock wipe
Radial polygon sweep through 4 quadrants using a 9-point clip-path polygon with intermediate edge positions (0.1s per quadrant, linear). Playful-retro.
```
polygon(50% 50%, 50% 0%, ...) sweeping 12→3→6→9→12 o'clock, one tween per quadrant.
```

### Grid dissolve
A grid of colored cells covers the frame in a ripple from the center (cells sorted by distance from center); swap at 50% coverage; cells fade out in ripple. Cycle 5 palette colors per cell, not monochrome. 12-cell (4×3) standard; 120-cell dense variant at 0.75 opacity. The core "data/tech" transition.

### Gravity drop
Old scene (zIndex 10, new at 1 behind) falls with slight rotation: y → 1200, rotation 4 (0.5s, power3.in). Weighty, dramatic.

### Morph circle
A circle in the new scene's background color scales from 0 to ~30× from center (0.5s, power3.in); old hides near the end; new content fades in on top. Playful, brand-forward.

### Blur through
Content becomes fully abstract before resolving — the heaviest blur transition; calm by default. Old → blur(30px), scale 1.08, fades out (0.5s power1.in); hold both in abstract blur; new resolves slowly (0.7s power1.out). Medium: 15px, 0.4s in/out with 0.2s overlap.

### Directional blur
Blur + skew simulating motion in one direction. Medium: old → blur(12px), skewX -8, x -200, out (0.4s power3.in); new from the mirrored state → clean (power3.out, +0.15s). Calm: 20px blur, gentler skew/offset, 0.6s.

### Page burn
The outgoing scene burns away from a corner against black: a radial fire front with deterministic noise-jittered edges expands, an SVG clip-path (`fill-rule: evenodd`) cuts the growing hole, a canvas overlay draws the scorched char line at the boundary. Content burns WITH the page — no falling debris clones. The incoming scene stays hidden; at ~90% through the burn it fades in slowly from black (power1.out, 0.8–1.2s, content staggered after). The most dramatic transition in the catalog — reserve for hero moments, edgy/destructive moods, gaming, cyberpunk.

## Hard rules (they cause real bugs)

- Scene 1 visible by default; scenes 2+ start `opacity: 0` on the container.
- Gravity drop, zoom out, diagonal split: outgoing scene ON TOP (zIndex 10) so it exits revealing the new scene behind.
- Page burn: hide the outgoing scene at burn end with a timeline step, never `onComplete` (breaks scrubbing); restore `clip-path: none` at progress ≤ 0.
- Glitch overlays: normal blending at 35% opacity. Light leaks: always larger than the frame. Overexposure: `brightness()` on the scene, not just a white overlay.
- Staggered blocks are full-screen divs, not thin strips.
- Deterministic randomness only (seeded PRNG) — anything frame-captured must replay identically.
- Avoid star iris (broken interpolation), tilt-shift (no selective CSS blur), lens flare (visible shape), hinge/door (distorts too fast).
- Avoid transitions that produce visible repeating geometric patterns — they read cheap regardless of the math. Organic noise is fine; eye-visible grids are not.

_(from open-design, Apache-2.0)_
