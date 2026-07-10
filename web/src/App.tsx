import { useEffect, useState } from "react";
import { Meta, fetchMeta } from "./lib/api";
import { HomePage } from "./pages/HomePage";
import { EditorPage } from "./pages/EditorPage";
import { SettingsModal } from "./components/SettingsModal";

// Hash router: "#/" home · "#/p/<id>" editor (spec §1).
function useRoute(): string {
  const [hash, setHash] = useState(location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export function App() {
  const route = useRoute();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Retry a few times: the vite proxy can drop the first request right after
  // a backend hot-restart, and meta being null disables the whole composer.
  const refreshMeta = async (attempts = 3) => {
    for (let i = 0; i < attempts; i++) {
      try {
        setMeta(await fetchMeta());
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
  };

  useEffect(() => {
    refreshMeta();
  }, []);

  const projMatch = route.match(/^#\/p\/([\w-]+)/);

  return (
    <>
      {projMatch ? (
        <EditorPage
          key={projMatch[1]} // remount per project: no state/stream bleed
          projectId={projMatch[1]}
          meta={meta}
          onMetaChanged={refreshMeta}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <HomePage meta={meta} onMetaChanged={refreshMeta} onOpenSettings={() => setSettingsOpen(true)} />
      )}

      {settingsOpen && meta && (
        <SettingsModal meta={meta} onClose={() => setSettingsOpen(false)} onChanged={refreshMeta} />
      )}
    </>
  );
}
