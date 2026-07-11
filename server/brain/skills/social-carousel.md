---
name: social-carousel
craft: [typography, color]
triggers: [social carousel, carousel post, instagram carousel, linkedin carousel, x thread cards, social series, 三连发, 轮播图]
---

# Social Carousel Skill

Produce a 3-panel social carousel on a single dark stage. Each panel is a
1080×1080 cinematic still — connected as a series, but each readable on its
own.

## Workflow

1. **Read the active DESIGN.md** (injected above). Pick the loudest serif
   token for the headline lockups and a mono token for stamps / counters.
2. **Pick the theme + 3 captions** from the brief. The captions must read
   as one sentence when stacked: ("onwards." → "to the next one." →
   "looking ahead." or "input." → "iterate." → "ship.").
3. **Stage** — full-bleed dark page. Top header strip:
   - Left: serif italic display "Three posts. One beat."
   - Just below the title: a one-line description in muted mono ("1080×1080
     · cinematic video loops · minimal type. Drop into Instagram, LinkedIn,
     or X — each post stands on its own or runs as a three-part series.").
   - Right: small mono badge "SERIES · 01 → 03".
4. **Cards** — 3 squares in a horizontal row (wraps to stack on narrow
   viewports). Each card is `aspect-ratio: 1 / 1` with rounded 12px corners
   and a subtle 1px border, plus a soft drop shadow.
   - Background: a layered gradient that *suggests* a cinematic photo — for
     example, panel 1 = warm dawn meadow (stacked greens with a cyan sky
     wash); panel 2 = forest dusk (warm oranges fading into deep teals);
     panel 3 = pink-mountain ridge (rosy peaks against a dim violet sky).
     Use `radial-gradient` + `linear-gradient` only — no images.
   - Top-left chip: brand wordmark in serif italic ("Jerrod Lew") with a
     small accent dot.
   - Top-left below chip: micro mono index "AI · 01 / 03" (and 02, 03).
   - Bottom-left: the headline lockup in white serif display, italic accent
     on one word.
   - Bottom-right corner: a `1× LOOP` mono stamp inside a thin border.
   - Bottom strip caption: small caps mono describing the imagined frame
     ("Man, walking forward — close.", "Woman, stepping into frame.",
     "Woman, overlooking the city.").
5. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS inline.
   - Cards are sized via `width: clamp(280px, 30vw, 380px)` so 3 fit
     comfortably across most desktops and stack at < 1100px.
   - `data-od-id` on stage, each card, each headline.
6. **Self-check**:
   - The three headlines together form one sentence and feel cinematic.
   - Mono is used only for the wordmark index, the loop stamp, and the
     bottom captions. The headlines stay serif.
   - Each panel's color story is distinct — no two share a dominant hue.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="carousel-slug" type="text/html" title="Carousel — Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.

_(Skill from open-design (Apache-2.0) — frontmatter mapped to Vibedesign's parser; delivery follows Vibedesign's runtime contract, not open-design's file-writing harness.)_
