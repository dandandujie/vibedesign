---
name: mobile-onboarding
craft: [state-coverage, animation-discipline, accessibility-baseline, form-validation, laws-of-ux]
triggers: [mobile onboarding, ios onboarding, android onboarding, phone signup, app onboarding, 移动端引导]
---

# Mobile Onboarding Skill

Produce a three-screen mobile onboarding flow on a single HTML page.

## Workflow

1. Read DESIGN.md.
2. Identify the app + audience.
3. Layout: three phone frames side by side. Each phone:
   - Status bar (time, battery, signal).
   - Hero artwork or icon.
   - Headline + supporting paragraph.
   - 3-dot pagination.
   - Primary CTA (full-width pill button).
   - "Skip" or alt action top-right.
4. Last phone is the sign-in / continue-with options screen.
5. Strong typography, gentle gradients, accessible contrast.

## Output contract

```
<artifact identifier="mobile-onboarding-name" type="text/html" title="Mobile Onboarding">
<!doctype html>...</artifact>
```

_(Skill from open-design (Apache-2.0) — frontmatter mapped to Vibedesign's parser; delivery follows Vibedesign's runtime contract, not open-design's file-writing harness.)_
