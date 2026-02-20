import type { ReactNode } from "react";
import type { View } from "@/App";

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const mainItems: { view: View; label: string; icon: ReactNode }[] = [
  {
    view: "all",
    label: "すべて",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    view: "recent",
    label: "最近",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4V8L10.5 10.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    view: "albums",
    label: "アルバム",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <path d="M2 6H14" />
        <circle cx="5" cy="9" r="1" />
      </svg>
    ),
  },
  {
    view: "friends",
    label: "フレンド",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="6" cy="5" r="2.5" />
        <path d="M1.5 13C1.5 10.5 3.5 9 6 9C8.5 9 10.5 10.5 10.5 13" strokeLinecap="round" />
        <circle cx="11.5" cy="5.5" r="2" />
        <path d="M14.5 13C14.5 11 13 9.5 11.5 9.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    view: "worlds",
    label: "ワールド",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6.5" />
        <path d="M2 8H14" />
        <path d="M8 1.5C9.5 3.5 10 5.5 10 8C10 10.5 9.5 12.5 8 14.5" />
        <path d="M8 1.5C6.5 3.5 6 5.5 6 8C6 10.5 6.5 12.5 8 14.5" />
      </svg>
    ),
  },
  {
    view: "analytics",
    label: "分析",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="8" width="3" height="6" rx="0.5" />
        <rect x="6.5" y="4" width="3" height="10" rx="0.5" />
        <rect x="11" y="2" width="3" height="12" rx="0.5" />
      </svg>
    ),
  },
];

function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <nav className="flex w-48 flex-col justify-between border-r border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <div className="flex flex-col gap-0.5">
        {mainItems.map((item) => (
          <button
            key={item.view}
            onClick={() => onViewChange(item.view)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all ${
              currentView === item.view
                ? "bg-[var(--color-primary)]/12 text-[var(--color-primary)] font-medium"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="border-t border-[var(--color-border)] pt-2">
        <button
          onClick={() => onViewChange("settings")}
          className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all ${
            currentView === "settings"
              ? "bg-[var(--color-primary)]/12 text-[var(--color-primary)] font-medium"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="2" />
            <path d="M8 1V3M8 13V15M1 8H3M13 8H15M2.9 2.9L4.3 4.3M11.7 11.7L13.1 13.1M13.1 2.9L11.7 4.3M4.3 11.7L2.9 13.1" strokeLinecap="round" />
          </svg>
          <span>設定</span>
        </button>
      </div>
    </nav>
  );
}

export default Sidebar;
