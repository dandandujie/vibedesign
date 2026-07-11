---
craft: [anti-ai-slop, typography, color]
triggers: [critique, design review, design audit, 评审, 复盘, review my design]
---

# Critique: Five-Dimension Design Review

Review an existing HTML artifact and produce a single self-contained HTML report:
a radar chart plus evidence-backed scores and action lists.

## What to review
The current design (the last artifact in this conversation) or HTML the user
pasted. Don't grade an artifact you produced in this same turn unless asked.

## Five dimensions (0–10 each)
Philosophical consistency · Visual hierarchy · Detail execution · Functionality ·
Innovation. Band each: 0–4 Broken · 5–6 Functional · 7–8 Strong · 9–10
Exceptional.

## Report structure
- **Header** — subject + reviewer + date + a one-line verdict.
- **Radar chart** — inline SVG, five axes (required).
- **Five dimension cards** — score + a 30–80 word evidence paragraph that cites
  specific elements / class names, plus one Keep / Fix / Quick-win note.
- **Three lists** — Keep (3–5), Fix (3–6, ordered by visual cost saved per minute),
  Quick wins (3–5, each 5–15 minutes).

## Scoring discipline (hard)
Always cite evidence — never "feels off". Don't average toward the middle (take the
worst sustained band). Don't inflate (all-7+ or a mean >8 means you didn't look
hard). Innovation may score low. All five scores are mandatory; the radar chart is
mandatory.

## Runtime
ONE self-contained `html` report; inline CSS/SVG; neutral light theme if no design
system is attached.

_(Artifact shape adapted from open-design's `critique` design template.)_
