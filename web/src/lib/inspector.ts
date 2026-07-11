// The inspector bridge. This script is injected into every rendered artifact so
// the refinement layer can select elements, edit text, and apply live tweaks —
// all inside the sandboxed iframe, communicating with the parent via
// postMessage. On serialize() it strips every trace of itself, so persisting the
// tweaked artifact never pollutes the user's design (framework stays intact).

export const INSPECTOR_ATTR = "data-vd-inspector";

const INSPECTOR_SCRIPT = String.raw`
(function () {
  if (window.__vd_inspector) return;
  window.__vd_inspector = true;
  var enabled = false, selected = null, hoverEl = null;
  var HL = "__vd_hl", SEL = "__vd_sel";
  var idCounter = 0;                 // stable element ids (data-vd-id)
  var textEditEnabled = false;       // inline text editing armed (edit-select only)
  var editingEl = null, editingOrig = null; // active inline-edit target + original text

  var style = document.createElement("style");
  style.setAttribute("data-vd-inspector", "");
  style.textContent =
    "." + HL + "{outline:1.5px dashed #2a78d6 !important;outline-offset:1px !important;cursor:pointer !important;}" +
    "." + SEL + "{outline:1.5px solid #2a78d6 !important;outline-offset:1px !important;}";
  document.documentElement.appendChild(style);

  function post(msg) { try { parent.postMessage(Object.assign({ __vd: true }, msg), "*"); } catch (e) {} }

  function toHex(c) {
    if (!c) return "";
    var m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return c;
    var p = m[1].split(",").map(function (x) { return parseFloat(x); });
    if (p.length >= 4 && p[3] === 0) return "transparent";
    function h(n) { return ("0" + Math.round(n).toString(16)).slice(-2); }
    return "#" + h(p[0]) + h(p[1]) + h(p[2]);
  }

  function cssPath(el) {
    var parts = [], node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 8) {
      var sel = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
        if (same.length > 1) sel += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  // ---- stable ids + element discovery + kind classification -----------------
  // A host node is anything WE injected (inspector style/script, draw layer,
  // drawn shapes). These must never be selectable, id'd, or counted in paths.
  function isHostNode(el) {
    return !!(el && el.nodeType === 1 && (
      el.hasAttribute("data-vd-inspector") ||
      el.id === "vd-draw-layer" ||
      el.hasAttribute("data-vd-drawn")
    ));
  }

  // Semantic elements worth selecting/annotating — skip pure layout wrappers.
  var DISCOVERY_TAGS = "h1,h2,h3,h4,h5,h6,p,span,a,button,li,img,svg,label,input,textarea,select,td,th,blockquote,figcaption,small,strong,em,code,pre,summary,dt,dd,figure";
  function isDiscoverable(el) {
    if (!el || el.nodeType !== 1 || isHostNode(el)) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;              // ignore slivers
    var tag = el.tagName.toLowerCase();
    if (("," + DISCOVERY_TAGS + ",").indexOf("," + tag + ",") !== -1) return true;
    // a div/section is discoverable only if it directly owns visible text
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3 && n.textContent.trim()) return true;
    }
    return false;
  }

  // Walk up from a raw event target to the nearest discoverable element.
  function closestSelectable(el) {
    while (el && el.nodeType === 1 && el !== document.body) {
      if (isHostNode(el)) return null;
      if (isDiscoverable(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  function kindOf(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "img" || tag === "svg" || tag === "picture") return "image";
    var cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage !== "none") return "image";
    if (el.children.length === 0 && (el.textContent || "").trim()) return "text";
    // container that directly owns text still edits as text
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3 && el.childNodes[i].textContent.trim()) return "text";
    }
    return "container";
  }

  // Assign a stable data-vd-id to every discoverable element that lacks one.
  // Idempotent: elements that already carry an id (e.g. from serialized HTML)
  // keep it, so ids survive reloads, undo/redo and manual edits.
  function assignIds() {
    var all = document.body ? document.body.querySelectorAll("*") : [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (isHostNode(el)) continue;
      if (!el.hasAttribute("data-vd-id") && isDiscoverable(el)) {
        el.setAttribute("data-vd-id", "v" + (++idCounter));
      }
    }
    // keep the counter ahead of any ids already present in the document
    var existing = document.body ? document.body.querySelectorAll("[data-vd-id]") : [];
    for (var j = 0; j < existing.length; j++) {
      var m = /^v(\d+)$/.exec(existing[j].getAttribute("data-vd-id") || "");
      if (m && +m[1] > idCounter) idCounter = +m[1];
    }
  }

  function describe(el) {
    var cs = getComputedStyle(el);
    var leaf = el.children.length === 0;
    var r = el.getBoundingClientRect();
    return {
      path: cssPath(el),
      vid: el.getAttribute("data-vd-id") || "",
      kind: kindOf(el),
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || "").trim().slice(0, 500),
      editable: leaf,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      cls: el.getAttribute("class") || "",
      inlineStyle: el.getAttribute("style") || "",
      styles: {
        color: toHex(cs.color),
        backgroundColor: toHex(cs.backgroundColor),
        fontSize: parseFloat(cs.fontSize) || 0,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing,
        textAlign: cs.textAlign,
        paddingTop: parseFloat(cs.paddingTop) || 0,
        paddingRight: parseFloat(cs.paddingRight) || 0,
        paddingBottom: parseFloat(cs.paddingBottom) || 0,
        paddingLeft: parseFloat(cs.paddingLeft) || 0,
        marginTop: parseFloat(cs.marginTop) || 0,
        marginBottom: parseFloat(cs.marginBottom) || 0,
        borderRadius: parseFloat(cs.borderRadius) || 0,
        overflow: cs.overflow,
        opacity: parseFloat(cs.opacity),
        zIndex: cs.zIndex,
        display: cs.display,
        position: cs.position,
        width: Math.round(r.width),
        height: Math.round(r.height),
        widthRaw: el.style.width || "",
        heightRaw: el.style.height || "",
        alignSelf: cs.alignSelf,
        boxShadow: cs.boxShadow === "none" ? "" : cs.boxShadow,
        border: el.style.border || "",
        transform: el.style.transform || "",
        filter: el.style.filter || "",
        textShadow: cs.textShadow === "none" ? "" : cs.textShadow
      }
    };
  }

  function clearHover() { if (hoverEl) { hoverEl.classList.remove(HL); hoverEl = null; } }

  function select(el) {
    finishEdit(true);            // switching selection commits any active edit
    if (selected) selected.classList.remove(SEL);
    selected = el;
    clearHover();
    el.classList.add(SEL);
    post({ type: "selected", info: describe(el) });
  }

  // ---- inline text editing (click a text element, edit in place) ------------
  // Commit discipline: NEVER commit on iframe blur (moving the mouse to a host
  // overlay blurs the iframe). Only Enter / selecting another target / blank
  // click / leaving edit mode commit; Escape reverts.
  function caretAt(x, y) {
    try {
      if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
      if (document.caretPositionFromPoint) {
        var p = document.caretPositionFromPoint(x, y);
        if (p) { var r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r; }
      }
    } catch (e) {}
    return null;
  }

  function onEditKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finishEdit(true); }
    else if (e.key === "Escape") { e.preventDefault(); finishEdit(false); }
  }

  function startInlineEdit(el, x, y) {
    if (editingEl === el) return;
    post({ type: "textEditStart" }); // host snapshots the pre-edit state for undo
    select(el);                 // reflect in the host panel; also commits prior edit
    editingEl = el;
    editingOrig = el.textContent;
    window.__vd_editing = true; // read by the keydown guard injected in <head>
    try { el.setAttribute("contenteditable", "plaintext-only"); } catch (e) { el.setAttribute("contenteditable", "true"); }
    el.focus();
    var rng = caretAt(x, y);
    if (rng) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(rng); }
    el.addEventListener("keydown", onEditKey, true);
  }

  function finishEdit(commit) {
    if (!editingEl) return;
    var el = editingEl, orig = editingOrig;
    editingEl = null; editingOrig = null;
    window.__vd_editing = false;
    el.removeEventListener("keydown", onEditKey, true);
    el.removeAttribute("contenteditable");
    var val = el.textContent;
    if (!commit) { el.textContent = orig; return; }
    if (val !== orig) {
      post({ type: "textCommit", vid: el.getAttribute("data-vd-id") || "", path: cssPath(el), value: val });
      post({ type: "selected", info: describe(el) });
    }
  }

  document.addEventListener("mouseover", function (e) {
    if (!enabled) return;
    var t = closestSelectable(e.target);
    if (!t || t === selected) return;
    clearHover();
    hoverEl = t;
    t.classList.add(HL);
  }, true);

  document.addEventListener("click", function (e) {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    var t = closestSelectable(e.target);
    if (!t) {
      // clicked blank space — commit any active edit and deselect
      finishEdit(true);
      if (selected) { selected.classList.remove(SEL); selected = null; post({ type: "selected", info: null }); }
      return;
    }
    if (textEditEnabled && (kindOf(t) === "text" || kindOf(t) === "link")) startInlineEdit(t, e.clientX, e.clientY);
    else select(t);
  }, true);

  // Navigation guard: a self-contained artifact must never unload itself.
  // In a srcdoc iframe the document base URL is the PARENT page's URL, so even
  // an in-page link like <a href="#about"> resolves to
  // http://host/#about and replaces the preview with the host app. Placeholder
  // links (<a href="/">) and <form> submits do the same. We block the DEFAULT
  // navigation only (not the event → the prototype's own handlers still run):
  //   #frag  → scroll to that element in-document (no location change)
  //   http(s)/mailto/tel → open in a new tab
  //   everything else (/, relative, empty) → swallowed
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented) return;
    var el = e.target;
    var a = null;
    while (el && el.nodeType === 1) {
      if (el.tagName === "A" && el.hasAttribute("href")) { a = el; break; }
      el = el.parentNode;
    }
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (href.toLowerCase().indexOf("javascript:") === 0) return;
    var target = (a.getAttribute("target") || "").toLowerCase();
    if (target === "_blank") return;
    if (href.charAt(0) === "#") {
      e.preventDefault();
      var id = href.slice(1);
      if (!id) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      var tgt = document.getElementById(id) || document.getElementsByName(id)[0];
      if (tgt && tgt.scrollIntoView) tgt.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    e.preventDefault();
    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      try { window.open(a.href, "_blank", "noopener"); } catch (err) {}
    }
  }, true);

  document.addEventListener("submit", function (e) {
    // Real submits navigate away; prototypes handle data via their own JS,
    // which still fires because we only block the default.
    e.preventDefault();
  }, true);

  function serialize(clean) {
    // Do NOT finishEdit here: serialize is also used to snapshot the pre-edit
    // state (textEditStart). The clone strips contenteditable, and a committed
    // edit is already in the live DOM, so the current text is captured either
    // way without disturbing an in-progress edit.
    var clone = document.documentElement.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll("[data-vd-inspector]"), function (n) { n.remove(); });
    Array.prototype.forEach.call(clone.querySelectorAll("." + HL + ",." + SEL), function (n) {
      n.classList.remove(HL); n.classList.remove(SEL);
      if (n.getAttribute("class") === "") n.removeAttribute("class");
    });
    Array.prototype.forEach.call(clone.querySelectorAll("[contenteditable]"), function (n) { n.removeAttribute("contenteditable"); });
    // data-vd-id rides with working HTML (undo/save/round-trip stay stable);
    // clean=true strips it for export/share/present so the artifact is pristine.
    if (clean) Array.prototype.forEach.call(clone.querySelectorAll("[data-vd-id]"), function (n) { n.removeAttribute("data-vd-id"); });
    return "<!doctype html>\n<html " + attrs(clone) + ">" + clone.innerHTML + "</html>";
  }
  function attrs(el) {
    return Array.prototype.map.call(el.attributes, function (a) { return a.name + '="' + a.value + '"'; }).join(" ");
  }

  // ---- drawing tools: shapes become real DOM inside the artifact ----------
  var drawTool = null, drawing = null;
  var ACCENT = "#d97757";

  function drawLayer() {
    var layer = document.getElementById("vd-draw-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "vd-draw-layer";
      layer.setAttribute("data-vd-drawn", "layer");
      layer.style.cssText = "position:absolute;top:0;left:0;width:100%;pointer-events:none;z-index:9999;";
      document.body.appendChild(layer);
    }
    layer.style.height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) + "px";
    return layer;
  }

  function svgShell(x, y, w, h) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("data-vd-drawn", "1");
    s.style.cssText = "position:absolute;left:" + x + "px;top:" + y + "px;overflow:visible;pointer-events:auto;";
    s.setAttribute("width", Math.max(1, w));
    s.setAttribute("height", Math.max(1, h));
    return s;
  }

  function onDrawDown(e) {
    if (!drawTool) return;
    e.preventDefault();
    e.stopPropagation();
    var layer = drawLayer();
    var x = e.pageX, y = e.pageY;

    if (drawTool === "text") {
      var t = document.createElement("div");
      t.setAttribute("data-vd-drawn", "1");
      t.contentEditable = "true";
      t.style.cssText = "position:absolute;left:" + x + "px;top:" + y + "px;min-width:40px;font-size:18px;color:#1a1a1f;outline:1px dashed " + ACCENT + ";padding:2px 6px;pointer-events:auto;background:transparent;";
      layer.appendChild(t);
      setTimeout(function () { t.focus(); }, 0);
      t.addEventListener("blur", function () {
        t.style.outline = "none";
        if (!t.textContent.trim()) t.remove();
        post({ type: "drawn" });
      });
      return;
    }

    drawing = { x0: x, y0: y };
    if (drawTool === "rectangle" || drawTool === "frame" || drawTool === "oval") {
      var el = document.createElement("div");
      el.setAttribute("data-vd-drawn", "1");
      el.style.cssText = "position:absolute;pointer-events:auto;border:2px " + (drawTool === "frame" ? "dashed" : "solid") + " " + ACCENT + ";" + (drawTool === "oval" ? "border-radius:50%;" : "border-radius:3px;");
      layer.appendChild(el);
      drawing.el = el;
    } else if (drawTool === "line" || drawTool === "arrow") {
      var s = svgShell(x, y, 1, 1);
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("stroke", ACCENT);
      line.setAttribute("stroke-width", "2.5");
      line.setAttribute("stroke-linecap", "round");
      s.appendChild(line);
      if (drawTool === "arrow") {
        var head = document.createElementNS("http://www.w3.org/2000/svg", "path");
        head.setAttribute("fill", ACCENT);
        s.appendChild(head);
        drawing.head = head;
      }
      layer.appendChild(s);
      drawing.el = s;
      drawing.line = line;
    } else if (drawTool === "draw") {
      var s2 = svgShell(0, 0, 1, 1);
      s2.style.left = "0px";
      s2.style.top = "0px";
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("stroke", ACCENT);
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      s2.appendChild(path);
      drawLayer().appendChild(s2);
      drawing.el = s2;
      drawing.path = path;
      drawing.pts = [[x, y]];
    }
  }

  function onDrawMove(e) {
    if (!drawTool || !drawing) return;
    e.preventDefault();
    var x = e.pageX, y = e.pageY, x0 = drawing.x0, y0 = drawing.y0;
    if (drawing.path) {
      drawing.pts.push([x, y]);
      drawing.path.setAttribute("d", "M" + drawing.pts.map(function (p) { return p[0] + " " + p[1]; }).join(" L"));
      return;
    }
    if (drawing.line) {
      var lx = Math.min(x0, x), ly = Math.min(y0, y);
      drawing.el.style.left = lx + "px";
      drawing.el.style.top = ly + "px";
      drawing.el.setAttribute("width", Math.max(1, Math.abs(x - x0)));
      drawing.el.setAttribute("height", Math.max(1, Math.abs(y - y0)));
      drawing.line.setAttribute("x1", x0 - lx);
      drawing.line.setAttribute("y1", y0 - ly);
      drawing.line.setAttribute("x2", x - lx);
      drawing.line.setAttribute("y2", y - ly);
      if (drawing.head) {
        var ang = Math.atan2(y - y0, x - x0), ax = x - lx, ay = y - ly, L = 11;
        var p1 = (ax - L * Math.cos(ang - 0.44)) + " " + (ay - L * Math.sin(ang - 0.44));
        var p2 = (ax - L * Math.cos(ang + 0.44)) + " " + (ay - L * Math.sin(ang + 0.44));
        drawing.head.setAttribute("d", "M" + ax + " " + ay + " L" + p1 + " L" + p2 + " Z");
      }
      return;
    }
    if (drawing.el) {
      drawing.el.style.left = Math.min(x0, x) + "px";
      drawing.el.style.top = Math.min(y0, y) + "px";
      drawing.el.style.width = Math.abs(x - x0) + "px";
      drawing.el.style.height = Math.abs(y - y0) + "px";
    }
  }

  function onDrawUp() {
    if (!drawTool || !drawing) return;
    drawing = null;
    post({ type: "drawn" });
  }

  document.addEventListener("mousedown", onDrawDown, true);
  document.addEventListener("mousemove", onDrawMove, true);
  document.addEventListener("mouseup", onDrawUp, true);

  // ---- window.claude.complete bridge (prototypes call the model) -----------
  var claudeWaiters = {};
  var claudeSeq = 0;
  window.claude = {
    complete: function (prompt) {
      return new Promise(function (resolve, reject) {
        var id = ++claudeSeq;
        claudeWaiters[id] = { ok: resolve, err: reject };
        post({ type: "claude", reqId: id, prompt: String(prompt) });
        setTimeout(function () {
          if (claudeWaiters[id]) { claudeWaiters[id].err(new Error("timeout")); delete claudeWaiters[id]; }
        }, 120000);
      });
    }
  };

  // ---- palette reskin: hue-shift chromatic colors, keep grays/near-b&w ------
  function _parseColor(s) {
    if (!s) return null; s = String(s).trim();
    var m;
    if ((m = s.match(/^#([0-9a-f]{3})$/i))) { var h = m[1]; return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16), a: 1 }; }
    if ((m = s.match(/^#([0-9a-f]{6})$/i))) { var h6 = m[1]; return { r: parseInt(h6.slice(0, 2), 16), g: parseInt(h6.slice(2, 4), 16), b: parseInt(h6.slice(4, 6), 16), a: 1 }; }
    if ((m = s.match(/^#([0-9a-f]{8})$/i))) { var h8 = m[1]; return { r: parseInt(h8.slice(0, 2), 16), g: parseInt(h8.slice(2, 4), 16), b: parseInt(h8.slice(4, 6), 16), a: parseInt(h8.slice(6, 8), 16) / 255 }; }
    if ((m = s.match(/^rgba?\(([^)]+)\)/i))) { var p = m[1].split(",").map(function (x) { return parseFloat(x); }); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    return null;
  }
  function _rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h, s, l = (mx + mn) / 2;
    if (mx === mn) { h = s = 0; } else {
      var dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
      if (mx === r) h = (g - b) / dd + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / dd + 2; else h = (r - g) / dd + 4;
      h /= 6;
    }
    return [h * 360, s, l];
  }
  function _hsl2rgb(h, s, l) {
    h /= 360; var r, g, b;
    if (s === 0) { r = g = b = l; } else {
      function hue(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }
  function shiftColor(str, delta) {
    var c = _parseColor(str); if (!c) return null;
    var hsl = _rgb2hsl(c.r, c.g, c.b);
    if (hsl[1] < 0.12) return null;                 // achromatic (gray/near b&w) — leave it
    var nh = (((hsl[0] + delta) % 360) + 360) % 360;
    var rgb = _hsl2rgb(nh, hsl[1], hsl[2]);
    return c.a < 1 ? "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + c.a + ")" : "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
  }

  var paletteBase = null;   // remembered original :root custom-prop values, for reset
  function applyPalette(delta) {
    var root = document.documentElement;
    // 1. :root custom properties (token-based designs recolor in one step)
    if (!paletteBase) {
      paletteBase = {};
      var names = {};
      try {
        for (var i = 0; i < document.styleSheets.length; i++) {
          var rules; try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
          if (!rules) continue;
          for (var j = 0; j < rules.length; j++) {
            var st = rules[j].style; if (!st) continue;
            for (var k = 0; k < st.length; k++) { if (st[k].indexOf("--") === 0) names[st[k]] = 1; }
          }
        }
      } catch (e2) {}
      var cs = getComputedStyle(root);
      Object.keys(names).forEach(function (n) { paletteBase[n] = cs.getPropertyValue(n).trim(); });
    }
    Object.keys(paletteBase).forEach(function (n) { var sh = shiftColor(paletteBase[n], delta); if (sh) root.style.setProperty(n, sh); });
    // 2. stylesheet color rules → override layer (for hardcoded, non-token colors)
    var css = "";
    try {
      for (var a = 0; a < document.styleSheets.length; a++) {
        var sheet = document.styleSheets[a];
        // never read back our own override sheet — its author-selector rules
        // carry no "data-vd" marker and would be re-shifted cumulatively.
        if (sheet.ownerNode && sheet.ownerNode.id === "vd-palette") continue;
        var rr; try { rr = sheet.cssRules; } catch (e3) { continue; }
        if (!rr) continue;
        for (var b2 = 0; b2 < rr.length; b2++) {
          var rule = rr[b2];
          if (rule.type !== 1 || !rule.style || !rule.selectorText) continue;
          if (rule.selectorText.indexOf("data-vd") !== -1) continue;
          var decl = "";
          ["color", "background-color", "border-color", "outline-color", "fill", "stroke"].forEach(function (prop) {
            var v = rule.style.getPropertyValue(prop);
            if (v && v.indexOf("var(") !== 0) { var sh2 = shiftColor(v, delta); if (sh2) decl += prop + ":" + sh2 + " !important;"; }
          });
          if (decl) css += rule.selectorText + "{" + decl + "}\n";
        }
      }
    } catch (e4) {}
    var tag = document.getElementById("vd-palette");
    if (!tag) { tag = document.createElement("style"); tag.id = "vd-palette"; tag.setAttribute("data-vd-palette", ""); document.documentElement.appendChild(tag); }
    tag.textContent = css;
  }
  function resetPalette() {
    var root = document.documentElement;
    if (paletteBase) Object.keys(paletteBase).forEach(function (n) { root.style.removeProperty(n); });
    var tag = document.getElementById("vd-palette"); if (tag) tag.remove();
  }

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (!d.__vd_cmd) return;
    if (d.__vd_cmd === "enable") { enabled = !!d.value; if (!enabled) { finishEdit(true); clearHover(); } }
    else if (d.__vd_cmd === "textEdit") { textEditEnabled = !!d.value; if (!textEditEnabled) finishEdit(true); }
    else if (d.__vd_cmd === "drawMode") { drawTool = d.tool || null; if (drawTool) { finishEdit(true); enabled = false; clearHover(); } }
    else if (d.__vd_cmd === "claudeResult") {
      var w = claudeWaiters[d.reqId];
      if (w) { d.error ? w.err(new Error(d.error)) : w.ok(d.text); delete claudeWaiters[d.reqId]; }
    }
    else if (d.__vd_cmd === "applyStyle" && selected) {
      selected.style[d.prop] = d.value;
      post({ type: "selected", info: describe(selected) });
    }
    else if (d.__vd_cmd === "applyText" && selected) { selected.textContent = d.value; }
    else if (d.__vd_cmd === "setAttr" && selected) {
      if (d.value === null || d.value === "") selected.removeAttribute(d.name);
      else selected.setAttribute(d.name, d.value);
      post({ type: "selected", info: describe(selected) });
    }
    else if (d.__vd_cmd === "setVar") {
      // Tweaks: set the CSS custom property live, and persist the new value
      // into the data-vd-props declaration so serialize() carries it.
      document.documentElement.style.setProperty(d.name, d.value);
      try {
        var tag = document.querySelector("script[data-vd-props]");
        if (tag) {
          var decl = JSON.parse(tag.textContent);
          (decl.groups || []).forEach(function (g) {
            (g.props || []).forEach(function (p) {
              if (p.var === d.name) p.value = d.raw !== undefined ? d.raw : d.value;
            });
          });
          tag.textContent = JSON.stringify(decl);
        }
      } catch (err) {}
    }
    else if (d.__vd_cmd === "palette") { applyPalette(d.hueDelta || 0); }
    else if (d.__vd_cmd === "paletteReset") { resetPalette(); }
    else if (d.__vd_cmd === "clear") { finishEdit(true); if (selected) { selected.classList.remove(SEL); selected = null; } clearHover(); }
    else if (d.__vd_cmd === "serialize") { post({ type: "serialized", reqId: d.reqId, html: serialize(d.clean) }); }
    else if (d.__vd_cmd === "getTree") {
      function node(el, depth) {
        if (!el || !el.tagName || depth > 6) return null;
        if (el.hasAttribute && el.hasAttribute("data-vd-inspector")) return null;
        var kids = [];
        for (var i = 0; i < el.children.length && kids.length < 14; i++) {
          var n = node(el.children[i], depth + 1);
          if (n) kids.push(n);
        }
        return {
          tag: el.tagName.toLowerCase(),
          cls: (el.getAttribute("class") || "").split(" ").filter(function(c){return c && c.indexOf("__vd")!==0;})[0] || "",
          text: el.children.length === 0 ? (el.textContent || "").trim().slice(0, 22) : "",
          path: cssPath(el),
          kids: kids
        };
      }
      post({ type: "tree", reqId: d.reqId, tree: node(document.body, 0) });
    }
    else if (d.__vd_cmd === "selectByPath") {
      try { var el = document.querySelector(d.path); if (el) select(el); } catch (err) {}
    }
    else if (d.__vd_cmd === "selectByVid") {
      var elv = null;
      try { if (d.vid) elv = document.querySelector('[data-vd-id="' + d.vid + '"]'); } catch (e1) {}
      if (!elv && d.path) { try { elv = document.querySelector(d.path); } catch (e2) {} }
      if (elv) select(elv);
    }
    else if (d.__vd_cmd === "getScroll") {
      post({ type: "scroll", reqId: d.reqId, x: window.scrollX || 0, y: window.scrollY || 0, dw: document.documentElement.scrollWidth, dh: document.documentElement.scrollHeight });
    }
    else if (d.__vd_cmd === "getRects") {
      // Resolve current viewport rects for a set of pin targets (by vid, then
      // path). Powers the host's live-following comment pins.
      var rects = {};
      var ts = d.targets || [];
      for (var ri = 0; ri < ts.length; ri++) {
        var q = ts[ri], elr = null;
        try { if (q.vid) elr = document.querySelector('[data-vd-id="' + q.vid + '"]'); } catch (e7) {}
        if (!elr && q.path) { try { elr = document.querySelector(q.path); } catch (e8) {} }
        if (elr) { var rr = elr.getBoundingClientRect(); rects[q.id] = { x: rr.x, y: rr.y, w: rr.width, h: rr.height }; }
      }
      post({ type: "rects", reqId: d.reqId, rects: rects });
    }
  });

  // Tell the host when the artifact scrolls/resizes so it can re-follow pins.
  var vpRaf = 0;
  function notifyViewport() { if (vpRaf) return; vpRaf = requestAnimationFrame(function () { vpRaf = 0; post({ type: "viewport" }); }); }
  window.addEventListener("scroll", notifyViewport, true);
  window.addEventListener("resize", notifyViewport, true);

  assignIds();
  post({ type: "ready" });
})();
`;

