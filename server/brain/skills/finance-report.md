---
name: finance-report
craft: [rtl-and-bidi]
triggers: [financial report, finance report, quarterly report, p&l, mrr review, 财报, 财务报告]
---

# Finance Report Skill

Produce a single-screen financial report in one self-contained HTML file.

## Workflow

1. **Read the active DESIGN.md.** Tables, KPI cards, and chart strokes use
   palette tokens — never invent new ones.
2. **Classify** the period (monthly / quarterly / yearly) and entity
   (startup, division, project) from the brief. If unspecified, assume a
   quarterly SaaS report and pick believable numbers.
3. **Layout** the page in this order:
   - Masthead: company / period / "Confidential — Finance" badge.
   - Headline KPI strip (4 cards): Revenue, Net new MRR, Gross margin, Cash runway.
   - Revenue trend chart (inline SVG line + area).
   - Cost breakdown chart (inline SVG bar) with a 2–3 bullet caption.
   - P&L summary table (Revenue / Gross profit / Opex / Net) with current vs prior period.
   - Top accounts table with logo placeholders, plan, ARR, status badge.
   - Outlook paragraph + footer with author + signature line.
4. **Write** one self-contained HTML doc (CSS in one inline `<style>` block).
5. **Self-check**: every number ties to a labelled chart or table; deltas
   show direction and percentage; accent colour used at most twice.

## Output contract

```
<artifact identifier="finance-report-q3" type="text/html" title="Q3 Finance Report">
<!doctype html>
<html>...</html>
</artifact>
```

_(Skill from open-design (Apache-2.0) — frontmatter mapped to Vibedesign's parser; delivery follows Vibedesign's runtime contract, not open-design's file-writing harness.)_
