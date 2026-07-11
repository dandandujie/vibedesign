# Color

Universal rules for using color well, independent of which palette a brand
provides.

## Structure the palette by role, not by hue
Every screen needs, at minimum: one **surface** family (background + raised
card), a **foreground** ramp (primary text, secondary text, muted/meta), a
**border** tone, and **one accent**. Semantic colors (success/warning/error)
are separate and used only for status — never as decoration.

## One accent, used sparingly
The accent earns its meaning through scarcity. Cap it at ~2 visible uses per
view (the primary action, one highlight). An accent on six elements reads as
noise, not emphasis. If everything is emphasized, nothing is.

## Contrast is a floor, not a goal
- Body text vs its background: **≥ 4.5:1**.
- Large text (≥ 24px, or ≥ 19px bold) and UI borders/icons: **≥ 3:1**.
- Never signal state by color alone — pair it with an icon, label, or shape
  (color-blind users, grayscale printing).

## Build neutrals on a consistent temperature
Pick warm, cool, or true-neutral grays and stay on that tone across the whole
ramp. Mixing a cool gray border with a warm gray text on a neutral surface
looks accidental. A near-black for text (`#1a1a1f`) reads softer and more
premium than pure `#000`.

## Surfaces do the layering
Prefer separating layers with surface tone + a hairline border over drop
shadows. When you do elevate, one soft shadow is enough; stacked heavy shadows
are an AI tell.

## Dark mode is not "invert"
Don't flip white↔black. Raise surfaces slightly as they elevate (darkest base,
lighter cards), reduce accent saturation so it doesn't vibrate, and keep text
below pure white (`#e8e8ea`, not `#fff`) to cut glare.
</content>
