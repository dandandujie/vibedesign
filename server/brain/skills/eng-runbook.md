---
name: eng-runbook
craft: [typography, color]
triggers: [runbook, ops doc, on-call, sre doc, service runbook, 运维手册]
---

# Engineering Runbook Skill

Produce a single-page engineering runbook.

## Workflow

1. Read DESIGN.md.
2. Identify the service from the brief.
3. Layout:
   - Header: service name, owner team, severity tier, version.
   - Service summary paragraph + dependency list.
   - Alerts table: alert name / severity / what it means / first response.
   - Dashboards & links list.
   - Common procedures block (3–4) with code blocks (deploy, rollback, rotate keys).
   - On-call rotation table (week / primary / secondary / backup).
   - Incident response checklist (5 numbered steps).
4. One inline `<style>`, semantic HTML, monospace for code blocks.

## Output contract

```
<artifact identifier="runbook-name" type="text/html" title="Service Runbook">
<!doctype html>...</artifact>
```

_(Skill from open-design (Apache-2.0) — frontmatter mapped to Vibedesign's parser; delivery follows Vibedesign's runtime contract, not open-design's file-writing harness.)_
