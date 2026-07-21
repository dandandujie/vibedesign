---
name: design
description: Generate and iterate visual designs, prototypes, decks and docs in Vibedesign (local Claude Design workbench). Use when the user asks to design a page, site, prototype, UI, landing, dashboard, deck, or says /design. Requires the Vibedesign app or dev server running locally.
---

# Vibedesign — /design

Vibedesign is a local design workbench (Claude Design replica, BYOK) running on this machine. It renders designs in a live canvas the user can watch and refine. Drive it from the terminal instead of generating throwaway HTML in the repo.

## When to use

- The user asks to design a page / site / prototype / UI / landing / dashboard / deck / doc, or invokes `/design`.
- The user wants to iterate on an existing Vibedesign project from the terminal.
- The user wants a design pulled back into the codebase as HTML.

## Preconditions

Vibedesign must be running: the desktop app (port 8788) or the dev server (`npm run dev`, port 8787). Check with:

```bash
curl -s --max-time 2 http://127.0.0.1:8788/api/version || curl -s --max-time 2 http://127.0.0.1:8787/api/version
```

If neither answers, tell the user to start Vibedesign first. Use whichever base URL answered below (`$VD`).

## Preferred path: MCP tools

If the `vibedesign` MCP server is configured in this agent (tools `vd_design`, `vd_list_projects`, `vd_get_artifact`, `vd_list_skills`, `vd_list_design_systems`), use it — it handles base-URL probing and progress for you. If the tools are missing, offer to install: `node integrations/install.mjs` in the Vibedesign repo, or fall back to HTTP below.

## Workflow

1. **Clarify the brief** — what page/site, audience, content, style direction, single page or multi-page flow. Keep it to what materially changes the design; Vibedesign itself asks clarifying questions on canvas when needed.
2. **Generate**:

   ```bash
   curl -s -X POST $VD/api/agent/design -H 'Content-Type: application/json' -d '{
     "prompt": "<the brief, in the user'"'"'s language>",
     "lang": "zh"
   }'
   ```

   Generation takes 1–5 minutes (blocking response). Optional fields: `projectId` (iterate on an existing project — omit to create one), `projectName`, `skillId` (list via `GET $VD/api/meta` → `skills`; e.g. `site-prototype` for a multi-page site prototype, `make-a-deck` for slides, `dashboard`/`saas-landing`/`mobile-app` templates), `designSystemId` (list via `GET $VD/api/design-systems`).
3. **Hand the canvas to the user** — the response contains `editorUrl` (e.g. `http://127.0.0.1:8788/#/p/<id>`). Always print it and tell the user they can watch generation live and refine there (annotate, tweaks, versions).
4. **Iterate** — repeat step 2 with the returned `projectId`. The full conversation is kept in the project, so short follow-ups ("把主色换成绿色", "再加一个定价页") work.
5. **Pull the design into the codebase** when the user wants the source:

   ```bash
   curl -s "$VD/api/agent/projects/<projectId>/artifact"
   ```

   Returns `{kind, html}` for single-file designs, or `{kind:"multifile", entry, files}` for multi-file/site prototypes. Write them to disk where the user wants them. Individual files of a multi-file artifact are also served at `$VD/api/mf/<projectId>/<versionId>/<path>`.

## Guidelines

- Choose `skillId: "site-prototype"` when the user wants a multi-page flow (several linked pages), not a single page.
- Keep iteration prompts focused — one change or one page per turn produces better results than batch edits.
- Never paste the whole artifact HTML into the chat unless the user asks; point to the editorUrl or write files to disk.
