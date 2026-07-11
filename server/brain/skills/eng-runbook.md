---
craft: [state-coverage, typography]
triggers: [runbook, ops doc, on-call, sre doc, 运维手册, 应急手册]
---

# Eng Runbook: Operations Runbook

A single-page engineering runbook as one self-contained HTML document.

## Structure
- **Header** — service name + owner team + severity tier + version.
- **Service summary** — one paragraph + a dependency list.
- **Alerts table** — alert / severity / meaning / first response.
- **Dashboards & links** — a linked list.
- **Common procedures** — 3–4, each with a copyable code block (deploy / rollback /
  rotate keys).
- **On-call rotation** — a table (week / primary / secondary / backup).
- **Incident response** — a numbered 5-step checklist.

## Hard rules
Single inline `<style>`; semantic HTML. **Code blocks are monospace, selectable,
and use straight quotes** (no smart quotes / ligatures that break copy-paste).
Accent ≤2 times. Real commands or clearly-labelled placeholders.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set.

_(Artifact shape adapted from open-design's `eng-runbook` design template.)_
