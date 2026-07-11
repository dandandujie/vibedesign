# Craft references

Brand-agnostic craft knowledge. Each file is a small, dense rulebook on one
dimension of professional UI craft (typography, color, motion, …). A skill
opts into the references it needs via its `craft:` front-matter, and the
server injects only the requested ones into the system prompt — above the
active skill body, below the active design system.

## Why a third axis next to `skills/` and design systems

| Axis | Scope | Example |
|---|---|---|
| skills | Artifact shape | `make-a-prototype`, `wireframe`, `make-a-deck` |
| design systems | Brand visual language (colors, fonts, tokens) | a company's `DESIGN.md` + `:root` tokens |
| craft | **Universal** rules true regardless of brand | letter-spacing on all-caps, accent-overuse caps, anti-AI-slop tells |

A design system decides *which* colors and fonts to use; craft decides *how*
to use them well. On any conflict, the brand wins for token values; craft
rules still apply to anything the brand does not override.

## How a skill opts in

Add a `craft:` array (under `od:`) to the skill's YAML front-matter. Only the
listed sections are injected, so a skill that needs only typography pays no
token cost for color/motion content. Unknown slugs are ignored
(forward-compatible).

```yaml
od:
  craft: [typography, color, anti-ai-slop]
```

Allowed values match the file names in this directory minus `.md`.

## Files

| File | When to require |
|---|---|
| `typography.md` | any skill that emits typed content (≈all) |
| `typography-hierarchy.md` | surfaces where hierarchy must feel authored (strong entry point, varied levels, intentional rhythm) |
| `color.md` | any skill that emits styled output (≈all) |
| `anti-ai-slop.md` | marketing pages, landing pages, decks — anywhere "default LLM output" is a risk |
| `accessibility-baseline.md` | any interactive UI: forms, dashboards, mobile flows (focus/labels/keyboard) |
| `state-coverage.md` | any stateful UI: dashboards, lists/tables, forms (empty/loading/error/…) |
| `laws-of-ux.md` | composition decisions that hit cognitive limits: pricing, dashboards, onboarding |

## Attribution

The universal craft principles collected here are common knowledge in the
front-end / product-design field (WCAG contrast ratios, type-scale ratios,
named UX laws, the well-known "AI slop" tells). This content was authored for
Vibedesign, informed by open craft references in the community. Extend freely.
</content>
