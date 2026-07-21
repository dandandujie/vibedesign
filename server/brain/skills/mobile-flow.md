---
name: mobile-flow
craft: [typography, color]
triggers: [mobile wireframe, app flow, user flow, lo-fi mobile, flow board, 移动端线框, App 流程图, 流程板]
---

# Mobile Flow Skill — lo-fi flow board

Produce a single board showing a mobile app's user flow as a row of lo-fi phone frames. The point is the *flow* — how a user moves screen to screen — not the polish of any one screen. Keep the screens clean grey-boxes (not scribbly) but keep the connectors and annotations loose and informal. Complements `site-prototype`: that one builds the real multi-page prototype; this one is the whiteboard sketch BEFORE pixels are committed.

## Workflow

1. **Stay low-fidelity.** Greyboxes, placeholder rects, and bars stand in for real content — even if a design system is attached, honor it only loosely (system sans for the board, mono for labels and datelines).
2. **Pick the flow steps** from the brief — typically 3–4 connected screens like Onboarding → Home feed → Item detail → Confirm. Name each step so the connector arrows can carry a numbered, verb-first label ("① tap Start", "② open item", "③ add to cart").
3. **Lay out the board**, in order:
   - **Board header** — bold sans title with a pinned "WIREFRAME v0.1 · MOBILE" tag (dashed border, slight rotation) and a mono dateline on the right (date / device / fidelity).
   - **Phone row** — 3–4 rounded device frames (~240–280px wide) in a horizontal row, each with a notch / status bar. Inside each frame put the greybox content for its step: hero image-placeholder (rect + X), title/price bars, list cards (thumbnail X + 2 text bars), category chips, a bottom tab bar, sticky CTA bars, a confirm checkmark — match the screen's role.
   - **Connectors** — dashed arrows between consecutive phones, each carrying a small mono step label describing the tap that advances the flow.
   - **Annotations** — 1–2 small sticky / callout notes pinned near a screen to flag intent ("hero must sell value in 3s", "checkout = 1 screen").
4. **Self-check**:
   - The main phones are visible in a ~1280px viewport; the flow reads left-to-right.
   - Screens are clean greyboxes (not scribbly); connectors and stickies are the loose, informal parts.
   - No near-white-on-white regions — every block has a visible grey fill or border. If a screen renders blank as a thumbnail, raise the contrast.

## Output contract

One self-contained HTML document (Vibedesign runtime contract): CSS inline, no external JS, no external images (CSS/SVG placeholders only). Inter / system-ui for the board and IBM Plex Mono for labels via Google Fonts; a light marker font is allowed for annotations only. Dark device-frame borders, medium-grey content blocks on white screens, and a single accent color for arrows and annotations so the board reads clearly even as a small thumbnail.

_(Skill from open-design (Apache-2.0), adapted to Vibedesign's frontmatter + delivery contract; seed = its example board.)_
