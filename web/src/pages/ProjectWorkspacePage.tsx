import { useEffect, useMemo, useState } from "react";
import type { ProjectFlowAutomationUpdate, ProjectFlowRegressionResult, ProjectFlowValidation, ProjectRecord, ProjectVariant, ProjectVersion } from "../../../shared/project";
import { PROJECT_FLOW_REVIEW_CRITERIA, type ProjectFlowReviewCriterionId } from "../../../shared/project";
import {
  acceptProjectVariant,
  addExperienceFlow,
  addProjectPage,
  checkExternalProjectChanges,
  commitProjectFiles,
  completeExperienceFlow,
  createProjectVariant,
  exportProjectV2,
  generateProjectChange,
  generateProjectScope,
  getExternalProjectWatchStatus,
  getProjectV2,
  listProjectVariants,
  listProjectVersions,
  ProjectApiError,
  projectPreviewUrl,
  removeExperienceFlow,
  removeProjectPage,
  renameExperienceFlow,
  renameProjectPage,
  reorderProjectPages,
  restoreProjectVersion,
  snapshotProjectVersion,
  type ProjectChangeImpact,
  type ProjectFileConflict,
  type ProjectFileReplacement,
  validateExperienceFlow,
} from "../lib/projectApi";
import {
  ChevronRight,
  MoreHorizontal,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "../components/icons";
import { fetchMeta } from "../lib/api";
import { ThemeToggle } from "../components/ThemeToggle";

interface Props {
  projectId: string;
}

type Selection = { type: "page"; id: string } | { type: "flow"; id: string };

function regressionSummary(regression: ProjectFlowRegressionResult[]): string {
  if (!regression.length) return "";
  const passed = regression.filter((item) => item.passed).length;
  const failed = regression.length - passed;
  return failed
    ? `已自动回归 ${regression.length} 条流程：${passed} 条通过，${failed} 条失败并退回草稿。`
    : `已自动回归 ${passed} 条流程，运行验证均通过，等待重新评审。`;
}

export function ProjectWorkspacePage({ projectId }: Props) {
  const [record, setRecord] = useState<ProjectRecord | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [flowDialog, setFlowDialog] = useState(false);
  const [exportDialog, setExportDialog] = useState(false);
  const [viewport, setViewport] = useState("desktop");
  const [designPrompt, setDesignPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    files: ProjectFileReplacement[];
    impact: ProjectChangeImpact;
    title?: string;
    description?: string;
    deepenedFlowId?: string;
    flowSteps?: ProjectFlowAutomationUpdate[];
  } | null>(null);
  const [modelNote, setModelNote] = useState("正在检查项目模型能力…");
  const [versionNote, setVersionNote] = useState("");
  const [conflicts, setConflicts] = useState<ProjectFileConflict[] | null>(null);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [variants, setVariants] = useState<ProjectVariant[]>([]);
  const [flowRun, setFlowRun] = useState<{ flowId: string; stepIndex: number } | null>(null);
  const [lastValidation, setLastValidation] = useState<ProjectFlowValidation | null>(null);
  const [reviewFlowId, setReviewFlowId] = useState<string | null>(null);

  useEffect(() => {
    getProjectV2(projectId)
      .then((next) => {
        setRecord(next);
        setSelection({ type: "page", id: next.manifest.entryPageId });
        void Promise.all([listProjectVersions(projectId), listProjectVariants(projectId)])
          .then(([nextVersions, nextVariants]) => { setVersions(nextVersions); setVariants(nextVariants); })
          .catch(() => undefined);
        void fetchMeta()
          .then((meta) => {
            const providerId = next.manifest.settings?.defaultProviderId ?? meta.activeProviderId;
            const provider = meta.providers.find((item) => item.id === providerId);
            if (!provider) {
              setModelNote("尚未配置项目模型；添加 Provider 后才能生成修改。");
            } else if (provider.maxTokens && provider.maxTokens < 16_000) {
              setModelNote(`${provider.name} 的输出上限较低，长页面修改可能不完整；结果仍会经过事务校验。`);
            } else {
              setModelNote(`${provider.name} 尚未通过固定项目设计基准；结果不会绕过文件事务与影响确认。`);
            }
          })
          .catch(() => setModelNote("无法读取模型能力信息；生成结果仍会经过文件事务校验。"));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [projectId]);

  useEffect(() => {
    let disposed = false;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const status = await getExternalProjectWatchStatus(projectId);
        if (!status.dirty || disposed) return;
        const result = await checkExternalProjectChanges(projectId);
        if (disposed) return;
        if (result.version) {
          setVersionNote(`已自动记录外部修改：${result.changedFiles.join("、")}。${regressionSummary(result.regression)}`);
          setRecord(result.record);
        }
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        checking = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [projectId]);

  const showCommitError = (reason: unknown) => {
    setError(reason instanceof Error ? reason.message : String(reason));
    if (reason instanceof ProjectApiError && reason.conflicts) {
      setConflicts(reason.conflicts);
    }
  };

  const manifest = record?.manifest;
  const selectedPage =
    manifest && selection?.type === "page" ? manifest.pages.find((page) => page.id === selection.id) : undefined;
  const selectedFlow =
    manifest && selection?.type === "flow" ? manifest.flows.find((flow) => flow.id === selection.id) : undefined;
  const reviewFlow = manifest?.flows.find((flow) => flow.id === reviewFlowId);
  const runningStep = selectedFlow && flowRun?.flowId === selectedFlow.id ? selectedFlow.steps[flowRun.stepIndex] : undefined;
  const previewPage =
    (runningStep ? manifest?.pages.find((page) => page.id === runningStep.pageId) : undefined) ??
    selectedPage ??
    (selectedFlow?.steps[0] ? manifest?.pages.find((page) => page.id === selectedFlow.steps[0].pageId) : undefined) ??
    manifest?.pages.find((page) => page.id === manifest.entryPageId);
  const selectedViewport = manifest?.viewports.find((item) => item.id === viewport) ?? manifest?.viewports[0];
  const preferredFlowId = selectedFlow?.id ?? manifest?.proposal?.primaryFlowId ?? manifest?.flows[0]?.id;
  const completedFlowCount = manifest?.flows.filter((flow) => flow.status === "completed").length ?? 0;
  const completionPercent = manifest?.flows.length ? Math.round((completedFlowCount / manifest.flows.length) * 100) : 0;

  const requestScopedGeneration = async (mode: "global-draft" | "flow-deepening", flowId?: string) => {
    if (generating || (mode === "flow-deepening" && !flowId)) return;
    setGenerating(true);
    setError("");
    setConflicts(null);
    try {
      const skillKey = `vd_project_next_skill_${projectId}`;
      const skillId = sessionStorage.getItem(skillKey) ?? undefined;
      const proposal = await generateProjectScope(projectId, {
        mode,
        ...(flowId ? { flowId } : {}),
        ...(skillId ? { skillId } : {}),
      });
      if (skillId) sessionStorage.removeItem(skillKey);
      setPendingChange({
        ...proposal,
        title: proposal.scope,
        description: mode === "global-draft"
          ? "将统一更新项目中的全部页面；确认前不会写入正式项目。"
          : "将以这条体验流程为边界同步深化相关页面；流程外页面不会被修改。",
        ...(mode === "flow-deepening" && flowId ? { deepenedFlowId: flowId } : {}),
      });
    } catch (reason) {
      showCommitError(reason);
    } finally {
      setGenerating(false);
    }
  };

  const mutate = async (operation: () => Promise<ProjectRecord>) => {
    setBusy(true);
    setError("");
    try {
      setRecord(await operation());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  if (error && !record) {
    return (
      <div className="project-workspace-state">
        <p>无法打开设计项目</p>
        <span>{error}</span>
        <button className="btn" onClick={() => (location.hash = "#/")}>返回首页</button>
      </div>
    );
  }
  if (!record || !manifest) return <div className="project-workspace-state">正在打开项目文件树…</div>;

  const movePage = (pageId: string, offset: number) => {
    const ids = manifest.pages.map((page) => page.id);
    const from = ids.indexOf(pageId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    void mutate(() => reorderProjectPages(projectId, ids));
  };

  const finishFlowRun = async () => {
    if (!selectedFlow) return;
    setBusy(true);
    setError("");
    try {
      const result = await validateExperienceFlow(projectId, selectedFlow.id);
      setRecord(result.record);
      setLastValidation(result.validation);
      setFlowRun(null);
      const failures = [
        ...result.validation.checks.pages,
        ...result.validation.checks.missingAssets,
        ...result.validation.checks.runtimeErrors,
        ...result.validation.checks.brokenLinks,
        ...result.validation.checks.externalRequests,
        ...result.validation.checks.horizontalOverflow,
        ...result.validation.checks.stepFailures,
        ...result.validation.checks.accessibilityIssues,
        ...result.validation.checks.inoperableControls,
        ...(result.validation.checks.tokens ? [] : ["设计令牌不可用"]),
      ];
      setVersionNote(
        result.validation.passed
          ? `流程已通过浏览器运行校验，等待你的设计评审。`
          : `流程校验未通过：${failures.slice(0, 3).join("、")}`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="project-workspace">
      <header className="pw-header">
        <button className="pw-back" onClick={() => (location.hash = "#/")} aria-label="返回首页">←</button>
        <div className="pw-identity">
          <strong>{manifest.name}</strong>
          <span>{record.directory}</span>
        </div>
        <span className="pw-platform">{platformLabel(manifest.platform)}</span>
        <div className="pw-header-spacer" />
        <ThemeToggle className="pw-theme-toggle" />
        <button className="pw-header-action" onClick={async () => {
          const label = prompt("版本名称", "手动保存");
          if (!label?.trim()) return;
          try {
            const version = await snapshotProjectVersion(projectId, label.trim());
            setVersions((current) => [version, ...current]);
            setVersionNote(`已保存：${version.label}`);
          } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        }}>保存版本</button>
        <button className="pw-header-action" onClick={async () => {
          const label = prompt("变体名称", "探索方向");
          if (!label?.trim()) return;
          try {
            const variant = await createProjectVariant(projectId, label.trim());
            setVariants((current) => [variant, ...current]);
            setVersionNote(`已创建未应用变体：${variant.label}`);
          } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        }}>创建变体</button>
        <button className="pw-header-action" onClick={() => setExportDialog(true)}>导出项目</button>
        <button className="pw-header-action" onClick={async () => {
          try {
            const result = await checkExternalProjectChanges(projectId);
            setRecord(result.record);
            setVersionNote(result.version ? `已记录外部修改：${result.changedFiles.join("、")}。${regressionSummary(result.regression)}` : "未发现外部修改");
          } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
        }}>检查外部修改</button>
        <span className="pw-save-state">{busy ? "正在写入…" : "本地项目 · 已保存"}</span>
      </header>

      <aside className="pw-nav">
        <div className="pw-nav-intro">
          <span className="pw-eyebrow">PROJECT V2</span>
          <h1>产品原型</h1>
          <p>页面与流程共享同一套项目设计语言。</p>
        </div>

        <div className="pw-generation-card">
          <div>
            <span>项目级生成</span>
            <small>{manifest.proposal?.strategy === "flow-deepening" ? "提案偏好：流程深化" : "提案偏好：全局草拟"}</small>
          </div>
          <button disabled={generating} onClick={() => void requestScopedGeneration("global-draft")}>
            {generating ? "正在生成…" : "全局草拟"}
          </button>
          <button
            disabled={generating || !preferredFlowId}
            onClick={() => void requestScopedGeneration("flow-deepening", preferredFlowId)}
          >
            深化{selectedFlow ? `“${selectedFlow.name}”` : "首要流程"}
          </button>
        </div>

        <div className="pw-completion-card">
          <div><span>项目完成度</span><strong>{completionPercent}%</strong></div>
          <div
            className="pw-completion-track"
            role="progressbar"
            aria-label="已完成体验流程比例"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completionPercent}
          ><i style={{ width: `${completionPercent}%` }} /></div>
          <small>{manifest.flows.length ? `${completedFlowCount} / ${manifest.flows.length} 条体验流程已通过门槛` : "定义体验流程后开始计算"}</small>
        </div>

        <nav>
          <div className="pw-nav-heading">
            <span>页面</span>
            <button
              aria-label="添加页面"
              onClick={() => {
                const title = prompt("页面标题");
                if (!title?.trim()) return;
                void mutate(async () => {
                  const next = await addProjectPage(projectId, { title: title.trim() });
                  setSelection({ type: "page", id: next.manifest.pages.at(-1)!.id });
                  return next;
                });
              }}
            >
              <PlusIcon size={14} />
            </button>
          </div>
          <div className="pw-nav-list">
            {manifest.pages.map((page, index) => (
              <button
                key={page.id}
                className={selection?.type === "page" && selection.id === page.id ? "active" : ""}
                onClick={() => setSelection({ type: "page", id: page.id })}
              >
                <span className={`pw-page-dot ${page.status}`} />
                <span>{page.title}</span>
                <small>{index + 1}</small>
              </button>
            ))}
          </div>

          <div className="pw-nav-heading flow-heading">
            <span>体验流程</span>
            <button aria-label="添加体验流程" onClick={() => setFlowDialog(true)}>
              <PlusIcon size={14} />
            </button>
          </div>
          <div className="pw-nav-list">
            {manifest.flows.map((flow) => (
              <button
                key={flow.id}
                className={selection?.type === "flow" && selection.id === flow.id ? "active" : ""}
                onClick={() => setSelection({ type: "flow", id: flow.id })}
              >
                <ChevronRight size={13} />
                <span>{flow.name}</span>
                <small>{flow.steps.length}</small>
              </button>
            ))}
            {!manifest.flows.length && <p className="pw-empty">尚未规划体验流程</p>}
          </div>
        </nav>

        <div className="pw-language-card">
          <span>项目设计语言</span>
          <strong>{manifest.designLanguage.source?.id ? "已继承设计系统" : "项目默认"}</strong>
          <code>{manifest.designLanguage.tokens}</code>
        </div>
      </aside>

      <main className="pw-canvas">
        <div className="pw-canvas-toolbar">
          <div>
            <span>{selectedFlow ? `流程 / ${selectedFlow.name}` : "页面"}</span>
            <strong>{previewPage?.title ?? "未选择页面"}</strong>
          </div>
          <div className="pw-viewports">
            {manifest.viewports.map((item) => (
              <button key={item.id} className={item.id === selectedViewport?.id ? "active" : ""} onClick={() => setViewport(item.id)}>
                {item.name}
              </button>
            ))}
          </div>
          {selectedFlow && (
            flowRun ? (
              <div className="pw-flow-run">
                <span>{flowRun.stepIndex + 1}/{selectedFlow.steps.length} · {runningStep?.action}</span>
                <button disabled={flowRun.stepIndex === 0} onClick={() => setFlowRun((current) => current && { ...current, stepIndex: current.stepIndex - 1 })}>上一步</button>
                {flowRun.stepIndex === selectedFlow.steps.length - 1
                  ? <button onClick={() => void finishFlowRun()}>完成运行</button>
                  : <button onClick={() => setFlowRun((current) => current && { ...current, stepIndex: current.stepIndex + 1 })}>下一步</button>}
              </div>
            ) : <button className="pw-run-button" onClick={() => setFlowRun({ flowId: selectedFlow.id, stepIndex: 0 })}>运行流程</button>
          )}
          <button className="pw-more" aria-label="更多操作"><MoreHorizontal size={16} /></button>
        </div>
        <div className="pw-stage">
          {previewPage && (
            <iframe
              key={`${previewPage.path}-${manifest.updatedAt}`}
              title={`${previewPage.title} 预览`}
              src={projectPreviewUrl(projectId, previewPage.path)}
              style={{
                width: Math.min(selectedViewport?.width ?? 1440, 1440),
                maxWidth: "100%",
                aspectRatio: `${selectedViewport?.width ?? 1440} / ${selectedViewport?.height ?? 900}`,
              }}
            />
          )}
        </div>
      </main>

      <aside className="pw-inspector">
        {error && <div className="pw-error">{error}</div>}
        {conflicts && (
          <div className="pw-conflict">
            <strong>未应用 AI 修改</strong>
            <p>这些文件已在外部发生变化。请根据以下建议重新生成或手动合并。</p>
            {conflicts.map((file) => (
              <details key={file.path}>
                <summary>{file.path}</summary>
                <pre>当前文件：{file.currentContent.slice(0, 4_000)}{"\n\n"}建议写入：{file.proposedContent.slice(0, 4_000)}</pre>
              </details>
            ))}
          </div>
        )}
        {versionNote && <div className="pw-version-note">{versionNote}</div>}
        {(versions.length > 0 || variants.length > 0) && (
          <div className="pw-history">
            {versions.length > 0 && <section>
              <strong>版本记录</strong>
              {versions.slice(0, 3).map((version) => (
                <div key={version.id}>
                  <span>{version.label}</span>
                  <button onClick={async () => {
                    if (!confirm(`恢复到“${version.label}”？当前文件会先自动保存为可回退版本。`)) return;
                    try {
                      const result = await restoreProjectVersion(projectId, version.id);
                      setRecord(await getProjectV2(projectId));
                      setVersions(await listProjectVersions(projectId));
                      setVersionNote(`已恢复：${result.version.label}`);
                    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
                  }}>恢复</button>
                </div>
              ))}
            </section>}
            {variants.length > 0 && <section>
              <strong>设计变体</strong>
              {variants.slice(0, 3).map((variant) => (
                <div key={variant.id}>
                  <span>{variant.label}</span>
                  <button onClick={async () => {
                    if (!confirm(`接受“${variant.label}”？当前正式项目会先保存为版本。`)) return;
                    try {
                      const result = await acceptProjectVariant(projectId, variant.id);
                      setRecord(await getProjectV2(projectId));
                      setVersions(await listProjectVersions(projectId));
                      setVersionNote(`已接受变体：${result.version.label}`);
                    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
                  }}>接受</button>
                </div>
              ))}
            </section>}
          </div>
        )}
        {selectedPage ? (
          <PageInspector
            record={record}
            pageId={selectedPage.id}
            onRename={() => {
              const title = prompt("新的页面标题", selectedPage.title);
              if (title?.trim()) void mutate(() => renameProjectPage(projectId, selectedPage.id, { title: title.trim() }));
            }}
            onMove={(offset) => movePage(selectedPage.id, offset)}
            onDelete={() => {
              if (manifest.pages.length === 1) return;
              const referenced = manifest.flows.some((flow) => flow.steps.some((step) => step.pageId === selectedPage.id));
              const message = referenced
                ? `“${selectedPage.title}”正被体验流程引用。删除后会同时移除相关步骤，源文件会移入项目回收区。继续吗？`
                : `删除“${selectedPage.title}”？源文件会移入项目回收区。`;
              if (!confirm(message)) return;
              void mutate(async () => {
                const next = await removeProjectPage(projectId, selectedPage.id, referenced);
                setSelection({ type: "page", id: next.manifest.entryPageId });
                return next;
              });
            }}
          />
        ) : selectedFlow ? (
          <FlowInspector
            record={record}
            flowId={selectedFlow.id}
            onSelectPage={(pageId) => setSelection({ type: "page", id: pageId })}
            onRename={() => {
              const name = prompt("新的流程名称", selectedFlow.name);
              if (name?.trim()) void mutate(() => renameExperienceFlow(projectId, selectedFlow.id, { name: name.trim() }));
            }}
            onDelete={() => {
              if (!confirm(`删除体验流程“${selectedFlow.name}”？页面不会被删除。`)) return;
              void mutate(async () => {
                const next = await removeExperienceFlow(projectId, selectedFlow.id);
                setSelection({ type: "page", id: next.manifest.entryPageId });
                return next;
              });
            }}
            validation={lastValidation?.flowId === selectedFlow.id ? lastValidation : undefined}
            onRun={() => {
              setLastValidation(null);
              setFlowRun({ flowId: selectedFlow.id, stepIndex: 0 });
            }}
            onComplete={() => {
              setReviewFlowId(selectedFlow.id);
            }}
          />
        ) : null}
        {selectedPage && (
          <form
            className="pw-ai-change"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!designPrompt.trim() || generating) return;
              setGenerating(true);
              setError("");
              setConflicts(null);
              try {
                const skillKey = `vd_project_next_skill_${projectId}`;
                const skillId = sessionStorage.getItem(skillKey) ?? undefined;
                const proposal = await generateProjectChange(projectId, {
                  pageId: selectedPage.id,
                  prompt: designPrompt.trim(),
                  ...(skillId ? { skillId } : {}),
                });
                if (skillId) sessionStorage.removeItem(skillKey);
                if (proposal.impact.requiresConfirmation) {
                  setPendingChange(proposal);
                } else {
                  const committed = await commitProjectFiles(projectId, proposal.files, proposal.impact.impactHash);
                  setRecord(committed.record);
                  if (committed.regression.length) setVersionNote(regressionSummary(committed.regression));
                  setVersions(await listProjectVersions(projectId));
                  setDesignPrompt("");
                }
              } catch (reason) {
                showCommitError(reason);
              } finally {
                setGenerating(false);
              }
            }}
          >
            <span>AI 局部修改</span>
            <textarea
              rows={3}
              value={designPrompt}
              onChange={(event) => setDesignPrompt(event.target.value)}
              placeholder="例如：把空状态改成更克制的项目列表，并补齐加载与错误状态"
            />
            <button type="submit" disabled={!designPrompt.trim() || generating}>
              {generating ? "正在装配最小上下文…" : "生成并应用局部修改"}
            </button>
            <small>局部页面修改自动提交；共享令牌或组件变更会先展示影响范围。</small>
            <small className="pw-model-note">{modelNote}</small>
          </form>
        )}
      </aside>

      {exportDialog && (
        <ExportDialog
          onClose={() => setExportDialog(false)}
          onExport={async (format) => {
            const destination = window.vd?.selectDirectory
              ? await window.vd.selectDirectory()
              : prompt("选择交付物保存目录", record.directory);
            if (!destination) return;
            setBusy(true);
            setError("");
            try {
              const exported = await exportProjectV2(projectId, destination, format);
              setExportDialog(false);
              setVersionNote(
                exported.validation.status === "passed"
                  ? `已导出并在副本中验证 ${exported.validation.flows.length} 条流程：${exported.path}`
                  : `已导出草稿（当前没有已完成流程）：${exported.path}`,
              );
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : String(reason));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {flowDialog && (
        <FlowDialog
          record={record}
          onClose={() => setFlowDialog(false)}
          onCreate={(name, pageIds) => {
            setFlowDialog(false);
            void mutate(async () => {
              const next = await addExperienceFlow(projectId, { name, pageIds });
              setSelection({ type: "flow", id: next.manifest.flows.at(-1)!.id });
              return next;
            });
          }}
        />
      )}
      {reviewFlow && (
        <FlowReviewDialog
          flowName={reviewFlow.name}
          onClose={() => setReviewFlowId(null)}
          onSubmit={async (acceptedCriteria, note) => {
            setBusy(true);
            setError("");
            try {
              const next = await completeExperienceFlow(projectId, reviewFlow.id, { acceptedCriteria, ...(note ? { note } : {}) });
              setRecord(next);
              setReviewFlowId(null);
              setVersionNote(`流程已完成并记录设计评审：${reviewFlow.name}`);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : String(reason));
              throw reason;
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {pendingChange && (
        <div className="pw-dialog-backdrop">
          <div className="pw-impact-dialog">
            <span>影响确认</span>
            <h2>{pendingChange.title ?? `这次修改会传播到 ${pendingChange.impact.affectedPageTitles.length} 个页面`}</h2>
            <p>{pendingChange.description ?? pendingChange.impact.affectedPageTitles.join("、")}</p>
            <div>
              {pendingChange.impact.changedFiles.map((file) => <code key={file}>{file}</code>)}
            </div>
            <footer>
              <button className="btn ghost" onClick={() => setPendingChange(null)}>取消</button>
              <button
                className="btn primary"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const committed = await commitProjectFiles(
                      projectId,
                      pendingChange.files,
                      pendingChange.impact.impactHash,
                      pendingChange.deepenedFlowId,
                      pendingChange.flowSteps,
                    );
                    setRecord(committed.record);
                    if (committed.regression.length) setVersionNote(regressionSummary(committed.regression));
                    setVersions(await listProjectVersions(projectId));
                    setPendingChange(null);
                    setDesignPrompt("");
                  } catch (reason) {
                    showCommitError(reason);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                确认影响并应用
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportDialog({
  onClose,
  onExport,
}: {
  onClose: () => void;
  onExport: (format: "folder" | "zip") => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState<"folder" | "zip" | null>(null);
  const choose = async (format: "folder" | "zip") => {
    setSubmitting(format);
    try {
      await onExport(format);
    } finally {
      setSubmitting(null);
    }
  };
  return (
    <div className="pw-dialog-backdrop" onMouseDown={onClose}>
      <section
        className="pw-impact-dialog pw-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-export-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span>前端交付</span>
        <h2 id="pw-export-title">选择交付方式</h2>
        <p>两种方式包含完全相同的项目文件、流程验证结果与 Handoff Bundle。</p>
        <div className="pw-export-options">
          <button autoFocus type="button" disabled={submitting !== null} onClick={() => void choose("folder")}>
            <strong>本地文件夹</strong>
            <small>直接继续开发与接入后端</small>
          </button>
          <button type="button" disabled={submitting !== null} onClick={() => void choose("zip")}>
            <strong>ZIP 交付包</strong>
            <small>适合移动、归档或交给他人</small>
          </button>
        </div>
        <footer>
          <button className="btn ghost" type="button" disabled={submitting !== null} onClick={onClose}>取消</button>
        </footer>
      </section>
    </div>
  );
}

function FlowReviewDialog({
  flowName,
  onClose,
  onSubmit,
}: {
  flowName: string;
  onClose: () => void;
  onSubmit: (acceptedCriteria: ProjectFlowReviewCriterionId[], note: string) => Promise<void>;
}) {
  const [accepted, setAccepted] = useState<ProjectFlowReviewCriterionId[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const allAccepted = accepted.length === PROJECT_FLOW_REVIEW_CRITERIA.length;
  return (
    <div className="pw-dialog-backdrop">
      <form
        className="pw-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-review-title"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!allAccepted || submitting) return;
          setSubmitting(true);
          try {
            await onSubmit(accepted, note.trim());
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <header>
          <div><span>用户设计评审</span><h2 id="pw-review-title">{flowName}</h2></div>
          <button type="button" aria-label="关闭设计评审" onClick={onClose} disabled={submitting}><XIcon size={16} /></button>
        </header>
        <p className="pw-review-intro">浏览器运行验证已经通过。请确认当前体验是否达到可以交付并继续开发的 UI/UX 标准。</p>
        <div className="pw-review-criteria">
          {PROJECT_FLOW_REVIEW_CRITERIA.map((criterion, index) => {
            const checked = accepted.includes(criterion.id);
            return (
              <label key={criterion.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setAccepted((current) => checked
                    ? current.filter((id) => id !== criterion.id)
                    : [...current, criterion.id])}
                />
                <small>{String(index + 1).padStart(2, "0")}</small>
                <span><strong>{criterion.label}</strong><em>{criterion.description}</em></span>
              </label>
            );
          })}
        </div>
        <label className="pw-review-note">
          <span>评审备注 <small>可选</small></span>
          <textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="记录仍需在编码阶段注意的设计边界"
          />
        </label>
        <footer>
          <span>{accepted.length} / {PROJECT_FLOW_REVIEW_CRITERIA.length} 项已确认</span>
          <div>
            <button type="button" className="btn ghost" onClick={onClose} disabled={submitting}>稍后评审</button>
            <button type="submit" className="btn primary" disabled={!allAccepted || submitting}>
              {submitting ? "正在记录…" : "接受评审并完成"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function PageInspector({
  record,
  pageId,
  onRename,
  onMove,
  onDelete,
}: {
  record: ProjectRecord;
  pageId: string;
  onRename: () => void;
  onMove: (offset: number) => void;
  onDelete: () => void;
}) {
  const page = record.manifest.pages.find((item) => item.id === pageId)!;
  const index = record.manifest.pages.findIndex((item) => item.id === pageId);
  const flows = record.manifest.flows.filter((flow) => flow.steps.some((step) => step.pageId === pageId));
  return (
    <>
      <div className="pw-inspector-heading">
        <span>页面详情</span>
        <strong>{page.title}</strong>
      </div>
      <dl className="pw-facts">
        <div><dt>状态</dt><dd><span className="pw-status-dot" />{page.status === "draft" ? "草稿" : "已深化"}</dd></div>
        <div><dt>文件</dt><dd><code>{page.path}</code></dd></div>
        <div><dt>用于流程</dt><dd>{flows.length ? flows.map((flow) => flow.name).join("、") : "尚未加入"}</dd></div>
      </dl>
      <div className="pw-actions">
        <button onClick={onRename}><PencilIcon size={14} />重命名标题</button>
        <div>
          <button disabled={index === 0} onClick={() => onMove(-1)}>上移</button>
          <button disabled={index === record.manifest.pages.length - 1} onClick={() => onMove(1)}>下移</button>
        </div>
        <button className="danger" disabled={record.manifest.pages.length === 1} onClick={onDelete}>
          <TrashIcon size={14} />删除页面
        </button>
      </div>
      <div className="pw-note">
        <span>当前边界</span>
        <p>局部修改只作用于当前页面；需要同步设计多个页面时，使用左侧的全局草拟或流程深化。</p>
      </div>
    </>
  );
}

function FlowInspector({
  record,
  flowId,
  onSelectPage,
  onRename,
  onDelete,
  validation,
  onRun,
  onComplete,
}: {
  record: ProjectRecord;
  flowId: string;
  onSelectPage: (pageId: string) => void;
  onRename: () => void;
  onDelete: () => void;
  validation?: ProjectFlowValidation;
  onRun: () => void;
  onComplete: () => void;
}) {
  const flow = record.manifest.flows.find((item) => item.id === flowId)!;
  const pages = useMemo(() => new Map(record.manifest.pages.map((page) => [page.id, page])), [record]);
  const validationGroups = validation ? [
    {
      label: "流程步骤",
      issues: validation.checks.stepFailures,
    },
    {
      label: "浏览器运行",
      issues: [
        ...validation.checks.pages.map((path) => `页面不可用：${path}`),
        ...(validation.checks.tokens ? [] : ["设计令牌不可用"]),
        ...validation.checks.missingAssets.map((path) => `资源缺失：${path}`),
        ...validation.checks.runtimeErrors,
        ...validation.checks.brokenLinks.map((item) => `失效链接：${item}`),
        ...validation.checks.externalRequests.map((item) => `远程依赖：${item}`),
      ],
    },
    { label: "可访问性", issues: validation.checks.accessibilityIssues },
    {
      label: "响应式与操作",
      issues: [
        ...validation.checks.horizontalOverflow.map((item) => `横向溢出：${item}`),
        ...validation.checks.inoperableControls,
      ],
    },
  ].filter((group) => group.issues.length) : [];
  const validationIssueCount = validationGroups.reduce((total, group) => total + group.issues.length, 0);
  return (
    <>
      <div className="pw-inspector-heading">
        <span>体验流程</span>
        <strong>{flow.name}</strong>
      </div>
      <div className="pw-flow-status">
        <span>{flow.status === "draft" ? "规划中" : flow.status === "ready-for-review" ? "等待评审" : "已完成"}</span>
        <small>{flow.steps.length} 个步骤</small>
      </div>
      <ol className="pw-flow-steps">
        {flow.steps.map((step, index) => (
          <li key={step.id}>
            <button onClick={() => onSelectPage(step.pageId)}>
              <small>{String(index + 1).padStart(2, "0")}</small>
              <span><strong>{pages.get(step.pageId)?.title ?? "未知页面"}</strong><em>{step.action}</em><small>{step.commands.length} 条可执行命令</small></span>
              <ChevronRight size={14} />
            </button>
          </li>
        ))}
      </ol>
      {validation && (
        <div className={`pw-validation-report ${validation.passed ? "passed" : "failed"}`}>
          <strong>{validation.passed ? "浏览器验证通过" : `发现 ${validationIssueCount} 个问题`}</strong>
          {validationGroups.map((group) => (
            <section key={group.label}>
              <b>{group.label} · {group.issues.length}</b>
              {group.issues.slice(0, 2).map((issue) => <small key={issue}>{issue}</small>)}
              {group.issues.length > 2 && <small>另有 {group.issues.length - 2} 个问题</small>}
            </section>
          ))}
        </div>
      )}
      <div className="pw-actions">
        <button onClick={onRun}>{flow.status === "ready-for-review" ? "重新运行流程" : "运行并校验流程"}</button>
        <button disabled={flow.status !== "ready-for-review"} onClick={onComplete}>开始设计评审</button>
        <button onClick={onRename}><PencilIcon size={14} />重命名流程</button>
        <button className="danger" onClick={onDelete}><TrashIcon size={14} />删除流程</button>
      </div>
      <div className="pw-note">
        <span>完成门槛</span>
        <p>流程必须经过运行验证和用户设计评审后才能完成；当前不会把文件存在误判为完成。</p>
      </div>
    </>
  );
}

function FlowDialog({
  record,
  onClose,
  onCreate,
}: {
  record: ProjectRecord;
  onClose: () => void;
  onCreate: (name: string, pageIds: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [pageIds, setPageIds] = useState<string[]>(record.manifest.pages.map((page) => page.id));
  return (
    <div className="pw-dialog-backdrop" onMouseDown={onClose}>
      <form
        className="pw-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && pageIds.length) onCreate(name.trim(), pageIds);
        }}
      >
        <header>
          <div><span>结构变更</span><h2>规划一条体验流程</h2></div>
          <button type="button" onClick={onClose}><XIcon size={15} /></button>
        </header>
        <label>
          流程目标
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：创建并查看第一个项目" />
        </label>
        <fieldset>
          <legend>按项目顺序选择流程页面</legend>
          {record.manifest.pages.map((page, index) => (
            <label key={page.id}>
              <input
                type="checkbox"
                checked={pageIds.includes(page.id)}
                onChange={(event) =>
                  setPageIds((current) =>
                    event.target.checked ? [...current, page.id] : current.filter((pageId) => pageId !== page.id),
                  )
                }
              />
              <small>{String(index + 1).padStart(2, "0")}</small>
              <span>{page.title}</span>
            </label>
          ))}
        </fieldset>
        <footer>
          <p>创建后仍处于草稿状态，不计入项目完成度。</p>
          <button type="button" className="btn ghost" onClick={onClose}>取消</button>
          <button type="submit" className="btn primary" disabled={!name.trim() || !pageIds.length}>创建流程</button>
        </footer>
      </form>
    </div>
  );
}

function platformLabel(platform: ProjectRecord["manifest"]["platform"]): string {
  return platform === "web" ? "Web" : platform === "desktop" ? "桌面应用" : "移动应用";
}
