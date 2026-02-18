import type { View } from "@/App";

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const navItems: { view: View; label: string; icon: string }[] = [
  { view: "all", label: "すべて", icon: "🖼" },
  { view: "recent", label: "最近", icon: "🕐" },
  { view: "albums", label: "アルバム", icon: "📁" },
  { view: "friends", label: "フレンド", icon: "👥" },
  { view: "worlds", label: "ワールド", icon: "🌐" },
  { view: "analytics", label: "分析", icon: "📊" },
];

function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <nav className="flex w-48 flex-col gap-1 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      {navItems.map((item) => (
        <button
          key={item.view}
          onClick={() => onViewChange(item.view)}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
            currentView === item.view
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          }`}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default Sidebar;
