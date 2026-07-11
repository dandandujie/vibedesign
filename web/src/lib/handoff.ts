// W3-B: build a machine-readable design handoff from a self-contained HTML
// artifact — a manifest a coding agent can consume plus a human-readable brief.
// Pure string generation over the HTML; no dependencies, no network.

const RESPONSIVE_MATRIX = [
  { name: "mobile", w: 390, h: 844 },
  { name: "tablet", w: 834, h: 1112 },
  { name: "laptop", w: 1440, h: 900 },
  { name: "desktop", w: 1920, h: 1080 },
];

// Pull `--token: value;` declarations out of the first :root {} block.
function extractTokens(html: string): { name: string; value: string }[] {
  const root = html.match(/:root\s*\{([\s\S]*?)\}/i);
  if (!root) return [];
  const out: { name: string; value: string }[] = [];
  // value runs to the next ';' or the closing '}'; trailing ';' is optional so
  // the final declaration in the block is captured too.
  const re = /(--[a-z0-9-]+)\s*:\s*([^;}]+);?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(root[1])) !== null) out.push({ name: m[1], value: m[2].trim() });
  return out;
}

function countTag(html: string, tag: string): number {
  return (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) || []).length;
}

function detectInteractions(html: string): string[] {
  const found: string[] = [];
  if (/:hover/i.test(html)) found.push("hover states");
  if (/:focus(-visible)?/i.test(html)) found.push("focus states");
  if (/@media[^{]*prefers-reduced-motion/i.test(html)) found.push("reduced-motion handling");
  if (/@keyframes|transition:/i.test(html)) found.push("animation / transitions");
  if (/<form[\s>]/i.test(html)) found.push("form(s)");
  if (/addEventListener|onclick=/i.test(html)) found.push("scripted interactivity");
  return found;
}

export interface DesignManifest {
  schema: string;
  name: string;
  entry: string;
  generatedBy: string;
  tokens: { name: string; value: string }[];
  structure: { headings: number; buttons: number; links: number; images: number; sections: number; forms: number };
  interactions: string[];
  responsiveViewports: typeof RESPONSIVE_MATRIX;
  implementationChecklist: string[];
}

export function buildDesignManifest(html: string, name: string): DesignManifest {
  return {
    schema: "vibedesign.design-manifest/v1",
    name,
    entry: "index.html",
    generatedBy: "Vibedesign",
    tokens: extractTokens(html),
    structure: {
      headings: ["h1", "h2", "h3", "h4", "h5", "h6"].reduce((n, h) => n + countTag(html, h), 0),
      buttons: countTag(html, "button"),
      links: countTag(html, "a"),
      images: countTag(html, "img"),
      sections: countTag(html, "section") + countTag(html, "main") + countTag(html, "header") + countTag(html, "footer"),
      forms: countTag(html, "form"),
    },
    interactions: detectInteractions(html),
    responsiveViewports: RESPONSIVE_MATRIX,
    implementationChecklist: [
      "Preserve the exact layout, spacing, and type scale of index.html.",
      "Bind the tokens below into the target framework's theme; do not hardcode raw hex.",
      "Reproduce every interaction state (hover / focus / active / disabled / loading / empty / error).",
      "Verify the responsive viewports listed in this manifest.",
      "Meet WCAG AA contrast (body ≥ 4.5:1, large/UI ≥ 3:1) and keyboard operability.",
      "Keep copy verbatim — do not invent metrics or placeholder text.",
    ],
  };
}

export function buildHandoffMd(html: string, name: string): string {
  const m = buildDesignManifest(html, name);
  const tokenLines = m.tokens.length
    ? m.tokens.map((t) => `- \`${t.name}\`: \`${t.value}\``).join("\n")
    : "_No `:root` tokens declared — colors/spacing are inline; extract them before theming._";
  return `# ${name} — design handoff

A self-contained HTML design produced with Vibedesign. \`index.html\` is the source of truth.

## For a coding agent
Convert \`index.html\` into the project's framework, preserving layout, spacing,
typography, color, and **every interaction state** exactly. Read
\`DESIGN-MANIFEST.json\` (schema \`${m.schema}\`) for the machine-readable spec.

## Design tokens
${tokenLines}

## Structure at a glance
- Headings: ${m.structure.headings} · Buttons: ${m.structure.buttons} · Links: ${m.structure.links} · Images: ${m.structure.images} · Sections: ${m.structure.sections} · Forms: ${m.structure.forms}
- Interactions: ${m.interactions.length ? m.interactions.join(", ") : "none detected"}

## Responsive viewports to verify
${m.responsiveViewports.map((v) => `- ${v.name}: ${v.w}×${v.h}`).join("\n")}

## Implementation checklist
${m.implementationChecklist.map((c) => `- [ ] ${c}`).join("\n")}
`;
}
