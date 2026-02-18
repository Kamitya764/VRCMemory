import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import SearchBar from "@/components/SearchBar";
import PhotoGrid from "@/components/PhotoGrid";
import WorldHistory from "@/components/WorldHistory";
import FriendManager from "@/components/FriendManager";
import Analytics from "@/components/Analytics";
import AlbumView from "@/components/AlbumView";
import Settings from "@/components/Settings";
import StatusBar from "@/components/StatusBar";
import SetupWizard from "@/components/SetupWizard";
import ToastContainer from "@/components/ToastContainer";
import { listen } from "@tauri-apps/api/event";
import { getSettings, getPhotos, updateSettings } from "@/lib/api";
import type { Photo } from "@/lib/api";

export type View =
  | "all"
  | "recent"
  | "albums"
  | "friends"
  | "worlds"
  | "analytics"
  | "settings";

type Theme = "dark" | "light";

function App() {
  const [currentView, setCurrentView] = useState<View>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [theme, setTheme] = useState<Theme>("dark");

  const applyTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    setTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    updateSettings({ theme: next }).catch(() => {});
  }, [theme, applyTheme]);

  const checkSetup = useCallback(async () => {
    try {
      const settings = await getSettings();
      setNeedsSetup(!settings.photo_folder);
      if (settings.theme === "light" || settings.theme === "dark") {
        applyTheme(settings.theme);
      }
    } catch {
      setNeedsSetup(false);
    }
  }, [applyTheme]);

  const loadPhotos = useCallback(async () => {
    try {
      const result = await getPhotos(0, 100);
      setPhotos(result.photos);
      setPhotoCount(result.total);
    } catch {
      // Not running in Tauri
    }
  }, []);

  useEffect(() => {
    checkSetup();
  }, [checkSetup]);

  useEffect(() => {
    if (needsSetup === false) {
      loadPhotos();
    }
  }, [needsSetup, loadPhotos]);

  // Listen for watcher events to auto-refresh
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<number>("photos-updated", () => {
      loadPhotos();
    }).then((fn) => {
      unlisten = fn;
    }).catch(() => {});
    return () => unlisten?.();
  }, [loadPhotos]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "1") setCurrentView("all");
      if (e.key === "2") setCurrentView("recent");
      if (e.key === "3") setCurrentView("albums");
      if (e.key === "4") setCurrentView("friends");
      if (e.key === "5") setCurrentView("worlds");
      if (e.key === "6") setCurrentView("analytics");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (needsSetup === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-[var(--color-text-muted)]">読み込み中...</p>
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="flex h-screen flex-col">
        <header className="flex items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          <h1 className="text-lg font-bold tracking-tight text-[var(--color-primary)]">
            VRCMemory
          </h1>
        </header>
        <div className="flex-1">
          <SetupWizard
            onComplete={() => {
              setNeedsSetup(false);
              loadPhotos();
            }}
          />
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (currentView) {
      case "worlds":
        return <WorldHistory />;
      case "friends":
        return <FriendManager />;
      case "albums":
        return <AlbumView />;
      case "analytics":
        return <Analytics />;
      case "settings":
        return <Settings />;
      default:
        return (
          <PhotoGrid
            view={currentView}
            searchQuery={searchQuery}
            photos={photos}
            onRefresh={loadPhotos}
          />
        );
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        <h1 className="text-lg font-bold tracking-tight text-[var(--color-primary)]">
          VRCMemory
        </h1>
        <SearchBar query={searchQuery} onQueryChange={setSearchQuery} />
        <button
          onClick={toggleTheme}
          className="rounded-lg p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          title={theme === "dark" ? "ライトモード" : "ダークモード"}
        >
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="8" cy="8" r="3.5" />
              <path d="M8 1V2.5M8 13.5V15M1 8H2.5M13.5 8H15M3.1 3.1L4.2 4.2M11.8 11.8L12.9 12.9M12.9 3.1L11.8 4.2M4.2 11.8L3.1 12.9" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13.5 8.5A5.5 5.5 0 117.5 2.5 4 4 0 0013.5 8.5z" />
            </svg>
          )}
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
        <main className="flex-1 overflow-y-auto p-4">{renderContent()}</main>
      </div>

      <StatusBar photoCount={photoCount} />
      <ToastContainer />
    </div>
  );
}

export default App;
