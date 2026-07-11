# Accessibility baseline

The non-negotiable floor for any interactive UI. Not a separate "a11y pass" —
build it in from the first markup.

## Semantics first
- Use real elements: `<button>` for actions, `<a href>` for navigation,
  `<label>` bound to every input, one `<h1>` then a sensible heading order.
  A clickable `<div>` is a bug — it loses keyboard, focus, and role for free.
- Landmarks: `<header> <nav> <main> <footer>` so assistive tech can skip around.

## Keyboard
- Everything actionable must be reachable and operable by Tab / Enter / Space,
  in a logical order. Never set `tabindex` > 0.
- **Visible focus** on every focusable element. Do not `outline: none` without
  replacing it with an equally clear `:focus-visible` ring (≥ 3:1 contrast).
- Trap focus inside open modals; restore it to the trigger on close; Esc closes.

## Contrast and text
- Text ≥ 4.5:1 (large text and UI borders/icons ≥ 3:1) against their actual
  background.
- Respect the user's font size — size in `rem`, don't disable zoom.
- Never convey meaning by color alone; add an icon, label, or pattern.

## Images and media
- Meaningful images get descriptive `alt`; decorative ones get `alt=""`.
- Don't autoplay audio/video; provide controls.

## Motion and comfort
- Honor `prefers-reduced-motion`: gate non-essential animation behind it and
  fall back to an instant state change.
- No content that flashes more than ~3 times per second.

## Forms
- Every field has a persistent visible label (placeholder is not a label).
- Errors are announced in text next to the field, not by color alone, and the
  message says how to fix it.
- Group related controls (`<fieldset>`/`<legend>` for radio/checkbox sets).
</content>
