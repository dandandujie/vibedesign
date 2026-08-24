import assert from "node:assert/strict";
import test from "node:test";
import { withPathNotice } from "../src/multiFile";

test("multi-file path notice cannot corrupt authored markup", () => {
  const html = '<!doctype html><script>const closingTag = "</body>";</script><body>Page</body></html>';
  const served = withPathNotice(html, "pages/home.html");
  assert.equal(served.slice(0, html.length), html);
  assert.match(served.slice(html.length), /parent\.postMessage\(\{__vdMfPath:"pages\/home\.html"/);
});
