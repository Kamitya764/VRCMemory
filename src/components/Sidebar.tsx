import type { View } from "@/App";

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const mainItems: { view: View; label: string; icon: string }[] = [
  { view: "all", label: "すべて", icon: "🖼" },
  { view: "recent", label: "最近", icon: "🕐" },
  { view: "albums", label: "アルバム", icon: "📁" },
  { view: "friends", label: "フレンド", icon: "👥" },
  { view: "worlds", label: "ワールド", icon: "🌐" },
  { view: "analytics", label: "分析", icon: "📊" },
];

function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <nav className="flex w-48 flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <div className="flex flex-col gap-1">
        {mainItems.map((item) => (
          <NavButton
            key={item.view}
            item={item}
            active={currentView === item.view}
            onClick={() => onViewChange(item.view)}
          />
        ))}
      </div>
      <div className="border-t border-[var(--color-border)] pt-2">
        <NavButton
          item={{ view: "settings", label: "設定", icon: "⚙" }}
          active={currentView === "settings"}
          onClick={() => onViewChange("settings")}
        />
      </div>
    </nav>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { view: View; label: string; icon: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-[var(--color-primary)] text-white"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
      }`}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );
}

export default Sidebar;
