// Multi-window deck presenter — a control-room window (current + next slide,
// speaker notes, elapsed timer, slide counter, prev/next) plus an optional
// audience window (fullscreen current slide). The two stay in sync over a
// BroadcastChannel. This is open-design's html-ppt "presenter view" adapted onto
// Vibedesign's self-contained decks: no shared runtime is required — we extract
// slides + notes from whatever the model emitted, render each slide in isolation
// (deck <head> styles, letterbox-scaled), and drive them ourselves.

const CHANNEL = "vd-presenter";

interface DeckModel {
  headStyles: string; // deck <head> with <script> stripped (styles/fonts only)
  bodyClass: string;
  slides: string[]; // outerHTML per slide, in order
  notes: string[]; // speaker notes per slide (index-aligned, "" if none)
}

// Slide detection across the deck skills' conventions, most specific first:
// make-a-deck (<deck-stage> > section), consulting/magazine (.slide), generic.
function pickSlides(doc: Document): Element[] {
  const tries = ["deck-stage > section", "section.slide", ".slide", "[data-slide]", "body > section", "section"];
  let single: Element[] = [];
  for (const sel of tries) {
    const els = Array.from(doc.querySelectorAll(sel));
    if (els.length >= 2) return els;
    if (els.length === 1 && !single.length) single = els;
  }
  return single;
}

// Notes from either make-a-deck's <script id="speaker-notes"> JSON array or
// consulting-deck's per-slide <div class="notes"> / [data-notes].
function pickNotes(doc: Document, slides: Element[]): string[] {
  const jsonEl = doc.querySelector("#speaker-notes");
  if (jsonEl?.textContent) {
    try {
      const arr = JSON.parse(jsonEl.textContent);
      if (Array.isArray(arr)) {
        return slides.map((_, i) => {
          const n = arr[i];
          if (typeof n === "string") return n;
          if (n && typeof n === "object") return String((n as Record<string, unknown>).notes ?? (n as Record<string, unknown>).text ?? "");
          return "";
        });
      }
    } catch {
      /* not JSON — fall through to per-slide notes */
    }
  }
  return slides.map((s) => {
    const el = s.querySelector(".notes, [data-notes]");
    return (el?.textContent || s.getAttribute("data-notes") || "").trim();
  });
}

export function extractDeck(deckHtml: string): DeckModel | null {
  const doc = new DOMParser().parseFromString(deckHtml, "text/html");
  const slideEls = pickSlides(doc);
  if (!slideEls.length) return null;
  return {
    headStyles: doc.head.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, ""),
    bodyClass: doc.body.className,
    slides: slideEls.map((s) => s.outerHTML),
    notes: pickNotes(doc, slideEls),
  };
}

// True when the artifact looks like a slide deck — gates the Presenter button.
export function looksLikeDeck(html: string | null): boolean {
  if (!html) return false;
  return /<deck-stage|class="[^"]*\bslide\b|id="speaker-notes"|data-slide/i.test(html);
}

// A DECK-model string is inlined into each window; slideDoc() rebuilds a single
// slide as a standalone document, letterbox-scaled to the viewport. Shared by
// both windows so they render identically.
const RUNTIME_JS = /* js */ `
  function slideDoc(k){
    var s = DECK.slides[k] || "";
    return '<!doctype html><html><head><meta charset="utf-8">'
      + '<style>html,body{margin:0;height:100%;overflow:hidden;background:#000}</style>'
      + DECK.headStyles
      + '</head><body class="' + DECK.bodyClass.replace(/"/g,'&quot;') + '">'
      + '<div id="__s" style="display:inline-block">' + s + '</div>'
      + '<scr'+'ipt>(function(){var el=document.getElementById("__s");function fit(){if(!el)return;'
      + 'el.style.transform="none";el.style.position="absolute";'
      + 'var w=el.scrollWidth||el.offsetWidth||1,h=el.scrollHeight||el.offsetHeight||1;'
      + 'var sc=Math.min(innerWidth/w,innerHeight/h);el.style.transformOrigin="top left";'
      + 'el.style.left=((innerWidth-w*sc)/2)+"px";el.style.top=((innerHeight-h*sc)/2)+"px";'
      + 'el.style.transform="scale("+sc+")";}'
      + 'addEventListener("resize",fit);if(document.fonts&&document.fonts.ready){document.fonts.ready.then(fit);}'
      + 'setTimeout(fit,60);setTimeout(fit,320);fit();})();</scr'+'ipt>'
      + '</body></html>';
  }
`;

