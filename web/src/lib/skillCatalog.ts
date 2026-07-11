// Skills modal catalog per user's Image 3, mapped onto the brain's skill files.
// Entries either invoke a brain skill (skillId), inject an instruction
// (extraInstruction), or run a local action (action).

import { QuestionForm } from "./artifact";

export interface SkillEntry {
  title: string;
  desc: string;
  skillId?: string;
  extraInstruction?: string;
  action?: "save-pdf";
  disabled?: boolean;
  // Optional typed inputs — when set, picking this skill shows a form (reusing
  // QuestionFormView) BEFORE generation; answers are folded into the brief. This
  // is open-design's "skill inputs" adapted onto Vibedesign's form runtime.
  inputs?: QuestionForm;
}

export interface SkillGroup {
  label: string;
  icon: string;
  entries: SkillEntry[];
}

export const SKILL_GROUPS: SkillGroup[] = [
  {
    label: "Create",
    icon: "✎",
    entries: [
      { title: "Make a deck", desc: "Slide presentation in HTML", skillId: "make-a-deck" },
      {
        title: "Make a doc",
        desc: "Page-style document, printable out of the box",
        extraInstruction:
          "Produce a page-style document (A4 proportions, print-ready with @media print styles): clear typographic hierarchy, generous margins, paginated sections. Still deliver as one self-contained HTML document.",
      },
      { title: "Interactive prototype", desc: "Working app with real interactions", skillId: "make-a-prototype" },
      { title: "Wireframe", desc: "Explore many ideas with wireframes and storyboards", skillId: "wireframe" },
      {
        title: "Animated video",
        desc: "Timeline-based motion design",
        extraInstruction:
          "Build a timeline-based motion piece: a fixed 16:9 stage, keyframed CSS/JS animations organized on a master timeline with play/pause and a scrubber, letterboxed to the viewport.",
      },
      {
        title: "Create design system",
        desc: "Skill to use if user asks you to create a design system or UI kit",
        skillId: "design-system-extract",
      },
      {
        title: "Frontend design",
        desc: "Aesthetic direction for designs outside an existing brand system",
        skillId: "frontend-aesthetic-direction",
      },
      { title: "Variations", desc: "3+ distinct directions in one file", skillId: "generate-variations" },
    ],
  },
  {
    label: "模板 · 原型 / 页面",
    icon: "▤",
    entries: [
      { title: "Web prototype", desc: "通用桌面网页（landing/docs/官网）", skillId: "web-prototype" },
      {
        title: "SaaS landing",
        desc: "hero / features / proof / pricing / CTA",
        skillId: "saas-landing",
        inputs: {
          title: "SaaS landing — 几个关键输入",
          questions: [
            { id: "product", label: "产品名 & 一句话定位", type: "text", hint: "如：Cadence · 给远程团队的异步站会" },
            { id: "audience", label: "目标用户", type: "chips", options: ["开发者", "设计师", "PM / 运营", "中小企业", "个人创作者"], decide: true, other: true },
            { id: "pricing", label: "要不要定价区块", type: "chips", options: ["三档定价", "单一价格", "先不放价格"], decide: true },
            { id: "cta", label: "主 CTA 文案", type: "text", optional: true, hint: "如：开始免费试用 / 预约演示" },
          ],
        },
      },
      {
        title: "Dashboard",
        desc: "后台 / 数据看板（侧栏 + KPI + 图表）",
        skillId: "dashboard",
        inputs: {
          title: "Dashboard — 关键输入",
          questions: [
            { id: "domain", label: "这是什么系统的看板", type: "text", hint: "如：电商后台 / SaaS 运营 / 物流调度" },
            { id: "metrics", label: "首屏最重要的 3-4 个指标", type: "text", hint: "如：GMV、活跃用户、转化率、退款率" },
            { id: "charts", label: "主要图表类型", type: "chips", options: ["折线趋势", "柱状对比", "环形占比", "热力/地图", "表格明细"], decide: true, other: true },
          ],
        },
      },
      { title: "Mobile app", desc: "单屏移动 App（配「移动端应用」设备视图）", skillId: "mobile-app" },
      { title: "Mobile onboarding", desc: "三屏移动引导流", skillId: "mobile-onboarding" },
    ],
  },
  {
    label: "模板 · 营销物料",
    icon: "◆",
    entries: [
      {
        title: "Social carousel",
        desc: "3 卡方形轮播（标题连成一句）",
        skillId: "social-carousel",
        inputs: {
          title: "Social carousel — 关键输入",
          questions: [
            { id: "topic", label: "这组卡片讲什么", type: "text", hint: "如：3 个提升专注力的方法" },
            { id: "platform", label: "投放平台", type: "chips", options: ["小红书", "Instagram", "LinkedIn", "微信"], decide: true, other: true },
            { id: "tone", label: "语气", type: "chips", options: ["专业干货", "轻松口语", "励志", "犀利观点"], decide: true },
          ],
        },
      },
      { title: "Email marketing", desc: "品牌产品发布邮件", skillId: "email-marketing" },
      { title: "Magazine poster", desc: "编辑风海报 / 报纸版式", skillId: "magazine-poster" },
      { title: "Motion frames", desc: "循环 CSS 动效 hero（可导出视频）", skillId: "motion-frames" },
      { title: "Sprite animation", desc: "像素 / 复古动画讲解帧", skillId: "sprite-animation" },
    ],
  },
  {
    label: "模板 · 文档 / 工作",
    icon: "▦",
    entries: [
      { title: "PM spec", desc: "产品需求文档 / PRD", skillId: "pm-spec" },
      { title: "Team OKRs", desc: "OKR 追踪 scorecard", skillId: "team-okrs" },
      { title: "Eng runbook", desc: "工程 / 运维 runbook", skillId: "eng-runbook" },
      {
        title: "Finance report",
        desc: "财务报告（KPI + 图表 + P&L）",
        skillId: "finance-report",
        inputs: {
          title: "Finance report — 关键输入",
          questions: [
            { id: "company", label: "公司 / 业务名", type: "text", hint: "如：Acme SaaS Inc." },
            { id: "period", label: "报告期", type: "text", hint: "如：2026 Q2 / FY2025" },
            { id: "currency", label: "币种", type: "chips", options: ["CNY ¥", "USD $", "EUR €"], decide: true, other: true },
          ],
        },
      },
      { title: "HR onboarding", desc: "新人入职计划（30/60/90）", skillId: "hr-onboarding" },
    ],
  },
  {
    label: "模板 · 演示",
    icon: "▭",
    entries: [
      { title: "Magazine deck", desc: "杂志风横滑幻灯（内联翻页）", skillId: "magazine-deck" },
      { title: "Consulting deck", desc: "咨询 / 战略汇报 + 演讲者备注", skillId: "consulting-deck" },
    ],
  },
  {
    label: "Enhance",
    icon: "⊞",
    entries: [
      { title: "Make tweakable", desc: "Add in-design tweak controls", skillId: "make-tweakable" },
      {
        title: "Claude API in prototypes",
        desc: "Call the model from artifacts via window.claude.complete",
        extraInstruction:
          "The canvas runtime injects window.claude.complete(prompt: string): Promise<string> into every rendered artifact — a real bridge to the user's configured model. When the prototype needs AI behavior (chat replies, generated copy, smart search), call it directly and handle loading/error states. Note: it only exists inside this app's canvas; guard with `if (window.claude)` and provide a graceful fallback for exported HTML.",
      },
    ],
  },
  {
    label: "Review",
    icon: "✓",
    entries: [
      { title: "Polish pass", desc: "Accessibility, slop, hierarchy & states in one pass", skillId: "polish-pass" },
      { title: "Accessibility audit", desc: "Contrast, semantics, keyboard, motion", skillId: "accessibility-audit" },
      { title: "AI-slop check", desc: "Detect and fix generic AI-template tropes", skillId: "ai-slop-check" },
      {
        title: "Hierarchy & rhythm",
        desc: "Size/weight/color signals and spacing discipline",
        skillId: "hierarchy-rhythm-review",
      },
      {
        title: "Interaction states",
        desc: "Hover, focus, active, disabled + transitions",
        skillId: "interaction-states-pass",
      },
      { title: "Critique", desc: "五维专家评审 + 雷达图报告", skillId: "critique" },
    ],
  },
  {
    label: "Export & handoff",
    icon: "↗",
    entries: [{ title: "Save as PDF", desc: "Print-ready PDF export", action: "save-pdf" }],
  },
];
