interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
}

function SearchBar({ query, onQueryChange }: SearchBarProps) {
  return (
    <div className="flex flex-1 items-center">
      <div className="relative w-full max-w-lg">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="写真を検索... 例: 「先月の青いワールド」"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 pl-10 pr-4 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] outline-none transition-colors focus:border-[var(--color-primary)]"
        />
      </div>
    </div>
  );
}

export default SearchBar;