function jsonInline(model: DeckModel): string {
  // Escape </ so an embedded </script> inside slide HTML can't close our tag.
  return JSON.stringify(model).replace(/<\//g, "<\\/");
}

function audienceHtml(model: DeckModel): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Audience</title>
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100vw;height:100vh;display:block}</style>
</head><body>
<iframe id="stage"></iframe>
<script>
var DECK = ${jsonInline(model)};
${RUNTIME_JS}
var stage = document.getElementById('stage'), i = 0;
function show(k){ i = k; stage.srcdoc = slideDoc(i); }
var bc = new BroadcastChannel('${CHANNEL}');
bc.onmessage = function(e){ if(e.data && e.data.type==='goto') show(e.data.i|0); };
bc.postMessage({type:'hello'});
show(0);
addEventListener('keydown', function(e){
  if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown') bc.postMessage({type:'nav', d:1});
  else if(e.key==='ArrowLeft'||e.key==='PageUp') bc.postMessage({type:'nav', d:-1});
});
</script>
</body></html>`;
}

function presenterHtml(model: DeckModel): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Presenter · ${model.slides.length} slides</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:#0c0d10;color:#e8e8ea;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .wrap{display:grid;grid-template-columns:1.55fr 1fr;grid-template-rows:1fr auto;gap:14px;height:100vh;padding:14px}
  .cur{grid-row:1/3;background:#000;border-radius:12px;overflow:hidden;position:relative;border:1px solid #24262c}
  .nxt{background:#000;border-radius:10px;overflow:hidden;position:relative;border:1px solid #24262c;min-height:150px}
  iframe{border:0;width:100%;height:100%;display:block;background:#000}
  .tag{position:absolute;top:8px;left:10px;font-size:12.5px;letter-spacing:.04em;color:#9a9ba1;text-transform:uppercase;z-index:2;background:rgba(0,0,0,.45);padding:2px 8px;border-radius:6px}
  .side{display:flex;flex-direction:column;gap:12px;min-height:0}
  .meta{display:flex;align-items:center;gap:14px}
  .timer{font-variant-numeric:tabular-nums;font-size:30px;font-weight:600}
  .count{font-variant-numeric:tabular-nums;font-size:17px;color:#a7a8ae;margin-left:auto}
  .notes{flex:1;min-height:0;overflow:auto;background:#15161b;border:1px solid #24262c;border-radius:10px;padding:14px 16px;font-size:17px;line-height:1.65;white-space:pre-wrap}
  .notes.empty{color:#6a6b72;font-style:italic}
  .ctrls{display:flex;gap:8px;flex-wrap:wrap}
  button{font:inherit;font-size:14.5px;color:#e8e8ea;background:#1c1d23;border:1px solid #2c2e36;border-radius:8px;padding:8px 14px;cursor:pointer}
  button:hover{background:#252732}
  button.pri{background:#e8613c;border-color:#e8613c;color:#fff}
  .hint{font-size:13px;color:#75767d}
</style></head>
<body>
<div class="wrap">
  <div class="cur"><span class="tag">当前</span><iframe id="cur"></iframe></div>
  <div class="nxt"><span class="tag">下一张</span><iframe id="nxt"></iframe></div>
  <div class="side">
    <div class="meta"><span class="timer" id="timer">00:00</span><span class="count" id="count">— / —</span></div>
    <div class="notes empty" id="notes">（无备注）</div>
    <div class="ctrls">
      <button id="prev">◀ 上一张</button>
      <button id="next" class="pri">下一张 ▶</button>
      <button id="aud">🖥 观众窗口</button>
      <button id="reset">⟲ 计时归零</button>
    </div>
    <div class="hint">← / → / 空格 翻页 · 备注仅演讲者可见 · 观众窗口投到外接屏后按 F 全屏</div>
  </div>
</div>
<script>
var DECK = ${jsonInline(model)};
${RUNTIME_JS}
var i = 0, N = DECK.slides.length, t0 = Date.now(), aud = null;
var cur = document.getElementById('cur'), nxt = document.getElementById('nxt');
var bc = new BroadcastChannel('${CHANNEL}');
function render(){
  cur.srcdoc = slideDoc(i);
  nxt.srcdoc = (i+1 < N) ? slideDoc(i+1) : '<body style="background:#111"></body>';
  document.getElementById('count').textContent = (i+1) + ' / ' + N;
  var n = document.getElementById('notes');
  n.textContent = DECK.notes[i] || '（无备注）';
  n.className = 'notes' + (DECK.notes[i] ? '' : ' empty');
  bc.postMessage({type:'goto', i:i});
}
function go(d){ var k = Math.max(0, Math.min(N-1, i+d)); if(k!==i){ i=k; render(); } }
function goto(k){ k = Math.max(0, Math.min(N-1, k)); if(k!==i){ i=k; render(); } }
document.getElementById('prev').onclick = function(){ go(-1); };
document.getElementById('next').onclick = function(){ go(1); };
document.getElementById('reset').onclick = function(){ t0 = Date.now(); };
document.getElementById('aud').onclick = function(){
  var url = URL.createObjectURL(new Blob([AUD_HTML], {type:'text/html'}));
  aud = window.open(url, 'vd-audience', 'width=1280,height=720');
  setTimeout(render, 300);
};
addEventListener('keydown', function(e){
  if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){ e.preventDefault(); go(1); }
  else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); go(-1); }
  else if(e.key==='Home'){ goto(0); } else if(e.key==='End'){ goto(N-1); }
});
bc.onmessage = function(e){ if(e.data && e.data.type==='nav') go(e.data.d|0); else if(e.data && e.data.type==='hello') render(); };
setInterval(function(){
  var s = Math.floor((Date.now()-t0)/1000);
  var mm = String(Math.floor(s/60)).padStart(2,'0'), ss = String(s%60).padStart(2,'0');
  document.getElementById('timer').textContent = mm + ':' + ss;
}, 500);
var AUD_HTML = ${JSON.stringify(audienceHtml(model)).replace(/<\//g, "<\\/")};
render();
</script>
</body></html>`;
}

// Open the presenter control window for a deck artifact. Returns false if no
// slides could be found (caller can toast the user).
export function openPresenter(deckHtml: string): boolean {
  const model = extractDeck(deckHtml);
  if (!model) return false;
  const url = URL.createObjectURL(new Blob([presenterHtml(model)], { type: "text/html" }));
  const w = window.open(url, "vd-presenter", "width=1280,height=800");
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  return true;
}
