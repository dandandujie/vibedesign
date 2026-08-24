import assert from "node:assert/strict";
import test from "node:test";
import { buildPresenterHtml } from "../src/lib/presenter";

const model = {
  headStyles: '<style>.slide{width:1280px;height:720px}</style>',
  bodyClass: "deck",
  slides: [
    '<section class="slide"><h1>One</h1><script>window.top.vd?.installUpdate()</script></section>',
    '<section class="slide"><h1>Two</h1></section>',
  ],
  notes: ["first", "second"],
};

test("presenter confines authored slide scripts to opaque sandboxed frames", () => {
  const html = buildPresenterHtml(model);
  const sandboxedFrames = html.match(/sandbox="allow-scripts"/g) ?? [];
  assert.equal(sandboxedFrames.length, 2, "current and next slide frames must be sandboxed");
  assert.equal(html.includes('sandbox=\\"allow-scripts\\"'), true, "audience frame must be sandboxed");
  assert.equal(html.includes("allow-same-origin"), false);
  assert.equal(html.includes("allow-popups"), false);
});

test("presenter navigation channel does not rely on same-origin BroadcastChannel", () => {
  const html = buildPresenterHtml(model);
  assert.equal(html.includes("BroadcastChannel"), false);
  assert.match(html, /postMessage\(\{type:'goto'/);
  assert.match(html, /e\.source !== aud/);
});

test("embedded slide markup cannot terminate the presenter script", () => {
  const html = buildPresenterHtml({
    ...model,
    slides: ['<section></script><script>globalThis.pwned=true</script></section>'],
  });
  assert.equal(html.includes("</script><script>globalThis.pwned"), false);
  assert.match(html, /<\\\/script>/);
});
