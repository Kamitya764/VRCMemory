import { useState, useEffect, useRef } from "react";
import { getWorldHistory, updateWorldRating, updateWorldNotes } from "@/lib/api";
import type { WorldVisit } from "@/lib/api";
import { formatDateTimeShort, formatTime, calcDuration } from "@/lib/format";
import { showToast } from "@/lib/toast";

function WorldHistory() {
  const [visits, setVisits] = useState<WorldVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getWorldHistory()
      .then(setVisits)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRate = async (id: string, rating: number | null) => {
    try {
      await updateWorldRating(id, rating);
      setVisits((prev) =>
        prev.map((v) => (v.id === id ? { ...v, rating } : v)),
      );
    } catch {
      showToast("評価の保存に失敗しました", "error");
    }
  };

  const handleNotes = async (id: string, notes: string) => {
    const value = notes.trim() || null;
    try {
      await updateWorldNotes(id, value);
      setVisits((prev) =>
        prev.map((v) => (v.id === id ? { ...v, notes: value } : v)),
      );
    } catch {
      showToast("メモの保存に失敗しました", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-muted)]">
        読み込み中...
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-text-muted)]">
        <h2 className="mb-4 text-xl font-semibold text-[var(--color-text)]">
          ワールド履歴
        </h2>
        <p>ワールド訪問履歴がありません</p>
        <p className="mt-2 text-sm">
          VRChatのログフォルダを設定すると、
          <br />
          ワールド訪問履歴が自動で記録されます。
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">ワールド履歴</h2>
        <span className="text-sm text-[var(--color-text-muted)]">
          {visits.length} 件
        </span>
      </div>

      <div className="space-y-2">
        {visits.map((visit) => (
          <div
            key={visit.id}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            <button
              onClick={() =>
                setExpandedId(expandedId === visit.id ? null : visit.id)
              }
              className="w-full p-4 text-left"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">
                      {visit.world_name || "不明なワールド"}
                    </h3>
                    {visit.rating !== null && (
                      <span className="text-xs text-[var(--color-accent)]">
                        {"★".repeat(visit.rating)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
                    <span>{formatDateTimeShort(visit.entered_at)}</span>
                    {visit.left_at && (
                      <span>
                        ~ {formatTime(visit.left_at)} (
                        {calcDuration(visit.entered_at, visit.left_at)})
                      </span>
                    )}
                  </div>
                  {visit.players.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {visit.players.slice(0, 8).map((player) => (
                        <span
                          key={player}
                          className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]"
                        >
                          {player}
                        </span>
                      ))}
                      {visit.players.length > 8 && (
                        <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                          +{visit.players.length - 8}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="ml-2 shrink-0 rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                  {visit.instance_type}
                </span>
              </div>
            </button>

            {/* Expanded detail panel */}
            {expandedId === visit.id && (
              <div className="border-t border-[var(--color-border)] px-4 pb-4 pt-3">
                <div className="flex flex-col gap-3">
                  {/* Star rating */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-text-muted)]">
                      評価:
                    </span>
                    <StarRating
                      value={visit.rating}
                      onChange={(r) => handleRate(visit.id, r)}
                    />
                  </div>
                  {/* Notes */}
                  <NotesEditor
                    value={visit.notes || ""}
                    onSave={(text) => handleNotes(visit.id, text)}
                  />
                  {/* All players */}
                  {visit.players.length > 8 && (
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        全プレイヤー ({visit.players.length}人):
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {visit.players.map((player) => (
                          <span
                            key={player}
                            className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]"
                          >
                            {player}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* World ID */}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {visit.world_id}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (rating: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(value === star ? null : star)}
          className={`text-lg transition-colors ${
            value !== null && star <= value
              ? "text-[var(--color-accent)]"
              : "text-[var(--color-text-muted)]/30 hover:text-[var(--color-accent)]/50"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function NotesEditor({
  value,
  onSave,
}: {
  value: string;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setText(value);
          setEditing(true);
        }}
        className="text-left text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
      >
        {value || "メモを追加..."}
      </button>
    );
  }

  return (
    <div className="flex gap-2">
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSave(text);
            setEditing(false);
          }
          if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        rows={2}
        className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]"
        placeholder="メモ..."
      />
      <div className="flex flex-col gap-1">
        <button
          onClick={() => {
            onSave(text);
            setEditing(false);
          }}
          className="rounded bg-[var(--color-primary)] px-2 py-1 text-xs text-white"
        >
          保存
        </button>
        <button
          onClick={() => setEditing(false)}
          className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)]"
        >
          取消
        </button>
      </div>
    </div>
  );
}


export default WorldHistory;
