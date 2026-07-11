import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { moduleDir } from "./paths.js";

// Craft references loader. A skill declares which sections it needs via its
// front-matter `craft:` list; this module reads the matching files from
// brain/craft/<slug>.md and returns a single concatenated body ready to splice
// into the system prompt. Missing files are dropped silently — a skill can
// forward-reference a craft section we haven't written yet without breaking.
//
// The craft/ directory is the third axis of the design brain (skills =
// artifact shape, design systems = brand, craft = universal how-to). See
// brain/craft/README.md.

// dev: server/src → ../brain/craft ; bundled: server/dist → ./brain/craft
const CRAFT_DIR = existsSync(join(moduleDir, "brain", "craft"))
  ? join(moduleDir, "brain", "craft")
  : join(moduleDir, "..", "brain", "craft");

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export interface CraftBundle {
  body: string; // concatenated markdown, each section under a "### <slug>" heading
  sections: string[]; // which slugs actually resolved to a file
}

export function loadCraft(requested: unknown): CraftBundle {
  if (!Array.isArray(requested) || requested.length === 0) {
    return { body: "", sections: [] };
  }
  const seen = new Set<string>();
  const parts: string[] = [];
  const sections: string[] = [];
  for (const raw of requested) {
    if (typeof raw !== "string") continue;
    const slug = raw.trim().toLowerCase();
    if (!SLUG_RE.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    const filePath = join(CRAFT_DIR, `${slug}.md`);
    if (!existsSync(filePath)) continue; // forward-reference tolerated
    try {
      const text = readFileSync(filePath, "utf8").trim();
      if (!text) continue;
      parts.push(`### ${slug}\n\n${text}`);
      sections.push(slug);
    } catch {
      /* unreadable — skip silently */
    }
  }
  return { body: parts.join("\n\n---\n\n"), sections };
}

// Craft sections applied on every generation when no skill (or a skill without
// its own craft list) is active — the universal floor. anti-ai-slop is NOT
// here: a condensed always-on version lives in brain.ts RUNTIME_ADDENDUM so it
// covers every call without double-injecting the full file. Skills that need
// the full anti-slop file declare it in their own `craft:` list.
export const DEFAULT_CRAFT: string[] = ["typography", "color"];
