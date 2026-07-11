---
craft: [accessibility-baseline, typography]
triggers: [onboarding, new hire, first week, 入职, 新员工, 入职计划]
---

# HR Onboarding: New-Hire Plan

A single-page new-hire onboarding plan as one self-contained HTML document.

## Structure
- **Cover banner** — name placeholder / role / start date / manager + buddy.
- **Day 1 panel** — a concrete schedule (kickoff / lunch / 1:1s).
- **First-week timeline** — Monday→Friday, two activities per day.
- **30 / 60 / 90 milestones** — three cards, each with 3 concrete outcomes.
- **Resources** — handbook / Slack channels / dashboards / payroll.
- **"You're set when…"** — a 5-item checklist with checkboxes.

## Hard rules
Single inline `<style>`; semantic HTML; accessible checkboxes with labels. Default
to the 30/60/90 structure unless the brief says otherwise. Warm, welcoming tone;
one accent.

## Runtime
ONE self-contained `html` document; tokens from the attached design system or an
inline `:root` set.

_(Artifact shape adapted from open-design's `hr-onboarding` design template.)_
