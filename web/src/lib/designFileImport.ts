// .fig / .pen design-file import — the open-pencil approach (kiwi codec):
// .fig is an archive of [deflate|zstd]-compressed chunks; chunk 0 is a binary
// kiwi schema, chunk 1 the NODE_CHANGES message. We decode both with
// kiwi-schema (as open-pencil's packages/kiwi does via fig-kiwi) and distill
// design tokens (colors, type, structure, copy) into model context.
// .pen is plain JSON: { version, children: [...] }.
// Everything parses locally in the browser — files are never uploaded.

import type { AttachedContext } from "../components/PlusMenu";

interface FigColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FigNodeChange {
  name?: string;
  type?: string;
  fontSize?: number;
  fontName?: { family?: string; style?: string };
  fillPaints?: { type?: string; color?: FigColor; opacity?: number; visible?: boolean }[];
  strokePaints?: { type?: string; color?: FigColor }[];
  cornerRadius?: number;
  textData?: { characters?: string };
  size?: { x: number; y: number };
}

function hex(c: FigColor): string {
  const h = (n: number) =>
    Math.round(Math.max(0, Math.min(1, n)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function bump(map: Map<string, number>, key: string, n = 1) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function top(map: Map<string, number>, n: number): string[] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}（×${v}）`);
}

// Distill NodeChange-shaped nodes (works for both .fig messages and .pen JSON).
function distill(nodes: FigNodeChange[], docName: string): string {
  const colors = new Map<string, number>();
  const fonts = new Map<string, number>();
  const radii = new Map<string, number>();
  const compNames = new Map<string, number>();
  const texts: string[] = [];

  for (const n of nodes) {
    for (const p of n.fillPaints ?? []) {
      if (p?.type === "SOLID" && p.color && p.visible !== false) bump(colors, hex(p.color));
    }
    for (const p of n.strokePaints ?? []) {
      if (p?.type === "SOLID" && p.color) bump(colors, hex(p.color));
    }
    if (n.fontName?.family) bump(fonts, `${n.fontName.family}${n.fontSize ? ` ${Math.round(n.fontSize)}px` : ""}`);
    if (typeof n.cornerRadius === "number" && n.cornerRadius > 0) bump(radii, `${Math.round(n.cornerRadius)}px`);
    if ((n.type === "SYMBOL" || n.type === "INSTANCE" || n.type === "FRAME") && n.name && n.name.length < 48) {
      bump(compNames, n.name);
    }
    const chars = n.textData?.characters?.trim();
    if (chars && chars.length > 1 && texts.length < 30) texts.push(chars.slice(0, 80));
  }

  return [
    `设计文件「${docName}」提取结果（本地解析，共 ${nodes.length} 个节点）：`,
    colors.size ? `- 色板（高频优先）：${top(colors, 12).join("、")}` : "",
    fonts.size ? `- 字体/字号：${top(fonts, 10).join("、")}` : "",
    radii.size ? `- 圆角：${top(radii, 6).join("、")}` : "",
    compNames.size ? `- 组件/框架：${top(compNames, 14).join("、")}` : "",
    texts.length ? `- 文案样本：${texts.slice(0, 12).map((t) => `“${t}”`).join(" / ")}` : "",
    `设计必须严格使用以上真实 tokens（颜色、字体、圆角）与命名。`,
  ]
    .filter(Boolean)
    .join("\n");
}

function isZstd(b: Uint8Array): boolean {
  return b[0] === 0x28 && b[1] === 0xb5 && b[2] === 0x2f && b[3] === 0xfd;
}

async function inflateChunk(chunk: Uint8Array): Promise<Uint8Array> {
  if (isZstd(chunk)) {
    const { decompress } = await import("fzstd");
    return decompress(chunk);
  }
  const pako = await import("pako");
  try {
    return pako.inflateRaw(chunk);
  } catch {
    return pako.inflate(chunk);
  }
}

async function parseFig(bytes: Uint8Array, name: string): Promise<string> {
  const { FigmaArchiveParser } = await import("fig-kiwi");
  const kiwi = await import("kiwi-schema");
  const { files } = FigmaArchiveParser.parseArchive(bytes);
  if (files.length < 2) throw new Error("不是有效的 .fig 文件");
  const schemaBytes = await inflateChunk(files[0]);
  const dataBytes = await inflateChunk(files[1]);
  const schema = kiwi.compileSchema(kiwi.decodeBinarySchema(schemaBytes)) as {
    decodeMessage: (b: Uint8Array) => { nodeChanges?: FigNodeChange[] };
  };
  const message = schema.decodeMessage(dataBytes);
  const nodes = message.nodeChanges ?? [];
  if (!nodes.length) throw new Error(".fig 中未找到节点数据");
  return distill(nodes, name);
}

function parsePen(text: string, name: string): string {
  const doc = JSON.parse(text) as { children?: unknown[] };
  if (!Array.isArray(doc.children)) throw new Error("不是有效的 .pen 文件");
  // flatten the .pen tree into NodeChange-ish records
  const nodes: FigNodeChange[] = [];
  const walk = (list: unknown[]) => {
    for (const raw of list) {
      const n = raw as FigNodeChange & { children?: unknown[]; fills?: unknown[] };
      nodes.push({
        ...n,
        type: (n.type ?? "").toString().toUpperCase(),
        fillPaints: (n.fillPaints ?? (n.fills as FigNodeChange["fillPaints"])) ?? [],
      });
      if (Array.isArray(n.children)) walk(n.children);
    }
  };
  walk(doc.children);
  return distill(nodes, name);
}

export async function parseDesignFile(file: File): Promise<AttachedContext> {
  const name = file.name;
  let summary: string;
  if (/\.pen$/i.test(name)) {
    summary = parsePen(await file.text(), name);
  } else if (/\.fig$/i.test(name)) {
    summary = await parseFig(new Uint8Array(await file.arrayBuffer()), name);
  } else {
    throw new Error("请选择 .fig 或 .pen 文件");
  }
  return { label: `设计文件：${name}`, text: `\n\n${summary}\n` };
}