// Keyboard guard — injected at the START of <head>, before any user script can
// register key handlers. It patches addEventListener so that WHILE inline text
// editing is active (window.__vd_editing), the artifact's own keydown handlers
// (a game's WASD, a deck's arrow-key paging) are suppressed — except the keys
// our editor needs (Enter / Escape / Tab). Tagged data-vd-inspector so
// serialize() strips it.
const GUARD_SCRIPT = String.raw`
(function () {
  if (window.__vd_keyguard) return;
  window.__vd_keyguard = true;
  var KEYS = { keydown: 1, keyup: 1, keypress: 1 };
  var ALLOW = { Enter: 1, Escape: 1, Tab: 1 };
  var add = EventTarget.prototype.addEventListener;
  var rm = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, opts) {
    if (KEYS[type] && typeof listener === "function" && !listener.__vd_wrapped_as) {
      var wrapped = function (e) {
        if (window.__vd_editing && !ALLOW[e && e.key]) return;
        return listener.apply(this, arguments);
      };
      listener.__vd_wrapped_as = wrapped;
      return add.call(this, type, wrapped, opts);
    }
    return add.call(this, type, listener, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, opts) {
    if (KEYS[type] && listener && listener.__vd_wrapped_as) return rm.call(this, type, listener.__vd_wrapped_as, opts);
    return rm.call(this, type, listener, opts);
  };
})();
`;

// Inject both bridges. The guard runs first (start of <head>) so it patches
// addEventListener before user scripts register handlers; the main inspector
// runs at </body>. Both are tagged so serialize() removes them — the persisted
// artifact is always clean.
export function injectInspector(html: string): string {
  const guard = `<script ${INSPECTOR_ATTR}>${GUARD_SCRIPT}<\/script>`;
  const main = `<script ${INSPECTOR_ATTR}>${INSPECTOR_SCRIPT}<\/script>`;
  let out = html;
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => `${m}${guard}`);
  else if (/<html[^>]*>/i.test(out)) out = out.replace(/<html[^>]*>/i, (m) => `${m}${guard}`);
  else out = guard + out;
  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${main}</body>`);
  else if (/<\/html>/i.test(out)) out = out.replace(/<\/html>/i, `${main}</html>`);
  else out = out + main;
  return out;
}
