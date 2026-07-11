---
craft: [state-coverage, accessibility-baseline, laws-of-ux, typography]
triggers: [mobile onboarding, ios onboarding, phone signup, app onboarding, 移动端引导, 新手引导]
---

# Mobile Onboarding: Three-Screen Flow

A three-screen mobile onboarding flow shown as three phone frames side by side in
one self-contained HTML document (a static storyboard, not a live pager).

## The three screens
1. **Splash** — brand mark + one-line promise, calm full-bleed.
2. **Value prop** — hero illustration/icon + title + short description.
3. **Sign-in** — "continue with" options + email, or a single primary CTA.

## Each screen carries
A small status bar (time / signal / battery drawn as inline SVG), a hero visual,
a title + supporting line, a 3-dot pager, a full-width pill primary CTA, and a
top-right Skip / alt action.

## Hard rules
- Strong type hierarchy; soft gradients; ≥4.5:1 contrast on all text.
- One accent per screen; touch targets ≥44px; the sign-in form shows its states
  (default / focus / error with an inline message).
- Three phone frames laid out in a responsive row (wrap on narrow widths).

## Runtime
ONE self-contained `html` document; inline CSS/SVG; tokens from the attached
design system or a small inline `:root` set.

_(Artifact shape adapted from open-design's `mobile-onboarding` design template.)_
