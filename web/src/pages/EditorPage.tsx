import { useEffect, useMemo, useRef, useState } from "react";
import { t, getLang } from "../lib/i18n";
import { AgentRunState, ChatMessage, Meta, streamChat, saveDesignSystem } from "../lib/api";
import { extractArtifact, extractDeliverable, extractForm, extractProps, extractDesignSystemSpec, extractDesignSystemTokens, stripWorkingAttrs, extractLiveSpec, extractFiles, extractSite, SiteManifest } from "../lib/artifact";
import { LiveArtifact, createLiveArtifact, getLiveArtifact } from "../lib/liveApi";
import { LiveArtifactViewer } from "../components/LiveArtifactViewer";
import { ArtifactVersion, SelectedInfo, RectMap, PinTarget } from "../lib/types";
import { Project, CommentPin, getProject, saveProject, deleteProject, newProject, newProjectSession } from "../lib/projects";
import { ChatPanel } from "../components/ChatPanel";
import { Canvas, CanvasHandle } from "../components/Canvas";
import { CommentPopover } from "../components/CommentPopover";
import { SharePopover } from "../components/SharePopover";
import { TweaksPanel, TweaksAsk } from "../components/TweaksPanel";
import { QuestionFormView } from "../components/QuestionFormView";
import { openPresenter, looksLikeDeck } from "../lib/presenter";
import { MultiFileViewer } from "../components/MultiFileViewer";
import { PhoneFrame, PhoneShell, SHELL_OPTIONS, normalizeShell } from "../components/PhoneFrame";
import { CommentsPanel } from "../components/CommentsPanel";
import { AnnotateDrawOverlay, Mark, ANNOTATE_ACCENT } from "../components/AnnotateDrawOverlay";
import { EditPanel } from "../components/EditPanel";
import { EditTool } from "../components/EditToolbar";
import { PresentOverlay } from "../components/PresentOverlay";
import { VersionManager } from "../components/VersionManager";
import { PalettePopover } from "../components/PalettePopover";
import { SkillsModal } from "../components/SkillsModal";
import { SkillEntry } from "../lib/skillCatalog";
import {
  AppBadge,
  ChevronDown,
  PanelLeft,
  HistoryIcon,
  RefreshIcon,
  PencilIcon,
  CopyIcon,
  ExternalLink,
  TrashIcon,
  ChevronRight,
} from "../components/icons";
import { clampPop } from "../lib/popover";

type CanvasTool = null | "annotate" | "edit" | "tweaks";

interface Props {
  projectId: string;
  meta: Meta | null;
  onMetaChanged: () => void;
  onOpenSettings: () => void;
}

