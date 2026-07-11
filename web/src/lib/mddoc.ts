// A6-3: render a Markdown document deliverable (```mddoc) into a self-contained,
// well-typeset HTML document — the second artifact "renderer" beside html. The
// output is plain HTML so the existing canvas, export, versioning and present
// machinery all work unchanged.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Inline: `code`, [text](url), **bold**, *italic*. Code spans are pulled into
// @@Cn@@ placeholders first (so their contents aren't further formatted or
// collided with real digits) then restored at the end.
function inline(s: string): string {
  const codes: string[] = [];
  let t = esc(s).replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(`<code>${c}</code>`);
    return `@@C${codes.length - 1}@@`;
  });
  t = t
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return t.replace(/@@C(\d+)@@/g, (_m, i) => codes[Number(i)]);
}

// Block-level markdown → HTML. Compact but covers docs: headings, hr, fenced
// code, blockquotes, ordered/unordered lists, paragraphs.
export function markdownToBody(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // skip closing fence
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2].trim())}</h${lvl}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      closeList();
      out.push("<hr>");
      i++;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      closeList();
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const want = ul ? "ul" : "ol";
      if (listType !== want) {
        closeList();
        out.push(`<${want}>`);
        listType = want;
      }
      out.push(`<li>${inline((ul ? ul[1] : ol![1]).trim())}</li>`);
      i++;
      continue;
    }
    if (/^\s*$/.test(line)) {
      closeList();
      i++;
      continue;
    }
    // paragraph: gather consecutive non-blank, non-special lines
    closeList();
    const buf: string[] = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s)/.test(lines[i])) {
      buf.push(lines[i++]);
    }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  closeList();
  return out.join("\n");
}

// Wrap the rendered body in a clean, self-contained editorial document.
export function markdownToHtml(md: string, title = "Document"): string {
  const body = markdownToBody(md);
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --ink:#1a1a1f; --muted:#5b5b63; --accent:#c1543a; --border:#e7e3da; --code-bg:#f6f4ef; }
  * { box-sizing: border-box; }
  html,body { margin:0; background:#faf8f4; color:var(--ink); }
  body { font: 17px/1.7 ui-serif, Georgia, "Times New Roman", serif; }
  .doc { max-width: 720px; margin: 0 auto; padding: 72px 32px 120px; }
  h1,h2,h3,h4,h5,h6 { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; line-height:1.25; color:var(--ink); margin: 1.8em 0 .5em; letter-spacing:-0.01em; }
  h1 { font-size: 2.2rem; margin-top: 0; letter-spacing:-0.02em; }
  h2 { font-size: 1.55rem; padding-bottom:.25em; border-bottom:1px solid var(--border); }
  h3 { font-size: 1.2rem; }
  h4,h5,h6 { font-size: 1rem; color:var(--muted); }
  p { margin: 0 0 1.1em; }
  a { color: var(--accent); text-underline-offset: 2px; }
  strong { font-weight: 650; }
  ul,ol { margin: 0 0 1.1em; padding-left: 1.4em; }
  li { margin: .3em 0; }
  blockquote { margin: 1.2em 0; padding: .2em 1.1em; border-left: 3px solid var(--accent); color: var(--muted); font-style: italic; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 2.4em 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em; background: var(--code-bg); padding: .12em .4em; border-radius: 5px; }
  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; overflow-x: auto; margin: 0 0 1.2em; }
  pre code { background: none; padding: 0; font-size: 14px; line-height: 1.55; }
</style>
</head>
<body><article class="doc">
${body}
</article></body>
</html>`;
}
