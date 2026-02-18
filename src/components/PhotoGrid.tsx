import type { View } from "../App";

interface PhotoGridProps {
  view: View;
  searchQuery: string;
}

function PhotoGrid({ view, searchQuery: _searchQuery }: PhotoGridProps) {
  const viewLabels: Record<View, string> = {
    all: "すべての写真",
    recent: "最近の写真",
    albums: "アルバム",
    friends: "フレンド",
    worlds: "ワールド履歴",
    analytics: "プレイスタイル分析",
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
      <h2 className="mb-4 text-xl font-semibold text-[var(--color-text)]">
        {viewLabels[view]}
      </h2>
      <p className="mb-2">VRChat写真フォルダを設定してください</p>
      <p className="text-sm">
        設定画面からVRChatの写真フォルダパスを指定すると、
        <br />
        自動的に写真がインデックスされます。
      </p>
      <button className="mt-6 rounded-lg bg-[var(--color-primary)] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)]">
        セットアップを開始
      </button>
    </div>
  );
}

export default PhotoGrid;
