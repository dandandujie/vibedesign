import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { t } from "../lib/i18n";
import { injectInspector } from "../lib/inspector";
import { SelectedInfo, TreeNode, RectMap, PinTarget } from "../lib/types";

export interface CanvasHandle {
  postCmd: (cmd: Record<string, unknown>) => void;
  serialize: (clean?: boolean) => Promise<string>; // clean strips working attrs (data-vd-id) for export
  getTree: () => Promise<TreeNode | null>;
  getRects: (targets: PinTarget[]) => Promise<RectMap>; // current rects for pin targets
  getScroll: () => Promise<{ x: number; y: number; dw: number; dh: number }>; // scroll offset + document size
  exportPng: (selector: string | null, scale: number) => Promise<string | null>; // data URL
}

interface Props {
  html: string | null;
  refineMode: boolean;
  textEdit?: boolean; // arm inline text editing (edit-select only)
  dimmed?: boolean; // annotate mode before a target is picked (field study §6)
  streaming: boolean;
  awaitingArtifact: boolean;
  onSelected: (info: SelectedInfo | null) => void;
  onDrawn?: () => void; // a drawing-tool shape was committed
  onTextEditStart?: () => void; // an inline text edit began (host snapshots pre-edit state)
  onTextCommit?: () => void; // an inline text edit was committed in-canvas
  onViewport?: () => void; // artifact scrolled/resized — host re-follows pins
  onClaudeRequest?: (reqId: number, prompt: string) => void; // window.claude.complete
}

