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
        borderRadius: parseFloat(cs.borderRadius) || 0
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

  window.addEventListener("message", function (e) {
    var d = e.data || {};
    if (!d.__vd_cmd) return;
    if (d.__vd_cmd === "enable") { enabled = !!d.value; if (!enabled) clearHover(); }
    else if (d.__vd_cmd === "applyStyle" && selected) {
      selected.style[d.prop] = d.value;
      post({ type: "selected", info: describe(selected) });
    }
    else if (d.__vd_cmd === "applyText" && selected) { selected.textContent = d.value; }
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
