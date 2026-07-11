import { getLang, setLang, useLang } from "../lib/i18n";

// 中 / EN toggle (home top-right). Shows both options; the active one is bold.
export function LangToggle() {
  useLang();
  const lang = getLang();
  return (
    <button
      className="lang-toggle"
      title={lang === "zh" ? "Switch to English" : "切换为中文"}
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
    >
      <span className={lang === "zh" ? "on" : ""}>中</span>
      <span className="sep">/</span>
      <span className={lang === "en" ? "on" : ""}>EN</span>
    </button>
  );
}
