---
craft: [state-coverage, typography, color]
triggers: [mobile app, ios app, android app, phone screen, app ui, 移动端, 手机 app, 移动端应用]
---

# Mobile App: Single App Screen

A single mobile app screen as one self-contained HTML document, designed for a
390px-wide phone viewport.

## Choose exactly one screen archetype
Feed · Detail · Onboarding · Profile · Checkout · Focus. One screen, one job.

## Structure
- Full-bleed 390px layout (`html,body{margin:0}`; content fills the width). **Do
  not draw your own phone bezel / status bar** — the canvas's mobile-app preview
  supplies the device frame, status bar and home indicator. Keep the top ~44px and
  bottom ~34px light so they read under the device chrome.
- A bottom tab bar (`<nav>`) only for archetypes that have one (Feed / Profile /
  Focus). Detail / Onboarding / Checkout have no tab bar.

## Hard rules
- Touch targets ≥44px. Accent used ≤2 times (one active tab + one primary action).
- Numbers use tabular mono; titles use the display face.
- Images are styled placeholder blocks — no external image CDN.
- Cover the key states of any list/form on the screen (empty / loading / filled).

## Runtime
ONE self-contained `html` document; inline CSS/SVG; tokens from the attached
design system or a small inline `:root` set. Switch the canvas to the
「移动端应用」device view to preview it framed.

_(Artifact shape adapted from open-design's `mobile-app` design template.)_
