import { useState } from "react";
import Sidebar from "./components/Sidebar";
import SearchBar from "./components/SearchBar";
import PhotoGrid from "./components/PhotoGrid";
import StatusBar from "./components/StatusBar";

export type View =
  | "all"
  | "recent"
  | "albums"
  | "friends"
  | "worlds"
  | "analytics";

function App() {
  const [currentView, setCurrentView] = useState<View>("all");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        <h1 className="text-lg font-bold tracking-tight text-[var(--color-primary)]">
          VRCMemory
        </h1>
        <SearchBar query={searchQuery} onQueryChange={setSearchQuery} />
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
        <main className="flex-1 overflow-y-auto p-4">
          <PhotoGrid view={currentView} searchQuery={searchQuery} />
        </main>
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  );
}

export default App;
