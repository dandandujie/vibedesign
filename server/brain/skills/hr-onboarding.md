---
name: hr-onboarding
craft: [accessibility-baseline]
triggers: [onboarding, new hire, first week, 入职, 新员工]
---

# HR Onboarding Skill

Produce a single-screen onboarding plan in HTML.

## Workflow

1. Read the active DESIGN.md.
2. Identify the role + tenure expectations from the brief. Default to a
   30/60/90-day shape if unspecified.
3. Layout:
   - Cover banner: name placeholder, role, start date, manager + buddy.
   - "Day 1" panel with the literal schedule (kickoff time, lunch, 1:1 slot).
   - First-week timeline (Mon → Fri, two activities per day).
   - 30 / 60 / 90 day milestone cards with three concrete outcomes each.
   - Resource list: handbook, Slack channels, key dashboards, payroll setup.
   - "You're set when…" checklist — five outcomes with checkboxes.
4. Single inline `<style>`, semantic HTML.

## Output contract

```
<artifact identifier="onboarding-plan" type="text/html" title="Onboarding Plan">
<!doctype html>...</artifact>
```

_(Skill from open-design (Apache-2.0) — frontmatter mapped to Vibedesign's parser; delivery follows Vibedesign's runtime contract, not open-design's file-writing harness.)_
