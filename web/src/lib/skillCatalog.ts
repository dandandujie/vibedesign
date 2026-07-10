// Skills modal catalog per user's Image 3, mapped onto the brain's skill files.
// Entries either invoke a brain skill (skillId), inject an instruction
// (extraInstruction), or run a local action (action).

export interface SkillEntry {
  title: string;
  desc: string;
  skillId?: string;
  extraInstruction?: string;
  action?: "save-pdf";
  disabled?: boolean;
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
    label: "Enhance",
    icon: "⊞",
    entries: [
      { title: "Make tweakable", desc: "Add in-design tweak controls", skillId: "make-tweakable" },
      {
        title: "Claude API in prototypes",
        desc: "Call the model from your HTML artifacts（即将支持）",
        disabled: true,
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
    ],
  },
  {
    label: "Export & handoff",
    icon: "↗",
    entries: [{ title: "Save as PDF", desc: "Print-ready PDF export", action: "save-pdf" }],
  },
];
