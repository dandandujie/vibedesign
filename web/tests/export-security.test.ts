import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../src/pages/EditorPage.tsx", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../src/components/Canvas.tsx", import.meta.url), "utf8");
const multiFileViewer = readFileSync(new URL("../src/components/MultiFileViewer.tsx", import.meta.url), "utf8");
const presentOverlay = readFileSync(new URL("../src/components/PresentOverlay.tsx", import.meta.url), "utf8");
const versionManager = readFileSync(new URL("../src/components/VersionManager.tsx", import.meta.url), "utf8");
const projectWorkspace = readFileSync(new URL("../src/pages/ProjectWorkspacePage.tsx", import.meta.url), "utf8");
const main = readFileSync(new URL("../../electron/main.cjs", import.meta.url), "utf8");
const preload = readFileSync(new URL("../../electron/preload.cjs", import.meta.url), "utf8");
const multiFileServer = readFileSync(new URL("../../server/src/multiFile.ts", import.meta.url), "utf8");
const screenshotRender = readFileSync(new URL("../../server/src/screenshotRender.ts", import.meta.url), "utf8");
const motionRender = readFileSync(new URL("../../server/src/motionRender.ts", import.meta.url), "utf8");
const browserRuntime = readFileSync(new URL("../../server/src/browserRuntime.ts", import.meta.url), "utf8");

test("all PDF entry points use the headless render API", () => {
  assert.equal(editor.includes('window.open("", "_blank")'), false);
  assert.equal(editor.includes("document.write(stripWorkingAttrs"), false);
  assert.match(editor, /entry\.action === "save-pdf"[\s\S]*exportCurrentPdf/);
  assert.match(editor, /fetch\("\/api\/render-screenshot"/);
});

test("authored frames cannot inherit the privileged app origin", () => {
  for (const source of [canvas, multiFileViewer, presentOverlay, versionManager, projectWorkspace]) {
    assert.doesNotMatch(source, /sandbox="[^"]*allow-same-origin/);
  }
  assert.match(projectWorkspace, /projectPreviewUrl[\s\S]*sandbox=/);
});

test("Canvas PNG export works without direct same-origin DOM access", () => {
  assert.equal(canvas.includes("contentDocument"), false);
  assert.match(canvas, /html: await requestSerialize\(\)/);
  assert.match(canvas, /fetch\("\/api\/render-screenshot"/);
  assert.match(screenshotRender, /page\.locator\(opts\.selector\)/);
});

test("multi-file page sync uses source-checked messages", () => {
  assert.match(multiFileViewer, /event\.source !== previewRef\.current\?\.contentWindow/);
  assert.match(multiFileViewer, /files\[path\]/);
  assert.match(multiFileServer, /parent\.postMessage\(\{__vdMfPath:/);
});

test("headless renderers cannot access the network and packaged Electron can print PDF", () => {
  assert.match(screenshotRender, /setIsolatedContent\(page, html\)/);
  assert.match(motionRender, /setIsolatedContent\(page, html\)/);
  assert.match(browserRuntime, /setOffline\(true\)/);
  assert.match(browserRuntime, /printElectronPage/);
  assert.match(main, /webContents\.printToPDF/);
});

test("Electron generic artifact previews use an isolated main-process window", () => {
  assert.match(editor, /openArtifactWindow/);
  assert.match(preload, /vd:open-artifact-window/);
  assert.match(main, /ipcMain\.on\("vd:open-artifact-window"/);
  assert.match(main, /function createArtifactWindow/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /contextIsolation: true/);
});

test("the privileged editor window never allows authored blank or blob popups", () => {
  const createWindowSource = main.slice(main.indexOf("function createWindow"));
  const handler = createWindowSource.slice(
    createWindowSource.indexOf("win.webContents.setWindowOpenHandler"),
    createWindowSource.indexOf("// Give the embedded server"),
  );
  assert.equal(handler.includes('url === "about:blank"'), false);
  assert.equal(handler.includes('url.startsWith("blob:")'), false);
  assert.match(handler, /return \{ action: "deny" \}/);
});
