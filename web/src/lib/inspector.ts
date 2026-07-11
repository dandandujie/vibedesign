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

  function describe(el) {
    var cs = getComputedStyle(el);
    var leaf = el.children.length === 0;
    var r = el.getBoundingClientRect();
    return {
      path: cssPath(el),
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
    if (selected) selected.classList.remove(SEL);
    selected = el;
    clearHover();
    el.classList.add(SEL);
    post({ type: "selected", info: describe(el) });
  }

  document.addEventListener("mouseover", function (e) {
    if (!enabled) return;
    var t = e.target;
    if (!t || t === selected || !t.classList) return;
    clearHover();
    hoverEl = t;
    t.classList.add(HL);
  }, true);

  document.addEventListener("click", function (e) {
    if (!enabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.target && e.target.nodeType === 1) select(e.target);
  }, true);

  // Navigation guard: a self-contained artifact should never unload itself.
  // Placeholder links like <a href="/"> or a real <form> submit would
  // otherwise resolve against the parent origin and replace the preview with
  // the host app (or a blank page). We block only the DEFAULT navigation, not
  // the event — so a prototype's own click/submit handlers still run. Runs
  // regardless of refine mode. External http(s) links open in a new tab.
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
    if (href === "" || href.charAt(0) === "#" || href.toLowerCase().indexOf("javascript:") === 0) return;
    var target = (a.getAttribute("target") || "").toLowerCase();
    if (target === "_blank") return; // already opens elsewhere
    e.preventDefault();
    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      try { window.open(a.href, "_blank", "noopener"); } catch (err) {}
    }
    // relative/internal placeholder links: swallowed (no navigation)
  }, false);

  document.addEventListener("submit", function (e) {
    // Real submits navigate away; prototypes handle data via their own JS,
    // which still fires because we only block the default.
    e.preventDefault();
  }, false);

  function serialize() {
    var clone = document.documentElement.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll("[data-vd-inspector]"), function (n) { n.remove(); });
    Array.prototype.forEach.call(clone.querySelectorAll("." + HL + ",." + SEL), function (n) {
      n.classList.remove(HL); n.classList.remove(SEL);
      if (n.getAttribute("class") === "") n.removeAttribute("class");
    });
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

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (!d.__vd_cmd) return;
    if (d.__vd_cmd === "enable") { enabled = !!d.value; if (!enabled) clearHover(); }
    else if (d.__vd_cmd === "drawMode") { drawTool = d.tool || null; if (drawTool) { enabled = false; clearHover(); } }
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
    else if (d.__vd_cmd === "clear") { if (selected) { selected.classList.remove(SEL); selected = null; } clearHover(); }
    else if (d.__vd_cmd === "serialize") { post({ type: "serialized", reqId: d.reqId, html: serialize() }); }
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
  });

  post({ type: "ready" });
})();
`;

// Inject the bridge script just before </body> (or append). We tag it so
// serialize() removes it — the persisted artifact is always clean.
export function injectInspector(html: string): string {
  const tag = `<script ${INSPECTOR_ATTR}>${INSPECTOR_SCRIPT}<\/script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}</body>`);
  if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${tag}</html>`);
  return html + tag;
}
