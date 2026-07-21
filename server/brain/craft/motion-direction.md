# Motion direction craft rules

Creative direction for motion pieces when the brief gives no visual identity.
House style first, then eight named visual styles to steal a personality from.
Pick mood first, content second — ask "what should the viewer FEEL?"

## House style (the default)

Before writing HTML: generate real content (a recipe lists real ingredients, a
HUD shows real readouts); declare a palette (one bg, one fg, one accent); pick
typefaces that fit the theme.

Lazy defaults to question — the first thing every LLM reaches for:

- Gradient text (`background-clip: text` + gradient)
- Left-edge accent stripes on cards
- Cyan-on-dark, purple-to-blue gradients, neon accents
- Pure `#000` / `#fff` (tint toward the accent hue instead)
- Identical card grids; everything centered at equal weight

Intentionality over avoidance — use one of these only when the content
genuinely calls for it.

### Color and type

- Match light/dark to content: food, wellness, kids → light; tech, cinema,
  finance → dark.
- One accent hue; same background across all scenes; tint neutrals toward the
  accent (dead gray is a tell). Declare the palette up front — never invent
  colors per element. Contrast must hold with decoratives removed.
- Headlines 700–900 weight, body 300–400; serif + sans pairing (not two
  sans). Display type 60px+ at 1080p, body 20px+.

### Background layer

Every scene needs persistent decorative depth that stays visible while
content animates in — without it, scenes feel empty during entrance
staggering. Mix 2–5 per scene: radial glows (accent-tinted, breathing scale),
ghost text (theme words at 3–8% opacity, very large, slow drift), hairline
accent lines, grain, grid patterns, thematic decoratives (orbit rings for
space, vinyl grooves for music). All decoratives get slow ambient motion —
breathing, drift, pulse. Static decoratives feel dead.

### Motion

0.3–0.6s durations, varied eases, combined transforms on entrances,
overlapping entries. See `motion-transitions` for the transition catalog and
`animation-discipline` for duration/easing constraints.

## The style library

Each style: palette → type → motion rules → transitions → what NOT to do.

1. **Swiss Pulse** (Müller-Brockmann) — clinical, precise. SaaS, data, dev
   tools, metrics. Black/white + ONE electric accent (blue `#0066FF` or amber
   `#FFB300`); Inter/Helvetica Bold; grid-locked compositions, numbers at
   80–120px, counters counting from 0; `expo.out`/`power4.out` entries that
   snap; hard cuts or geometric transitions. Nothing decorative.

2. **Velvet Standard** (Vignelli) — premium, timeless. Luxury, enterprise,
   keynotes. Black/white + rich accent (navy `#1a237e`, gold `#c9a84c`); thin
   ALL-CAPS sans, wide tracking (0.15em+); generous negative space,
   symmetrical; `sine.inOut`/`power1` — everything glides, sequential reveals
   with long holds. Luxury takes its time.

3. **Deconstructed** (Brody) — industrial, raw. Tech launches, security,
   punk energy. Dark grey `#1a1a1a` + rust orange `#D4501E`; type at angles,
   escaping frames; scan-line/glitch texture baked in; text SLAMS and
   scrambles into place (`back.out(2.5)`, `steps(8)`); glitch transitions.
   Nothing should feel polished.

4. **Maximalist Type** (Scher) — loud, kinetic. Big launches, hype. Red
   `#E63946`, yellow `#FFD60A`, black, white at max contrast; text IS the
   visual, overlapping layers filling 50–80% of frame; everything slams,
   slides, scales; 2–3s rapid-fire scenes; `expo.out`, `back.out(1.8)`. No
   static moments.

5. **Data Drift** (Anadol) — futuristic, immersive. AI/ML, speculative tech.
   Deep black `#0a0a0a` + electric purple `#7c3aed` + cyan `#06b6d4`; thin
   weightless sans, minimal text; particles coalesce into numbers, extreme
   scale shifts; `sine.inOut`/`power2.out`, smooth and continuous. Nothing
   hard.

6. **Soft Signal** (Sagmeister) — intimate, warm. Wellness, personal
   stories. Amber `#F5A623`, cream `#FFF8EC`, dusty rose, sage; humanist
   serif or handwritten, lowercase, delicate; single element fills the frame;
   slow drifts and floats (`sine.inOut`, `power1.inOut`) — everything
   breathes. Never corporate, never hurried.

7. **Folk Frequency** (Terrazas) — cultural, vivid. Consumer apps, food,
   festive. Hot pink `#FF1493`, cobalt `#0047AB`, sun yellow, emerald; bold
   rounded type; pattern and repetition, dense handcrafted texture; bounce,
   pop, spin (`back.out(1.6)`, `elastic.out(1, 0.5)`). Joyful.

8. **Shadow Cut** (Hillmann) — dark, cinematic. Security, dramatic reveals,
   exposé. Near-monochrome deep blacks + one accent (blood red `#C1121F` or
   toxic green); sharp angular film-noir type; elements emerge from darkness,
   slow creeping push-ins; `power4.in` exits, `power3.out` reveals — the
   pause before the hit matters. The reveal IS the story.

Mood routing: analytical → Swiss Pulse; premium → Velvet Standard; raw/punk
→ Deconstructed; hype → Maximalist Type; AI/futuristic → Data Drift;
warm/personal → Soft Signal; festive/cultural → Folk Frequency; dark/dramatic
→ Shadow Cut.

## Creating a custom style

The eight are examples, not constraints. A new style needs: a name (designer,
movement, cultural reference) → palette (2–3 explicit hex values) → type (one
family, two weights, stated roles) → motion rules (speed, snappy vs fluid,
overshoot vs precision) → transition choice → 2–3 explicit anti-patterns.

_(from open-design, Apache-2.0)_
