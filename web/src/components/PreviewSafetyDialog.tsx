import { useEffect, useState } from "react";
import type { PreviewFeedbackCategory, PreviewFeedbackInput, PreviewSafetyStatus } from "../../../shared/project";
import { exportPreviewFeedback, getPreviewSafetyStatus } from "../lib/projectApi";
import { CopyIcon, XIcon } from "./icons";

const categories: { value: PreviewFeedbackCategory; label: string }[] = [
  { value: "bug", label: "功能问题" },
  { value: "usability", label: "使用体验" },
  { value: "migration", label: "迁移与数据" },
  { value: "performance", label: "性能" },
  { value: "other", label: "其他" },
];

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="preview-path-row">
      <span>{label}</span>
      <code title={value}>{value}</code>
      <button type="button" aria-label={`复制${label}`} onClick={() => void navigator.clipboard.writeText(value)}>
        <CopyIcon size={13} />
      </button>
    </div>
  );
}

export function PreviewSafetyDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<PreviewSafetyStatus | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportedFile, setExportedFile] = useState("");
  const [feedback, setFeedback] = useState<PreviewFeedbackInput>({ category: "usability", summary: "" });

  useEffect(() => {
    void getPreviewSafetyStatus().then(setStatus).catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  const update = (field: keyof PreviewFeedbackInput, value: string) => {
    setFeedback((current) => ({ ...current, [field]: value }));
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal preview-safety-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-safety-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div><span>PROJECT V2 PREVIEW</span><h2 id="preview-safety-title">预览安全与反馈</h2></div>
          <button className="iconbtn" type="button" aria-label="关闭预览安全" onClick={onClose}><XIcon size={15} /></button>
        </header>
        <div className="content">
          {error && <p className="preview-safety-error" role="alert">{error}</p>}
          {!status ? <p className="muted">正在读取本地安全状态…</p> : (
            <>
              <section className="preview-safety-summary">
                <div><span>本地项目</span><strong>{status.diagnostics.projects.total}</strong></div>
                <div><span>已完成流程</span><strong>{status.diagnostics.flows.completed}</strong></div>
                <div><span>不可用索引</span><strong>{status.diagnostics.projects.missing + status.diagnostics.projects.invalid}</strong></div>
                <small>Vibedesign {status.app.version} · {status.app.platform}/{status.app.arch}</small>
              </section>

              <section className="preview-safety-section">
                <div className="preview-section-title"><span>01</span><div><h3>数据安全与回滚</h3><p>迁移只复制旧项目，不覆盖旧数据。</p></div></div>
                {status.migration ? (
                  <div className="preview-backup-card">
                    <div className="preview-backup-state">
                      <strong>{status.migration.backupExists && status.migration.backupVerifiedAtMigration && status.migration.backupIntact ? "迁移备份完整" : "请检查迁移备份"}</strong>
                      <span className={status.migration.backupExists && status.migration.backupIntact !== false ? "ok" : "warn"}>{status.migration.backupExists ? "备份存在" : "备份缺失"}</span>
                    </div>
                    <PathRow label="旧数据" value={status.migration.sourceFile} />
                    <PathRow label="迁移备份" value={status.migration.backupFile} />
                    {status.migration.sourceChangedSinceMigration && <p className="preview-source-note">旧数据在迁移后发生过变化；备份仍保留迁移时快照。</p>}
                    {status.migration.backupIntact === false && <p className="preview-source-note">当前备份内容与迁移时哈希不一致，请先保留现场并检查磁盘文件。</p>}
                  </div>
                ) : <p className="preview-empty-note">尚未执行旧项目迁移，目前没有迁移备份需要处理。</p>}
                {status.migration && (
                  <ol className="preview-rollback-steps">
                    {status.rollbackSteps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                )}
              </section>

              <form
                className="preview-feedback-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const destination = window.vd?.selectDirectory
                    ? await window.vd.selectDirectory()
                    : prompt("选择反馈包保存目录");
                  if (!destination) return;
                  setExporting(true);
                  setError("");
                  try {
                    const result = await exportPreviewFeedback(destination, feedback);
                    setExportedFile(result.file);
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : String(reason));
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                <div className="preview-section-title"><span>02</span><div><h3>导出脱敏反馈</h3><p>生成本地 JSON，由你检查后自行发送。</p></div></div>
                <div className="preview-feedback-grid">
                  <label>类型<select value={feedback.category} onChange={(event) => update("category", event.target.value)}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="wide">问题概述<input autoFocus required maxLength={200} value={feedback.summary} onChange={(event) => update("summary", event.target.value)} placeholder="一句话说明发生了什么" /></label>
                  <label className="wide">复现步骤<textarea maxLength={4000} value={feedback.steps ?? ""} onChange={(event) => update("steps", event.target.value)} placeholder="1. 打开…&#10;2. 点击…" /></label>
                  <label>预期结果<textarea maxLength={2000} value={feedback.expected ?? ""} onChange={(event) => update("expected", event.target.value)} /></label>
                  <label>实际结果<textarea maxLength={2000} value={feedback.actual ?? ""} onChange={(event) => update("actual", event.target.value)} /></label>
                </div>
                <div className="preview-privacy-note">
                  <strong>默认排除</strong>
                  <span>{status.feedbackExcludes.join("、")}。</span>
                  <small>你填写的上述文字会原样进入反馈包。</small>
                </div>
                <footer>
                  <div aria-live="polite">{exportedFile ? <>已保存：<code>{exportedFile}</code></> : "反馈不会自动上传。"}</div>
                  <button className="btn primary" type="submit" disabled={exporting || !feedback.summary.trim()}>{exporting ? "正在导出…" : "导出反馈包"}</button>
                </footer>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
