import { SKILL_GROUPS, SkillEntry } from "../lib/skillCatalog";
import { XIcon } from "./icons";

interface Props {
  onPick: (entry: SkillEntry) => void;
  onClose: () => void;
}

// Skills modal per user's Image 3: grouped list (Create / Enhance / Review /
// Export & handoff), each entry title + one-line description.
export function SkillsModal({ onPick, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal skills-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Skills</h2>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 13.5 }}>
              Attach a skill to give Claude additional context.
            </p>
          </div>
          <button className="iconbtn" onClick={onClose}>
            <XIcon size={13} />
          </button>
        </header>
        <div className="content" style={{ gap: 18 }}>
          {SKILL_GROUPS.map((g) => (
            <div key={g.label} className="skill-group">
              <div className="skill-group-label">
                <span>{g.icon}</span> {g.label}
              </div>
              {g.entries.map((e) => (
                <button
                  key={e.title}
                  className="skill-entry"
                  disabled={e.disabled}
                  onClick={() => !e.disabled && onPick(e)}
                >
                  <span className="t">{e.title}</span>
                  <span className="d">{e.desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
