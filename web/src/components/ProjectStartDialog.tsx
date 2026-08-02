import { useMemo, useState } from "react";
import type { ProjectPlatform } from "../../../shared/project";
import type { DesignSystem, Meta } from "../lib/api";
import { createProjectV2 } from "../lib/projectApi";
import { XIcon } from "./icons";

interface Props {
  designSystems: DesignSystem[];
  meta: Meta | null;
  onClose: () => void;
}

const TEMPLATE_PAGES: Record<string, string[]> = {
  blank: ["首页"],
  product: ["工作台", "项目详情", "设置"],
  landing: ["首页"],
};

export function ProjectStartDialog({ designSystems, meta, onClose }: Props) {
  const [brief, setBrief] = useState("");
  const [name, setName] = useState("");
  const [directory, setDirectory] = useState("");
  const [platform, setPlatform] = useState<ProjectPlatform>("web");
  const [strategy, setStrategy] = useState<"global-draft" | "flow-deepening">("global-draft");
  const [template, setTemplate] = useState("blank");
  const [pages, setPages] = useState("首页");
  const [flowName, setFlowName] = useState("");
  const [designSystemId, setDesignSystemId] = useState("");
  const [providerId, setProviderId] = useState(meta?.activeProviderId ?? "");
  const [skillId, setSkillId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const providers = meta?.providers ?? [];
  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const pageTitles = useMemo(
    () => pages.split(/[,，\n]/).map((page) => page.trim()).filter(Boolean),
    [pages],
  );

  const applyTemplate = (value: string) => {
    setTemplate(value);
    setPages(TEMPLATE_PAGES[value].join("，"));
    if (value === "product" && !flowName) setFlowName("查看并管理项目");
  };

  return (
    <div className="project-start-backdrop" onMouseDown={onClose}>
      <form
        className="project-start"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim() || !brief.trim() || !directory.trim() || !pageTitles.length) return;
          setBusy(true);
          setError("");
          try {
            const record = await createProjectV2({
              name: name.trim(),
              parentDirectory: directory.trim(),
              platform,
              settings: {
                ...(designSystemId ? { designSystemId } : {}),
                ...(template !== "blank" ? { templateId: template } : {}),
                ...(providerId ? { defaultProviderId: providerId } : {}),
                ...(selectedProvider?.model ? { defaultModel: selectedProvider.model } : {}),
              },
              proposal: {
                brief: brief.trim(),
                pageTitles,
                ...(flowName.trim() ? { primaryFlowName: flowName.trim() } : {}),
                strategy,
              },
            });
            if (skillId) {
              sessionStorage.setItem(`vd_project_next_skill_${record.manifest.id}`, skillId);
            }
            location.hash = `#/project/${record.manifest.id}`;
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
            setBusy(false);
          }
        }}
      >
        <header>
          <div>
            <span>项目提案</span>
            <h2>先定义边界，再创建原型</h2>
            <p>这些选择只服务于前端 UI/UX；后端能力用可替换的模拟状态表达。</p>
          </div>
          <button type="button" onClick={onClose}><XIcon size={16} /></button>
        </header>

        <div className="project-start-grid">
          <section>
            <label>
              项目名称
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Linear 风格项目管理工具" autoFocus />
            </label>
            <label>
              产品目标与用户
              <textarea
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder="为小型产品团队设计一个克制、快速的项目管理前端，首要目标是创建项目并查看进度。"
                rows={4}
              />
            </label>
            <label>
              本地父目录
              <span className="project-directory-input">
                <input value={directory} onChange={(event) => setDirectory(event.target.value)} placeholder="D:\Designs" />
                {window.vd?.selectDirectory && (
                  <button
                    type="button"
                    onClick={async () => {
                      const selected = await window.vd?.selectDirectory();
                      if (selected) setDirectory(selected);
                    }}
                  >
                    选择…
                  </button>
                )}
              </span>
              <small>项目将作为一个可携带子目录创建在这里。</small>
            </label>
            <div className="project-start-pair">
              <label>
                目标平台
                <select value={platform} onChange={(event) => setPlatform(event.target.value as ProjectPlatform)}>
                  <option value="web">Web</option>
                  <option value="desktop">桌面应用 UI</option>
                  <option value="mobile">移动应用 UI</option>
                </select>
              </label>
              <label>
                生成策略
                <select value={strategy} onChange={(event) => setStrategy(event.target.value as typeof strategy)}>
                  <option value="global-draft">全局草拟</option>
                  <option value="flow-deepening">优先深化首要流程</option>
                </select>
              </label>
            </div>
          </section>

          <section className="project-proposal-card">
            <div className="proposal-number">01</div>
            <label>
              初始化模板
              <select value={template} onChange={(event) => applyTemplate(event.target.value)}>
                <option value="blank">空白项目</option>
                <option value="product">产品工作台</option>
                <option value="landing">单页落地页</option>
              </select>
              <small>模板仅用于初始化，不会永久限制项目。</small>
            </label>
            <label>
              主要页面
              <textarea value={pages} onChange={(event) => setPages(event.target.value)} rows={3} />
              <small>使用逗号或换行分隔；单页项目只保留一个名称。</small>
            </label>
            <label>
              首要体验流程
              <input value={flowName} onChange={(event) => setFlowName(event.target.value)} placeholder="可选，例如：创建并查看项目" />
            </label>
            <div className="project-start-pair">
              <label>
                Design System
                <select value={designSystemId} onChange={(event) => setDesignSystemId(event.target.value)}>
                  <option value="">项目默认</option>
                  {designSystems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
                </select>
              </label>
              <label>
                项目默认模型
                <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                  <option value="">未指定</option>
                  {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                </select>
              </label>
            </div>
            <label>
              下一次操作使用的 Skill
              <select value={skillId} onChange={(event) => setSkillId(event.target.value)}>
                <option value="">不附加</option>
                {(meta?.skills ?? []).map((skill) => <option key={skill.id} value={skill.id}>{skill.title}</option>)}
              </select>
              <small>Skill 只作用于创建后的下一次操作，不成为项目永久配置。</small>
            </label>
          </section>
        </div>

        {error && <div className="project-start-error">{error}</div>}
        <footer>
          <div>
            <strong>{pageTitles.length} 个页面</strong>
            <span>{flowName.trim() ? " · 1 条首要流程" : " · 尚未定义流程"}</span>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>取消</button>
          <button
            type="submit"
            className="btn primary"
            disabled={busy || !name.trim() || !brief.trim() || !directory.trim() || !pageTitles.length}
          >
            {busy ? "正在创建…" : "确认并创建项目"}
          </button>
        </footer>
      </form>
    </div>
  );
}