export function EditorPage({ projectId, meta, onMetaChanged, onOpenSettings }: Props) {
  const [proj, setProj] = useState<Project | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [agentRun, setAgentRun] = useState<AgentRunState | null>(null);
  const [activeSkill, setActiveSkill] = useState<SkillEntry | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  // Pending skill-inputs form: shown once (before generation) when the picked
  // skill declares typed inputs; answers are folded into the brief.
  const [skillInputForm, setSkillInputForm] = useState<{ brief: string; images?: string[] } | null>(null);
  const pendingInputsRef = useRef(false);
  const [selected, setSelected] = useState<SelectedInfo | null>(null);
  const [tool, setTool] = useState<CanvasTool>(null);
  const [editTool, setEditTool] = useState<EditTool>("select");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [presentMenu, setPresentMenu] = useState(false);
  const [presenting, setPresenting] = useState<null | "tab" | "fullscreen">(null);
  const [editDraft, setEditDraft] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [projMenu, setProjMenu] = useState(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [pinRects, setPinRects] = useState<RectMap>({}); // live positions of comment pins
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [vmOpen, setVmOpen] = useState(false);
  const [sessionChain, setSessionChain] = useState<Project[]>([]);

  // Session menu: load the ancestor session chain (parentProjectId …) when opened,
  // so "new session" and "chat history" live in one mental model — sessions you
  // can go back to, plus the current conversation's messages.
  useEffect(() => {
    if (!historyOpen || !proj) return;
    let cancelled = false;
    (async () => {
      const chain: Project[] = [];
      let cur: Project = proj;
      const seen = new Set<string>();
      while (cur.parentProjectId && !seen.has(cur.parentProjectId)) {
        seen.add(cur.parentProjectId);
        const p = await getProject(cur.parentProjectId);
        if (!p) break;
        chain.push(p);
        cur = p;
      }
      if (!cancelled) setSessionChain(chain);
    })();
    return () => {
      cancelled = true;
    };
  }, [historyOpen, proj]);
  const [drawAnnotate, setDrawAnnotate] = useState(false); // visual-annotation draw mode
  const [liveArt, setLiveArt] = useState<LiveArtifact | null>(null); // active Live artifact
  const [device, setDevice] = useState<"web" | "mobile" | "app">("web"); // prototype viewport
  const [shell, setShell] = useState<PhoneShell>(() => normalizeShell(localStorage.getItem("vd_shell")));

  const canvasRef = useRef<CanvasHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const bufRef = useRef("");
  const seededRef = useRef(false);
  const lastSnapRef = useRef(0);
  const pendingSaveRef = useRef<Project | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const hasProvider = !!(meta && meta.activeProviderId);

  const flushProjectSave = (keepalive = false) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    void saveProject(pending, { keepalive }).catch((err) => {
      console.error("自动保存失败", err);
      if (!keepalive && mountedRef.current) {
        if (!pendingSaveRef.current) pendingSaveRef.current = pending;
        setError(`自动保存失败：${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  useEffect(() => () => abortRef.current?.(), []);

  useEffect(() => {
    mountedRef.current = true;
    const beforeUnload = () => flushProjectSave(true);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("beforeunload", beforeUnload);
      flushProjectSave(true);
    };
  }, []);

  useEffect(() => {
    let stale = false;
    abortRef.current?.();
    abortRef.current = null;
    setStreaming(false);
    setAgentRun(null);
    setProj(null);
    setTool(null);
    setSelected(null);
    seededRef.current = false;
    getProject(projectId).then((p) => {
      if (stale) return;
      if (!p) {
        location.hash = "#/";
        return;
      }
      setProj((prev) => prev ?? p);
    });
    return () => {
      stale = true;
      flushProjectSave(true);
    };
  }, [projectId]);

  useEffect(() => {
    if (!proj) return;
    pendingSaveRef.current = proj;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushProjectSave(), 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [proj]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = (p: Partial<Project>) => setProj((prev) => (prev ? { ...prev, ...p } : prev));

  const messages = proj?.messages ?? [];
  const artifacts = proj?.artifacts ?? [];
  const activeVersionId = proj?.activeVersionId ?? null;

  const lastAssistant =
    messages.length && messages[messages.length - 1].role === "assistant"
      ? messages[messages.length - 1].content
      : "";
  const liveArtifact = streaming ? extractArtifact(lastAssistant) : null;
  const activeVersion = artifacts.find((a) => a.id === activeVersionId) ?? null;
  const canvasHtml = liveArtifact ?? editDraft ?? activeVersion?.html ?? null;
  const awaitingArtifact = streaming && !canvasHtml;
  const activeIdx = artifacts.findIndex((a) => a.id === activeVersionId);
  const fileName = activeVersion ? `${(proj?.name || "Design").slice(0, 14)} · v${activeIdx + 1}` : t("No file open");

  const pendingForm = !streaming && messages.length > 0 ? extractForm(lastAssistant) : null;
  const tweakGroups = canvasHtml ? extractProps(canvasHtml) : null;

  useEffect(() => {
    if (!proj) return;
    document.title = `${streaming ? "✶ " : "✓ "}${proj.name}`;
    return () => {
      document.title = "Vibedesign";
    };
  }, [streaming, proj?.name]);

  // ---- Chat turn ----------------------------------------------------------
  const runTurn = (sendMessages: ChatMessage[]) => {
    const startedAt = Date.now();
    setStreaming(true);
    setAgentRun({
      phase: "preparing",
      status: "running",
      startedAt,
      phaseStartedAt: startedAt,
      lastActivityAt: startedAt,
    });
    setError(null);
    setSelected(null);
    bufRef.current = "";
    setProj((prev) => (prev ? { ...prev, messages: [...sendMessages, { role: "assistant", content: "" }] } : prev));

    abortRef.current = streamChat(
      {
        messages: sendMessages,
        providerId: meta?.activeProviderId,
        skillId: activeSkill?.skillId ?? null,
        extraInstruction: activeSkill?.extraInstruction ?? null,
        designSystemId: proj?.designSystemId,
        lang: getLang(),
      },
      {
        onText: (delta) => {
          const now = Date.now();
          setAgentRun((prev) => (prev ? { ...prev, lastActivityAt: now } : prev));
          bufRef.current += delta;
          const buf = bufRef.current;
          setProj((prev) => {
            if (!prev) return prev;
            const msgs = prev.messages.slice();
            if (msgs.length && msgs[msgs.length - 1].role === "assistant") {
              msgs[msgs.length - 1] = { role: "assistant", content: buf };
            } else {
              msgs.push({ role: "assistant", content: buf });
            }
            return { ...prev, messages: msgs };
          });
        },
        onStatus: (phase) => {
          const now = Date.now();
          setAgentRun((prev) =>
            prev
              ? {
                  ...prev,
                  phase,
                  phaseStartedAt: phase === prev.phase ? prev.phaseStartedAt : now,
                  lastActivityAt: now,
                }
              : prev,
          );
        },
        onHeartbeat: () => {
          const now = Date.now();
          setAgentRun((prev) => (prev?.status === "running" ? { ...prev, lastActivityAt: now } : prev));
        },
        onError: (msg) => {
          const now = Date.now();
          setError(msg);
          setAgentRun((prev) =>
            prev ? { ...prev, status: "error", lastActivityAt: now, endedAt: now } : prev,
          );
        },
        onDone: () => {
          const now = Date.now();
          abortRef.current = null;
          setStreaming(false);
          setAgentRun((prev) =>
            prev?.status === "running"
              ? { ...prev, status: "completed", lastActivityAt: now, endedAt: now }
              : prev,
          );
          const buf = bufRef.current;
          const lastUserAll = [...sendMessages].reverse().find((m) => m.role === "user");
          const promptAll = lastUserAll ? lastUserAll.content.split(/```|\n（/)[0].trim().slice(0, 60) : undefined;
          // Site / flow prototype (```vdsite): multi-page artifact — checked
          // BEFORE plain vdfiles. Then multi-file (```vdfiles): preview.entry +
          // sibling files, served over /api/mf. Both supersede the single-file
          // deliverable path.
          const site = extractSite(buf);
          const mf = site ? null : extractFiles(buf);
          const deliverable = site || mf ? null : extractDeliverable(buf);
          if (site) {
            const v: ArtifactVersion = {
              id: crypto.randomUUID(),
              html: site.files[site.entry] ?? "",
              label: buf.match(/^####\s+(.+)$/m)?.[1]?.trim().slice(0, 40) ?? `站点 · ${site.site?.pages?.length ?? 0} 页`,
              createdAt: Date.now(),
              kind: "multifile",
              source: "ai",
              files: site.files,
              entry: site.entry,
              ...(site.site ? { site: site.site } : {}),
              ...(promptAll ? { prompt: promptAll } : {}),
            };
            setProj((prev) => {
              if (!prev) return prev;
              const next = { ...prev, artifacts: [...prev.artifacts, v], activeVersionId: v.id, liveArtifactId: null };
              void saveProject(next); // persist immediately so /api/mf can serve it before the iframe loads
              return next;
            });
            setEditDraft(null);
            setDirty(false);
            setLiveArt(null);
          }
          if (mf) {
            const v: ArtifactVersion = {
              id: crypto.randomUUID(),
              html: mf.files[mf.entry] ?? "",
              label: `多文件 · ${mf.entry}`,
              createdAt: Date.now(),
              kind: "multifile",
              source: "ai",
              files: mf.files,
              entry: mf.entry,
              ...(promptAll ? { prompt: promptAll } : {}),
            };
            setProj((prev) => {
              if (!prev) return prev;
              const next = { ...prev, artifacts: [...prev.artifacts, v], activeVersionId: v.id, liveArtifactId: null };
              void saveProject(next); // persist immediately so /api/mf can serve it before the iframe loads
              return next;
            });
            setEditDraft(null);
            setDirty(false);
            setLiveArt(null);
          }
          if (deliverable) {
            const art = deliverable.html;
            const lastUser = [...sendMessages].reverse().find((m) => m.role === "user");
            const promptSnippet = lastUser ? lastUser.content.split(/```|\n（/)[0].trim().slice(0, 60) : undefined;
            setProj((prev) => {
              if (!prev) return prev;
              const prevArts = prev.artifacts;
              const last = prevArts[prevArts.length - 1];
              // dedup: an identical re-generation just re-activates the last version
              if (last && last.html === art) {
                return { ...prev, activeVersionId: last.id, liveArtifactId: null };
              }
              const v: ArtifactVersion = {
                id: crypto.randomUUID(),
                html: art,
                label: deliverable.title,
                createdAt: Date.now(),
                kind: deliverable.kind,
                source: "ai",
                ...(promptSnippet ? { prompt: promptSnippet } : {}),
              };
              return { ...prev, artifacts: [...prevArts, v], activeVersionId: v.id, liveArtifactId: null };
            });
            setEditDraft(null);
            setDirty(false);
            setLiveArt(null); // a static artifact supersedes any live one
          }

          // A Live artifact spec (```vdlive) → persist server-side + render it.
          const liveSpec = extractLiveSpec(buf);
          if (liveSpec) {
            void createLiveArtifact({
              projectId,
              title: liveSpec.title || (proj?.name ?? "Live artifact"),
              templateHtml: liveSpec.template,
              dataJson: liveSpec.data ?? {},
              source: liveSpec.source,
            })
              .then((la) => {
                setLiveArt(la);
                patch({ liveArtifactId: la.id });
                setToast("Live 设计已生成，可点「刷新」更新数据");
              })
              .catch((e) => setError(e instanceof Error ? e.message : String(e)));
          }
          // DS setup flow: persist the spec block as a reusable design system.
          const dsSpec = extractDesignSystemSpec(buf);
          if (dsSpec) {
            const dsTokens = extractDesignSystemTokens(buf);
            setProj((prev) => {
              if (prev) {
                const dsName = prev.name.replace(/\s*·\s*Design System$/i, "") || "Design system";
                void saveDesignSystem({
                  id: crypto.randomUUID().slice(0, 8),
                  name: dsName,
                  content: dsSpec,
                  tokensCss: dsTokens ?? undefined,
                  updatedAt: 0,
                }).then(() => setToast(`Design system「${dsName}」已保存，可在首页选用`));
              }
              return prev;
            });
          }
          setActiveSkill(null);
        },
      },
    );
  };

  useEffect(() => {
    if (!proj || seededRef.current || !meta) return;
    const raw = sessionStorage.getItem(`vd_seed_${projectId}`);
    if (raw && proj.messages.length === 0 && hasProvider) {
      seededRef.current = true;
      sessionStorage.removeItem(`vd_seed_${projectId}`);
      let text = raw;
      let images: string[] | undefined;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.text === "string") {
          text = parsed.text;
          images = parsed.images;
        }
      } catch {
        /* legacy */
      }
      runTurn([{ role: "user", content: text, ...(images?.length ? { images } : {}) }]);
    }
  }, [proj, meta]);

  const handleSend = async (text: string, images?: string[]) => {
    if (streaming || !hasProvider || !proj) return;
    // Skill with declared inputs: collect them once, before generating.
    if (pendingInputsRef.current && activeSkill?.inputs) {
      pendingInputsRef.current = false;
      setSkillInputForm({ brief: text, ...(images?.length ? { images } : {}) });
      return;
    }
    let content = text;
    const continuingFromCanvas = messages.length === 0 && !!canvasHtml;
    if ((dirty || continuingFromCanvas) && canvasHtml) {
      const html = (await canvasRef.current?.serialize()) || canvasHtml;
      const note = continuingFromCanvas
        ? "这是上一会话留下的当前设计。请把它作为本次新会话的起点，只依据本会话的指令继续修改并重新输出完整文档"
        : "这是我在画布上手动微调后的当前设计，请在此基础上修改并重新输出完整文档";
      content = `${text}\n\n（${note}）\n\n\`\`\`html\n${html}\n\`\`\``;
      setDirty(false);
    }
    runTurn([...messages, { role: "user", content, ...(images?.length ? { images } : {}) }]);
  };

  // Skill-inputs form submitted: fold the answers into the original brief.
  const submitSkillInputs = (answersText: string) => {
    const pending = skillInputForm;
    setSkillInputForm(null);
    if (!pending) return;
    const brief = pending.brief.trim();
    const content = `${brief ? brief + "\n\n" : ""}${answersText}`;
    runTurn([...messages, { role: "user", content, ...(pending.images?.length ? { images: pending.images } : {}) }]);
  };

  const stop = () => {
    abortRef.current?.();
    setStreaming(false);
    const now = Date.now();
    setAgentRun((prev) =>
      prev?.status === "running" ? { ...prev, status: "stopped", lastActivityAt: now, endedAt: now } : prev,
    );
  };

  // ---- Undo / redo ---------------------------------------------------------
  const snapshot = async () => {
    const now = Date.now();
    if (now - lastSnapRef.current < 700) return; // throttle bursts (slider drags)
    lastSnapRef.current = now;
    const html = await canvasRef.current?.serialize();
    if (html) {
      setUndoStack((s) => [...s.slice(-29), html]);
      setRedoStack([]);
    }
  };

  const snapshotBeforeDraw = (html: string) => {
    if (!html) return;
    lastSnapRef.current = Date.now();
    setUndoStack((s) => [...s.slice(-29), html]);
    setRedoStack([]);
  };

  const undo = async () => {
    if (!undoStack.length) return;
    const cur = await canvasRef.current?.serialize();
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    if (cur) setRedoStack((s) => [...s, cur]);
    setEditDraft(prev);
    setDirty(true);
    setReloadNonce((n) => n + 1);
    setSelected(null);
  };

  const redo = async () => {
    if (!redoStack.length) return;
    const cur = await canvasRef.current?.serialize();
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    if (cur) setUndoStack((s) => [...s, cur]);
    setEditDraft(next);
    setDirty(true);
    setReloadNonce((n) => n + 1);
    setSelected(null);
  };

  // ---- Refinement ----------------------------------------------------------
  const applyStyle = (prop: string, value: string) => {
    void snapshot();
    canvasRef.current?.postCmd({ __vd_cmd: "applyStyle", prop, value });
    setDirty(true);
  };
  const applyText = (value: string) => {
    void snapshot();
    canvasRef.current?.postCmd({ __vd_cmd: "applyText", value });
    setDirty(true);
  };
  const setAttr = (name: string, value: string | null) => {
    void snapshot();
    canvasRef.current?.postCmd({ __vd_cmd: "setAttr", name, value });
    setDirty(true);
  };
  const saveVersion = async () => {
    if (!canvasRef.current || !proj) return;
    const html = await canvasRef.current.serialize();
    const last = artifacts[artifacts.length - 1];
    if (last && last.html === html) {
      setEditDraft(null);
      setDirty(false);
      setToast("与最新版本相同，未新建");
      return;
    }
    const v: ArtifactVersion = { id: crypto.randomUUID(), html, label: "手动微调", createdAt: Date.now(), source: "manual" };
    patch({ artifacts: [...artifacts, v], activeVersionId: v.id });
    setEditDraft(null);
    setDirty(false);
    setToast("已存为新版本");
  };

  // Site page management (MultiFileViewer): rename/reorder/delete/add page —
  // every edit becomes a new manual version so the history stays append-only.
  const editSitePages = (files: Record<string, string>, site: SiteManifest) => {
    if (!activeVersion || activeVersion.kind !== "multifile") return;
    const entry =
      activeVersion.entry && files[activeVersion.entry]
        ? activeVersion.entry
        : Object.keys(files).find((p) => /\.html?$/i.test(p)) ?? "";
    const v: ArtifactVersion = {
      id: crypto.randomUUID(),
      html: files[entry] ?? "",
      label: `${activeVersion.label} · ${t("页面调整")}`,
      createdAt: Date.now(),
      kind: "multifile",
      source: "manual",
      files,
      entry,
      site,
    };
    setProj((prev) => {
      if (!prev) return prev;
      const next = { ...prev, artifacts: [...prev.artifacts, v], activeVersionId: v.id };
      void saveProject(next); // persist so /api/mf serves the edited files immediately
      return next;
    });
    setToast(t("已存为新版本"));
  };

  const discardEdit = () => {    setEditDraft(null);
    setDirty(false);
    setSelected(null);
    setUndoStack([]);
    setRedoStack([]);
    setReloadNonce((n) => n + 1);
    setTool(null);
  };
  const applyCode = (html: string) => {
    void snapshot();
    setEditDraft(html);
    setDirty(true);
    setSelected(null);
  };
  const selectByPath = (path: string) => canvasRef.current?.postCmd({ __vd_cmd: "selectByPath", path });

  const askTweaks = async (description: string) => {
    if (!canvasRef.current) return;
    setTool(null);
    const html = await canvasRef.current.serialize();
    const content =
      `为当前设计添加可调 Tweaks 控件（按 data-vd-props 协议声明；值只通过带 fallback 的 CSS 自定义属性生效；保留已有 props）：${description}` +
      `\n\n（这是当前设计的完整 HTML，请在此基础上修改并重新输出完整文档）\n\n\`\`\`html\n${html}\n\`\`\``;
    setDirty(false);
    runTurn([...messages, { role: "user", content }]);
  };

  const setTweakVar = (name: string, value: string, raw: number | string) => {
    canvasRef.current?.postCmd({ __vd_cmd: "setVar", name, value, raw });
    setDirty(true);
  };

  const submitFormAnswers = (answersText: string) => runTurn([...messages, { role: "user", content: answersText }]);

  // ---- Comments -------------------------------------------------------------
  const comments = proj?.comments ?? [];

  // A3-2: live-following pins. Re-query target rects from the iframe whenever
  // the annotate tool, comments, selection, artifact or viewport change. The
  // iframe rAF-throttles viewport events, so scroll/resize follow smoothly.
  const refreshPins = async () => {
    if (tool !== "annotate" || !canvasRef.current) { setPinRects({}); return; }
    const targets: PinTarget[] = comments
      .filter((c) => !c.resolved && c.path)
      .map((c) => ({ id: c.id, vid: c.vid, path: c.path }));
    if (!targets.length) { setPinRects({}); return; }
    setPinRects(await canvasRef.current.getRects(targets));
  };
  const refreshPinsRef = useRef(refreshPins);
  refreshPinsRef.current = refreshPins;
  const onViewport = useRef(() => void refreshPinsRef.current()).current;

  useEffect(() => {
    void refreshPinsRef.current();
  }, [tool, proj?.comments, reloadNonce, selected, canvasHtml]);

  // Load the active Live artifact when the project references one.
  useEffect(() => {
    const id = proj?.liveArtifactId;
    if (!id) {
      setLiveArt(null);
      return;
    }
    if (liveArt?.id === id) return;
    let stale = false;
    void getLiveArtifact(id).then((la) => {
      if (!stale) setLiveArt(la);
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proj?.liveArtifactId]);

  const resolveComment = (id: string) => patch({ comments: comments.map((c) => (c.id === id ? { ...c, resolved: true } : c)) });
  const deleteComment = (id: string) => patch({ comments: comments.filter((c) => c.id !== id) });
  const addGlobalComment = (text: string) =>
    patch({ comments: [...comments, { id: crypto.randomUUID(), path: "", text, resolved: false, createdAt: Date.now() }] });
  const sendAllComments = async () => {
    const open = comments.filter((c) => !c.resolved);
    if (!open.length || !canvasRef.current) return;
    const html = await canvasRef.current.serialize();
    const list = open.map((c, i) => renderCommentTarget(c, i)).join("\n");
    const content =
      `${SCOPE_RULE}\n\n请逐条处理以下画布评论（每条只改它点名的元素）：\n${list}\n\n` +
      `（这是当前设计的完整 HTML，请在此基础上精确修改并重新输出完整文档）\n\n\`\`\`html\n${html}\n\`\`\``;
    patch({ comments: comments.map((c) => ({ ...c, resolved: true })) });
    setTool(null);
    runTurn([...messages, { role: "user", content }]);
  };

  const sendTargeted = async (instruction: string, pin?: CommentPin, images?: string[]) => {
    if (!canvasRef.current || !proj) return;
    const html = await canvasRef.current.serialize();
    const targetBlock = selected ? renderTarget(selected) + "\n\n" : "";
    const content =
      `${SCOPE_RULE}\n\n${targetBlock}要求：${instruction}\n\n` +
      `（这是当前设计的完整 HTML，请在此基础上精确修改并重新输出完整文档）\n\n\`\`\`html\n${html}\n\`\`\``;
    if (pin) patch({ comments: [...(proj.comments ?? []), pin] });
    setDirty(false);
    clearSelection();
    runTurn([...messages, { role: "user", content, ...(images?.length ? { images } : {}) }]);
  };

  const pinCtx = (): Pick<CommentPin, "vid" | "ctx"> =>
    selected ? { vid: selected.vid || undefined, ctx: { tag: selected.tag, text: selected.text.slice(0, 120) } } : {};

  // A3-3: composite the drawn marks onto a screenshot and send it to the model.
  const sendVisualAnnotation = async (marks: Mark[]) => {
    if (!canvasRef.current || !marks.length) return;
    // Capture <html> (the whole viewport), not <body> — a centered/narrow body
    // would mis-scale the marks, which are in viewport coords.
    const base = await canvasRef.current.exportPng("html", 2);
    if (!base) { setToast("截图失败，无法发送标注"); return; }
    const { x: ox, y: oy, dw } = await canvasRef.current.getScroll();
    const html = await canvasRef.current.serialize();
    const composite = await compositeMarks(base, marks, ox, oy, dw);
    setDrawAnnotate(false);
    setTool(null);
    const content =
      `我在设计截图上用橙色标注（框 / 箭头 / 涂画）圈出了要修改的地方。请对照截图理解每处标注的意图，只改标注涉及的部分，精确修改并重新输出完整 HTML 文档。\n\n` +
      `\`\`\`html\n${html}\n\`\`\``;
    runTurn([...messages, { role: "user", content, images: [composite] }]);
  };

  const addCommentOnly = (text: string) => {
    if (!selected || !proj) return;
    patch({
      comments: [
        ...comments,
        { id: crypto.randomUUID(), path: selected.path, ...pinCtx(), text, resolved: false, createdAt: Date.now() },
      ],
    });
    clearSelection();
  };
  const submitCommentToClaude = (text: string, images?: string[]) => {
    if (!selected) return;
    const pin: CommentPin = {
      id: crypto.randomUUID(),
      path: selected.path,
      ...pinCtx(),
      text,
      resolved: false,
      createdAt: Date.now(),
    };
    sendTargeted(text, pin, images);
  };

  const clearSelection = () => {
    canvasRef.current?.postCmd({ __vd_cmd: "clear" });
    setSelected(null);
  };

  const switchTool = (t: CanvasTool) => {
    setTool((cur) => (cur === t ? null : t));
    setEditTool("select");
    setPaletteOpen(false);
    setDrawAnnotate(false);
    canvasRef.current?.postCmd({ __vd_cmd: "drawMode", tool: null });
    clearSelection();
  };

  // Draw tools: forward the active tool to the bridge; shapes land in the DOM.
  const changeEditTool = (t: EditTool) => {
    setEditTool(t);
    const isDraw = t !== "select" && t !== "interact";
    canvasRef.current?.postCmd({ __vd_cmd: "drawMode", tool: isDraw ? t : null });
    if (t === "select") canvasRef.current?.postCmd({ __vd_cmd: "enable", value: true });
    if (t === "interact") canvasRef.current?.postCmd({ __vd_cmd: "enable", value: false });
  };

  const onDrawn = () => {
    setDirty(true);
    // one shape per activation, then back to select (Figma-like)
    changeEditTool("select");
  };

  // Inline text editing (in-canvas). The bridge applies the edit to the live
  // DOM directly; we snapshot the pre-edit state for undo, then just mark dirty.
  const onTextEditStart = () => void snapshot();
  const onTextCommit = () => setDirty(true);

  // window.claude.complete from prototypes → non-streaming completion.
  const onClaudeRequest = (reqId: number, prompt: string) => {
    let acc = "";
    streamChat(
      { messages: [{ role: "user", content: prompt }], providerId: meta?.activeProviderId },
      {
        onText: (d) => (acc += d),
        onError: (msg) => canvasRef.current?.postCmd({ __vd_cmd: "claudeResult", reqId, error: msg }),
        onDone: () => canvasRef.current?.postCmd({ __vd_cmd: "claudeResult", reqId, text: acc }),
      },
    );
  };

  // ---- Project ops -----------------------------------------------------------
  const duplicateProject = async () => {
    if (!proj) return;
    const copy = { ...proj, ...newProject(`${proj.name} 副本`) , messages: proj.messages, artifacts: proj.artifacts, comments: proj.comments, designSystemId: proj.designSystemId };
    await saveProject(copy);
    setProjMenu(false);
    location.hash = `#/p/${copy.id}`;
  };
  const openNewSession = async () => {
    if (!proj) return;
    const session = newProjectSession(proj);
    await saveProject(session);
    setProjMenu(false);
    // Same window: the new session keeps canvas/versions/comments/design system
    // but drops chat history — navigating achieves the fresh-context goal
    // without a second window.
    location.hash = `#/p/${session.id}`;
    setToast(t("已开启新会话（保留画布，清空对话）"));
  };
  const removeProject = async () => {
    if (!proj) return;
    if (!confirm(`${t("删除项目")}「${proj.name}」？${t("此操作不可撤销。")}`)) return;
    await deleteProject(proj.id);
    location.hash = "#/";
  };

  const openInNewTab = () => {
    if (!canvasHtml) return;
    const blob = new Blob([stripWorkingAttrs(canvasHtml)], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  };

  const frameOffset = useMemo(() => {
    const stage = stageRef.current?.querySelector(".canvas-frame") as HTMLElement | null;
    const wrap = stageRef.current;
    if (!stage || !wrap) return { left: 0, top: 0 };
    const a = stage.getBoundingClientRect();
    const b = wrap.getBoundingClientRect();
    return { left: a.left - b.left, top: a.top - b.top };
  }, [selected]);

  if (!proj) return null;

  const refineActive = (tool === "annotate" || tool === "edit") && editTool === "select" && !streaming;

  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <aside className="sidebar">
        {/* Fixed sidebar header (user req #5) — survives Edit/Annotate panels */}
        <div className="side-head">
          <AppBadge title={t("回到首页")} onClick={() => (location.hash = "#/")} />
          <input className="pname" value={proj.name} onChange={(e) => patch({ name: e.target.value })} spellCheck={false} />
          <div style={{ position: "relative" }}>
            <button className="iconbtn" title={t("项目操作")} onClick={() => setProjMenu((v) => !v)}>
              <ChevronDown size={14} />
            </button>
            {projMenu && (
              <div className="mini-menu" ref={clampPop}>
                <button
                  onClick={() => {
                    setProjMenu(false);
                    (document.querySelector(".side-head .pname") as HTMLInputElement)?.focus();
                  }}
                >
                  <PencilIcon size={14} /> {t("Rename")}
                </button>
                <button onClick={duplicateProject}>
                  <CopyIcon size={14} /> {t("Duplicate")}
                </button>
                <button onClick={() => void openNewSession()}>
                  <ExternalLink size={14} /> {t("开启新会话（保留画布，清空对话）")}
                </button>
                <button className="danger" onClick={removeProject}>
                  <TrashIcon size={14} /> {t("Delete project")}
                </button>
              </div>
            )}
          </div>
          <button className="iconbtn" title={t("隐藏侧边栏")} onClick={() => setCollapsed(true)}>
            <PanelLeft size={15} />
          </button>
          <div style={{ position: "relative" }}>
            <button className="iconbtn" title={t("会话与历史")} onClick={() => setHistoryOpen((v) => !v)}>
              <HistoryIcon size={15} />
            </button>
            {historyOpen && (
              <div className="mini-menu wide" ref={clampPop}>
                <button
                  onClick={() => {
                    setHistoryOpen(false);
                    void openNewSession();
                  }}
                >
                  <ExternalLink size={14} /> {t("开启新会话（保留画布，清空对话）")}
                </button>
                {sessionChain.length > 0 && (
                  <>
                    <div className="pm-sep" />
                    <span className="muted small menu-cap">{t("历史会话")}</span>
                    {sessionChain.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setHistoryOpen(false);
                          location.hash = `#/p/${p.id}`;
                        }}
                      >
                        <HistoryIcon size={14} /> {p.name}
                      </button>
                    ))}
                  </>
                )}
                <div className="pm-sep" />
                <span className="muted small menu-cap">{t("本会话消息")}</span>
                {messages.filter((m) => m.role === "user").length === 0 && (
                  <span className="muted small" style={{ padding: "6px 10px" }}>
                    {t("暂无历史")}
                  </span>
                )}
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <button
                      key={i}
                      onClick={() => {
                        setHistoryOpen(false);
                        setTool(null);
                        setTimeout(() => document.getElementById(`msg-${i}`)?.scrollIntoView({ behavior: "smooth" }), 50);
                      }}
                    >
                      {m.content.slice(0, 42)}
                    </button>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </div>

        {tool === "edit" ? (
          <EditPanel
            selected={selected}
            tweakGroups={tweakGroups}
            html={canvasHtml ?? ""}
            editTool={editTool}
            onEditTool={changeEditTool}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={undo}
            onRedo={redo}
            onApplyStyle={applyStyle}
            onApplyText={applyText}
            onSetAttr={setAttr}
            onSelectPath={selectByPath}
            getTree={() => canvasRef.current?.getTree() ?? Promise.resolve(null)}
            exportPng={(sel, scale) => canvasRef.current?.exportPng(sel, scale) ?? Promise.resolve(null)}
            onSetVar={setTweakVar}
            onAskTweaks={askTweaks}
            onSave={saveVersion}
            onDiscard={discardEdit}
          />
        ) : tool === "annotate" ? (
          <CommentsPanel
            comments={comments}
            onResolve={resolveComment}
            onDelete={deleteComment}
            onAddGlobal={addGlobalComment}
            onSendAllToClaude={sendAllComments}
            onToggleDraw={() => { setDrawAnnotate((v) => !v); clearSelection(); }}
            drawing={drawAnnotate}
            onClose={() => switchTool("annotate")}
          />
        ) : (
          <ChatPanel
            artifactName={fileName}
            messages={messages}
            streaming={streaming}
            agentRun={agentRun}
            meta={meta}
            onMetaChanged={onMetaChanged}
            activeSkill={activeSkill}
            onClearSkill={() => {
              setActiveSkill(null);
              pendingInputsRef.current = false;
              setSkillInputForm(null);
            }}
            onOpenSkills={() => setSkillsOpen(true)}
            onOpenDesignSystem={() => (location.hash = "#/?tab=design-systems")}
            onSend={handleSend}
            onStop={stop}
            onOpenSettings={onOpenSettings}
            hasProvider={hasProvider}
          />
        )}
      </aside>

      <div className="canvas-wrap" ref={stageRef}>
        {collapsed && (
          <button className="expand-side iconbtn" title={t("展开侧边栏")} onClick={() => setCollapsed(false)}>
            <ChevronRight size={15} />
          </button>
        )}
        {error && (
          <div className="banner">
            <span>⚠ {error}</span>
            <button className="btn small" onClick={onOpenSettings}>
              {t("打开设置")}
            </button>
            <button className="btn ghost small" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        <div className="canvas-head">
          <button className="iconbtn" title={t("重新渲染")} onClick={() => setReloadNonce((n) => n + 1)}>
            <RefreshIcon size={15} />
          </button>
          {artifacts.length > 1 ? (
            <select
              className="file-pick"
              value={activeVersionId ?? ""}
              onChange={(e) => {
                patch({ activeVersionId: e.target.value });
                setEditDraft(null);
                setDirty(false);
                clearSelection();
              }}
              title={t("版本")}
            >
              {artifacts.map((v, i) => (
                <option key={v.id} value={v.id}>
                  {v.source === "manual" ? "✎ " : v.source === "restore" ? "↩ " : v.source === "ai" ? "🤖 " : ""}
                  {(proj.name || "Design").slice(0, 14)} · v{i + 1} {v.label ? `(${v.label})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <span className="file-pick" style={{ cursor: "default" }}>
              {fileName}
            </span>
          )}
          {artifacts.length >= 1 && (
            <button className="iconbtn vm-open" title={t("版本管理（搜索 / 预览 / 恢复 / 导出）")} onClick={() => setVmOpen(true)}>
              🗂 {t("版本")}
            </button>
          )}
          <div className="spacer" />
          <div className="device-switch" role="group" aria-label={t("预览设备")}>
            {(
              [
                ["web", "Web", "Web（桌面）"],
                ["mobile", "手机", "移动端（手机壳预览）"],
                ["app", "App", "移动端应用（手机壳 + 状态栏）"],
              ] as ["web" | "mobile" | "app", string, string][]
            ).map(([id, ic, label]) => (
              <button
                key={id}
                className={`device-btn ${device === id ? "on" : ""}`}
                title={t(label)}
                disabled={!canvasHtml || streaming}
                onClick={() => setDevice(id)}
              >
                {t(ic)}
              </button>
            ))}
          </div>
          {device !== "web" && (
            <select
              className="shell-pick"
              value={shell}
              title={t("真机壳样式")}
              onChange={(e) => {
                const s = e.target.value as PhoneShell;
                setShell(s);
                localStorage.setItem("vd_shell", s);
              }}
            >
              {SHELL_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {t(o.label)}
                </option>
              ))}
            </select>
          )}
          <button
            className={`tool-toggle ${tool === "annotate" ? "on" : ""}`}
            onClick={() => switchTool("annotate")}
            disabled={!canvasHtml || streaming}
          >
            ◉ {t("Annotate")}
          </button>
          <button
            className={`tool-toggle ${tool === "tweaks" || tool === "edit" ? "on" : ""}`}
            onClick={() => switchTool("tweaks")}
            disabled={!canvasHtml || streaming}
            title={tweakGroups ? "调节控件" : "描述想调什么，生成控件"}
          >
            ⊞ {t("Tweaks")}
          </button>
          <button
            className={`tool-toggle ${tool === "edit" ? "on" : ""}`}
            onClick={() => switchTool("edit")}
            disabled={!canvasHtml || streaming}
          >
            ✎ {t("Edit")}
          </button>
          <div style={{ position: "relative" }}>
            <button
              className={`tool-toggle ${paletteOpen ? "on" : ""}`}
              onClick={() => setPaletteOpen((v) => !v)}
              disabled={!canvasHtml || streaming}
              title={t("一键换配色（色相平移）")}
            >
              ◐ {t("换肤")}
            </button>
            {paletteOpen && (
              <PalettePopover
                onShift={(h) => { canvasRef.current?.postCmd({ __vd_cmd: "palette", hueDelta: h }); setDirty(true); }}
                onReset={() => canvasRef.current?.postCmd({ __vd_cmd: "paletteReset" })}
                onSave={saveVersion}
                onClose={() => setPaletteOpen(false)}
              />
            )}
          </div>
          <div style={{ position: "relative" }}>
            <button className="tool-toggle" onClick={() => setPresentMenu((v) => !v)} disabled={!canvasHtml || streaming}>
              ▶ {t("Present")} <ChevronDown size={12} />
            </button>
            {presentMenu && (
              <div className="mini-menu" style={{ right: 0 }} ref={clampPop}>
                {looksLikeDeck(canvasHtml) && (
                  <button
                    onClick={() => {
                      setPresentMenu(false);
                      const html = activeVersion ? stripWorkingAttrs(activeVersion.html) : canvasHtml;
                      if (html && !openPresenter(html)) alert("未识别到幻灯片（需要 <section> / .slide 结构）");
                    }}
                  >
                    🖥 {t("演讲者视图（多窗口）")}
                  </button>
                )}
                <button
                  onClick={() => {
                    setPresentMenu(false);
                    setPresenting("tab");
                  }}
                >
                  {t("In this tab")}
                </button>
                <button
                  onClick={() => {
                    setPresentMenu(false);
                    setPresenting("fullscreen");
                  }}
                >
                  {t("Fullscreen")}
                </button>
                <button
                  onClick={() => {
                    setPresentMenu(false);
                    openInNewTab();
                  }}
                >
                  {t("New tab")}
                </button>
              </div>
            )}
          </div>
          <SharePopover
            artifactHtml={activeVersion ? stripWorkingAttrs(activeVersion.html) : null}
            projectName={proj.name}
            version={activeVersion}
            exportPng={(sel, scale) => canvasRef.current?.exportPng(sel, scale) ?? Promise.resolve(null)}
          />
          <button className="btn small" onClick={onOpenSettings} title={t("模型服务（BYOK）")}>
            {t("Model")}
          </button>
        </div>

        <div className={`canvas-stage device-${device}`}>
          {skillInputForm && activeSkill?.inputs && !streaming ? (
            <QuestionFormView form={activeSkill.inputs} onSubmit={submitSkillInputs} />
          ) : activeVersion?.kind === "multifile" && !streaming ? (
            <MultiFileViewer projectId={projectId} version={activeVersion} onEditSite={editSitePages} device={device} shell={shell} />
          ) : liveArt && !streaming ? (
            <LiveArtifactViewer live={liveArt} providerId={meta?.activeProviderId} onChanged={setLiveArt} />
          ) : pendingForm ? (
            <QuestionFormView form={pendingForm} onSubmit={submitFormAnswers} />
          ) : (
            (() => {
              const canvas = (
                <Canvas
                  key={reloadNonce}
                  ref={canvasRef}
                  html={canvasHtml}
                  refineMode={refineActive}
                  textEdit={tool === "edit" && editTool === "select" && !streaming}
                  dimmed={tool === "annotate" && !selected}
                  streaming={streaming}
                  awaitingArtifact={awaitingArtifact}
                  onSelected={setSelected}
                  onDrawStart={snapshotBeforeDraw}
                  onDrawn={onDrawn}
                  onTextEditStart={onTextEditStart}
                  onTextCommit={onTextCommit}
                  onViewport={onViewport}
                  onClaudeRequest={onClaudeRequest}
                />
              );
              // mobile / mobile-app: wrap any design in the host phone shell
              return device === "web" ? canvas : <PhoneFrame shell={shell}>{canvas}</PhoneFrame>;
            })()
          )}
          {tool === "annotate" && !selected && canvasHtml && <div className="mode-pill">{t("Click to comment")}</div>}
          {toast && <div className="mode-pill" style={{ background: "var(--accent-black)" }}>{toast}</div>}
        </div>

        {/* mobile-app shell: status bar + home indicator over the phone frame (decorative, click-through) */}
        {device === "app" &&
          canvasHtml &&
          !streaming &&
          (() => {
            const stage = stageRef.current;
            const frame = stage?.querySelector(".canvas-frame") as HTMLElement | null;
            if (!stage || !frame) return null;
            const fa = frame.getBoundingClientRect();
            const sa = stage.getBoundingClientRect();
            const left = fa.left - sa.left;
            const top = fa.top - sa.top;
            return (
              <>
                <div className="app-statusbar" style={{ left, top, width: fa.width }}>
                  <span className="sb-time">9:41</span>
                  <span className="sb-icons">
                    <span className="sb-signal" />
                    <span>5G</span>
                    <span className="sb-batt" />
                  </span>
                </div>
                <div className="app-home-indicator" style={{ left: left + fa.width / 2, top: top + fa.height - 10 }} />
              </>
            );
          })()}

        {tool === "tweaks" &&
          !streaming &&
          (tweakGroups ? (
            <TweaksPanel
              groups={tweakGroups}
              onSetVar={setTweakVar}
              onAskMore={askTweaks}
              onSaveVersion={saveVersion}
              onClose={() => setTool(null)}
            />
          ) : (
            <TweaksAsk onSubmit={askTweaks} onCancel={() => setTool(null)} />
          ))}

        {tool === "annotate" &&
          canvasHtml &&
          (() => {
            // measure the frame once, not per pin (each getBoundingClientRect forces reflow)
            const stage = stageRef.current;
            const frame = stage?.querySelector(".canvas-frame") as HTMLElement | null;
            if (!stage || !frame) return null;
            const fa = frame.getBoundingClientRect();
            const sa = stage.getBoundingClientRect();
            const offL = fa.left - sa.left;
            const offT = fa.top - sa.top;
            return comments.map((c, i) => {
              if (c.resolved || !c.path) return null;
              const r = pinRects[c.id];
              if (!r || r.y + r.h < 0 || r.y > fa.height) return null; // scrolled out of the frame
              return (
                <div
                  key={c.id}
                  className="pin-badge persistent"
                  style={{ left: offL + r.x + r.w - 10, top: Math.max(0, offT + r.y - 10) }}
                  title={c.text}
                >
                  {i + 1}
                </div>
              );
            });
          })()}

        {tool === "annotate" && selected && !streaming && !drawAnnotate && (
          <CommentPopover
            selected={selected}
            frameOffset={frameOffset}
            pinNumber={comments.length + 1}
            onAddComment={addCommentOnly}
            onSendToClaude={submitCommentToClaude}
            onCancel={clearSelection}
          />
        )}

        {tool === "annotate" &&
          drawAnnotate &&
          canvasHtml &&
          !streaming &&
          (() => {
            const stage = stageRef.current;
            const frame = stage?.querySelector(".canvas-frame") as HTMLElement | null;
            if (!stage || !frame) return null;
            const fa = frame.getBoundingClientRect();
            const sa = stage.getBoundingClientRect();
            return (
              <AnnotateDrawOverlay
                box={{ left: fa.left - sa.left, top: fa.top - sa.top, width: fa.width, height: fa.height }}
                onSend={sendVisualAnnotation}
                onClose={() => setDrawAnnotate(false)}
              />
            );
          })()}
      </div>

      {presenting && canvasHtml && (
        <PresentOverlay
          html={stripWorkingAttrs(canvasHtml)}
          title={proj.name}
          fullscreen={presenting === "fullscreen"}
          onExit={() => setPresenting(null)}
        />
      )}

      {vmOpen && (
        <VersionManager
          projectId={projectId}
          projectName={proj.name}
          artifacts={artifacts}
          activeVersionId={activeVersionId}
          onClose={() => setVmOpen(false)}
          onActivate={(id) => {
            patch({ activeVersionId: id });
            setEditDraft(null);
            setDirty(false);
            clearSelection();
          }}
          onRestore={(v) => {
            // Restore = a new version that copies the chosen one (history stays
            // append-only; the restore itself is undoable by switching back).
            const nv: ArtifactVersion = {
              ...v,
              id: crypto.randomUUID(),
              createdAt: Date.now(),
              source: "restore",
              restoreFromVersionId: v.id,
            };
            patch({ artifacts: [...artifacts, nv], activeVersionId: nv.id });
            setEditDraft(null);
            setDirty(false);
            clearSelection();
            setToast("已恢复为该版本（存为新版本）");
          }}
        />
      )}

      {skillsOpen && (
        <SkillsModal
          onClose={() => setSkillsOpen(false)}
          onPick={(entry) => {
            setSkillsOpen(false);
            if (entry.action === "save-pdf") {
              if (canvasHtml) {
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(stripWorkingAttrs(canvasHtml));
                  w.document.close();
                  setTimeout(() => w.print(), 400);
                }
              }
              return;
            }
            setActiveSkill(entry);
            pendingInputsRef.current = !!entry.inputs;
          }}
        />
      )}
    </div>
  );
}

// Hard scope constraint prepended to element-targeted edits, so the model does
// not silently restructure siblings / parent layout / global CSS / tokens.
const SCOPE_RULE =
  "只修改下面点名（<target>）的元素本身。不要改动它的兄弟节点、父级布局、全局 CSS 或 design tokens；" +
  "若某处修改必须触及点名元素之外，请先停下说明并询问，不要擅自扩大改动范围。";

// A structured target block for a live selection: stable id + selector + current
// text + key computed styles + position — so the model edits exactly one element.
function renderTarget(info: SelectedInfo): string {
  const s = info.styles;
  return (
    `<target${info.vid ? ` vid="${info.vid}"` : ""} selector="${info.path}" tag="${info.tag}" kind="${info.kind}">\n` +
    `  当前文本："${info.text.slice(0, 160)}"\n` +
    `  关键样式：color ${s.color}; background ${s.backgroundColor}; font ${s.fontSize}px/${s.fontWeight}; ` +
    `padding ${s.paddingTop}/${s.paddingRight}/${s.paddingBottom}/${s.paddingLeft}px; radius ${s.borderRadius}px\n` +
    `  位置：${Math.round(info.rect.x)},${Math.round(info.rect.y)} ${Math.round(info.rect.w)}×${Math.round(info.rect.h)}\n` +
    `</target>`
  );
}

// Draw the annotation marks onto the artifact screenshot. Marks are in canvas-
// viewport coords; the screenshot is the full document, so we offset by scroll
// and scale by (image width / document width) to stay DPR-independent.
async function compositeMarks(baseUrl: string, marks: Mark[], ox: number, oy: number, dw: number): Promise<string> {
  const img = new Image();
  img.src = baseUrl;
  await img.decode();
  const cv = document.createElement("canvas");
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const s = dw > 0 ? img.naturalWidth / dw : 2;
  ctx.strokeStyle = ANNOTATE_ACCENT;
  ctx.fillStyle = ANNOTATE_ACCENT;
  ctx.lineWidth = 2.5 * s;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const X = (v: number) => (v + ox) * s;
  const Y = (v: number) => (v + oy) * s;
  for (const m of marks) {
    if (m.type === "rect") {
      ctx.strokeRect(X(m.x), Y(m.y), m.w * s, m.h * s);
    } else if (m.type === "path") {
      ctx.beginPath();
      m.pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(X(m.x1), Y(m.y1));
      ctx.lineTo(X(m.x2), Y(m.y2));
      ctx.stroke();
      const ang = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
      const L = 12 * s;
      const ax = X(m.x2), ay = Y(m.y2);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - L * Math.cos(ang - 0.44), ay - L * Math.sin(ang - 0.44));
      ctx.lineTo(ax - L * Math.cos(ang + 0.44), ay - L * Math.sin(ang + 0.44));
      ctx.closePath();
      ctx.fill();
    }
  }
  return cv.toDataURL("image/png");
}

// A lighter target line for a stored comment pin (no live style snapshot).
function renderCommentTarget(c: CommentPin, i: number): string {
  const attrs = [c.vid ? `vid="${c.vid}"` : "", c.path ? `selector="${c.path}"` : "", c.ctx?.tag ? `tag="${c.ctx.tag}"` : ""]
    .filter(Boolean)
    .join(" ");
  const cur = c.ctx?.text ? ` 当前文本："${c.ctx.text}"` : "";
  const target = attrs ? `<target ${attrs}/>` : "（整体设计）";
  return `${i + 1}. ${target}${cur}\n   要求：${c.text}`;
}
