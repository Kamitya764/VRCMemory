import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import SearchBar from "@/components/SearchBar";
import PhotoGrid from "@/components/PhotoGrid";
import WorldHistory from "@/components/WorldHistory";
import FriendManager from "@/components/FriendManager";
import Analytics from "@/components/Analytics";
import Settings from "@/components/Settings";
import StatusBar from "@/components/StatusBar";
import SetupWizard from "@/components/SetupWizard";
import { getSettings, getPhotos } from "@/lib/api";
import type { Photo } from "@/lib/api";

export type View =
  | "all"
  | "recent"
  | "albums"
  | "friends"
  | "worlds"
  | "analytics"
  | "settings";

function App() {
  const [currentView, setCurrentView] = useState<View>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoCount, setPhotoCount] = useState(0);

  const checkSetup = useCallback(async () => {
    try {
      const settings = await getSettings();
      setNeedsSetup(!settings.photo_folder);
    } catch {
      // Not running in Tauri - show UI anyway for dev
      setNeedsSetup(false);
    }
  }, []);

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
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
        <main className="flex-1 overflow-y-auto p-4">{renderContent()}</main>
      </div>

      <StatusBar photoCount={photoCount} />
    </div>
  );
}

export default App;