let reqCounter = 0;

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { html, refineMode, textEdit, dimmed, streaming, awaitingArtifact, onSelected, onDrawn, onTextEditStart, onTextCommit, onViewport, onClaudeRequest },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const serializeWaiters = useRef<Map<number, (html: string) => void>>(new Map());
  const treeWaiters = useRef<Map<number, (tree: TreeNode | null) => void>>(new Map());
  const rectsWaiters = useRef<Map<number, (rects: RectMap) => void>>(new Map());
  const scrollWaiters = useRef<Map<number, (s: { x: number; y: number; dw: number; dh: number }) => void>>(new Map());

  const srcDoc = useMemo(() => (html ? injectInspector(html) : ""), [html]);
  const srcDocRef = useRef("");
  srcDocRef.current = srcDoc;

  const postCmd = (cmd: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(cmd, "*");
  };

  // Backstop for JS-driven navigation (location.href=…, form.submit()): if the
  // preview ever navigates to a real http(s) URL — i.e. the host app — restore
  // the artifact. The in-iframe guard handles anchor/form cases without this
  // flash; this only catches script navigations the guard can't intercept.
  const onIframeLoad = () => {
    try {
      const href = iframeRef.current?.contentWindow?.location.href ?? "";
      if (/^https?:/i.test(href) && iframeRef.current) {
        iframeRef.current.srcdoc = srcDocRef.current;
      }
    } catch {
      /* opaque origin — nothing to do */
    }
  };

  useImperativeHandle(ref, () => ({
    postCmd,
    serialize: (clean?: boolean) =>
      new Promise<string>((resolve) => {
        const reqId = ++reqCounter;
        serializeWaiters.current.set(reqId, resolve);
        postCmd({ __vd_cmd: "serialize", reqId, clean: !!clean });
        setTimeout(() => {
          if (serializeWaiters.current.has(reqId)) {
            serializeWaiters.current.delete(reqId);
            resolve(html ?? "");
          }
        }, 1500);
      }),
    getTree: () =>
      new Promise<TreeNode | null>((resolve) => {
        const reqId = ++reqCounter;
        treeWaiters.current.set(reqId, resolve);
        postCmd({ __vd_cmd: "getTree", reqId });
        setTimeout(() => {
          if (treeWaiters.current.has(reqId)) {
            treeWaiters.current.delete(reqId);
            resolve(null);
          }
        }, 1500);
      }),
    getRects: (targets) =>
      new Promise<RectMap>((resolve) => {
        const reqId = ++reqCounter;
        rectsWaiters.current.set(reqId, resolve);
        postCmd({ __vd_cmd: "getRects", reqId, targets });
        setTimeout(() => {
          if (rectsWaiters.current.has(reqId)) {
            rectsWaiters.current.delete(reqId);
            resolve({});
          }
        }, 1000);
      }),
    getScroll: () =>
      new Promise<{ x: number; y: number; dw: number; dh: number }>((resolve) => {
        const reqId = ++reqCounter;
        scrollWaiters.current.set(reqId, resolve);
        postCmd({ __vd_cmd: "getScroll", reqId });
        setTimeout(() => {
          if (scrollWaiters.current.has(reqId)) {
            scrollWaiters.current.delete(reqId);
            resolve({ x: 0, y: 0, dw: 0, dh: 0 });
          }
        }, 1000);
      }),
    exportPng: async (selector, scale) => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return null;
      const target = selector ? (doc.querySelector(selector) as HTMLElement | null) : doc.body;
      if (!target) return null;
      try {
        const { domToPng } = await import("modern-screenshot");
        return await domToPng(target, { scale, backgroundColor: "transparent" });
      } catch {
        return null;
      }
    },
  }));

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || d.__vd !== true) return;
      if (d.type === "ready") {
        postCmd({ __vd_cmd: "enable", value: refineMode });
        postCmd({ __vd_cmd: "textEdit", value: !!textEdit });
      } else if (d.type === "selected") {
        onSelected(d.info as SelectedInfo | null);
      } else if (d.type === "textEditStart") {
        onTextEditStart?.();
      } else if (d.type === "textCommit") {
        onTextCommit?.();
      } else if (d.type === "serialized") {
        const w = serializeWaiters.current.get(d.reqId);
        if (w) {
          serializeWaiters.current.delete(d.reqId);
          w(d.html as string);
        }
      } else if (d.type === "tree") {
        const w = treeWaiters.current.get(d.reqId);
        if (w) {
          treeWaiters.current.delete(d.reqId);
          w(d.tree as TreeNode | null);
        }
      } else if (d.type === "rects") {
        const w = rectsWaiters.current.get(d.reqId);
        if (w) {
          rectsWaiters.current.delete(d.reqId);
          w(d.rects as RectMap);
        }
      } else if (d.type === "scroll") {
        const w = scrollWaiters.current.get(d.reqId);
        if (w) {
          scrollWaiters.current.delete(d.reqId);
          w({ x: d.x as number, y: d.y as number, dw: d.dw as number, dh: d.dh as number });
        }
      } else if (d.type === "viewport") {
        onViewport?.();
      } else if (d.type === "drawn") {
        onDrawn?.();
      } else if (d.type === "claude") {
        onClaudeRequest?.(d.reqId as number, d.prompt as string);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [refineMode, textEdit, onSelected, onDrawn, onTextEditStart, onTextCommit, onViewport, onClaudeRequest]);

  useEffect(() => {
    postCmd({ __vd_cmd: "enable", value: refineMode });
    if (!refineMode) {
      postCmd({ __vd_cmd: "clear" });
      onSelected(null);
    }
  }, [refineMode]);

  useEffect(() => {
    postCmd({ __vd_cmd: "textEdit", value: !!textEdit });
  }, [textEdit]);

  return (
    <>
      {!html && !awaitingArtifact && (
        <div className="canvas-empty">
          <div className="inner">
            <h2>{t("The canvas is empty")}</h2>
            <p>{t("在左边描述你想要的设计——原型、幻灯片、落地页、one-pager。设计会实时出现在这里。")}</p>
          </div>
        </div>
      )}

      {!html && awaitingArtifact && (
        <div className="canvas-loading">
          <div className="bar" />
        </div>
      )}

      {html && (
        <div className={`canvas-frame ${dimmed ? "dimmed" : ""}`}>
          <iframe
            ref={iframeRef}
            title="artifact"
            srcDoc={srcDoc}
            onLoad={onIframeLoad}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-pointer-lock"
          />
        </div>
      )}
    </>
  );
});
