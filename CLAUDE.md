# VRCMemory - Development Guide & Coding Standards

## Project Overview

VRCMemory is a desktop application that manages VRChat photos, world visit history, and playstyle analytics using AI-powered fuzzy search. Built with Tauri v2 (Rust) + React + TypeScript frontend and a Python FastAPI sidecar for ML/AI processing.

**Concept**: "VRChatの思い出をAIで整理し、雑な言葉で見つけ出せるデスクトップアプリ"

---

## Architecture

```
┌─────────────────────────────────────────────┐
│           React + TypeScript (UI)           │
│  16 components, ~4,930 LOC                  │
│  Tailwind CSS, CSS custom properties        │
└─────────────┬───────────────────────────────┘
              │ Tauri IPC (invoke)
┌─────────────▼───────────────────────────────┐
│        Tauri v2 / Rust Backend              │
│  60 commands, ~5,268 LOC                    │
│  SQLite (WAL), file I/O, process mgmt      │
└─────────────┬───────────────────────────────┘
              │ HTTP (localhost:8765)
┌─────────────▼───────────────────────────────┐
│      Python FastAPI Sidecar (AI/ML)         │
│  18 endpoints, ~912 LOC                     │
│  BLIP-2, CLIP, YOLO, OCR, LanceDB          │
└─────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Tauri v2 (Rust) | Desktop app shell, file ops, DB |
| Frontend | React 19 + TypeScript 5 + Tailwind CSS 4 | UI |
| AI/ML | Python FastAPI sidecar | Captioning, CLIP, YOLO, OCR |
| Metadata DB | SQLite (rusqlite, WAL mode) | Photos, friends, settings |
| Text Search | Meilisearch (authenticated) | Fuzzy Japanese search |
| Vector DB | LanceDB | Image/text embeddings |

### Communication Patterns

- **Frontend → Rust**: Tauri `invoke()` IPC. All commands defined in `commands.rs`, called via `src/lib/api.ts`
- **Rust → Python**: HTTP via `reqwest` to `localhost:8765`. Wrapper in `sidecar.rs`
- **Frontend → Frontend**: Custom pub/sub toast system (`src/lib/toast.ts`), Tauri events for file watcher notifications

---

## Directory Structure

```
VRCMemory/
├── src/                        # React frontend
│   ├── components/             # 16 React components
│   ├── lib/
│   │   ├── api.ts              # Tauri IPC wrappers (single entry point)
│   │   ├── assets.ts           # File path → Tauri asset URL
│   │   ├── constants.ts        # App constants (version, timings, sizes)
│   │   ├── format.ts           # Date/time formatting (ja-JP)
│   │   └── toast.ts            # Toast notification pub/sub
│   ├── App.tsx                 # Root component, navigation, theme
│   └── styles.css              # Tailwind entry + CSS custom properties
├── src-tauri/                  # Rust backend
│   └── src/
│       ├── lib.rs              # App entry, plugin setup
│       ├── commands.rs         # Tauri IPC commands (60+)
│       ├── db.rs               # SQLite operations + tests
│       ├── models.rs           # Shared data types
│       ├── indexer.rs          # Photo scanning, thumbnail, session matching
│       ├── vrchat_log.rs       # VRChat log parser + tests
│       ├── watcher.rs          # File system watcher
│       ├── sidecar.rs          # Python sidecar HTTP client
│       ├── process_manager.rs  # Child process lifecycle (Meilisearch, Python)
│       ├── setup.rs            # Environment setup (Python, Meilisearch install)
│       └── error.rs            # Error types (AppError, AppResult)
├── python-sidecar/             # Python ML service
│   ├── main.py                 # FastAPI entry + lifespan
│   ├── api/routes/             # 7 route modules
│   │   ├── health.py           # Health check + loaded models
│   │   ├── caption.py          # BLIP-2 / LLaVA captioning
│   │   ├── embed.py            # CLIP + E5 embeddings
│   │   ├── detect.py           # YOLO person detection
│   │   ├── ocr.py              # manga-ocr + easyocr
│   │   ├── search.py           # Hybrid vector + text search
│   │   └── dedup.py            # Perceptual hash dedup
│   └── core/                   # ML model wrappers
│       ├── instances.py        # Thread-safe singletons
│       ├── caption.py          # CaptionGenerator (lazy load)
│       ├── embed.py            # EmbeddingEngine (lazy load)
│       ├── detect.py           # PersonDetector
│       ├── ocr.py              # WorldNameOCR
│       ├── vector_store.py     # LanceDB wrapper
│       ├── text_search.py      # Meilisearch wrapper
│       └── dedup.py            # Image hash computation
└── CLAUDE.md                   # This file
```

---

## Development Commands

```bash
# Frontend
pnpm dev                        # Vite dev server (port 1420)
pnpm build                      # TypeScript check + Vite build
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # ESLint (includes react-hooks rules)
pnpm check                      # typecheck + lint combined

# Rust backend
cd src-tauri && cargo check     # Compile check
cd src-tauri && cargo test      # 27 unit tests
cd src-tauri && cargo clippy -- -D warnings  # Lint (warnings as errors)

# Full app (requires display server on Linux)
pnpm tauri dev                  # Dev mode with hot reload
pnpm tauri build                # Production build

# Python sidecar
cd python-sidecar && pip install -r requirements.txt
cd python-sidecar && python main.py  # Start on port 8765
```

### Quality Gate (run before every commit)

```bash
pnpm typecheck && pnpm lint            # Frontend: 0 errors required
cd src-tauri && cargo clippy -- -D warnings && cargo test  # Rust: 0 warnings, all tests pass
```

---

## Coding Conventions

### TypeScript / React

**Component rules:**
- Functional components only, exported as `export default ComponentName`
- Props interfaces defined in same file, named `ComponentNameProps`
- One component per file, file named same as component (PascalCase)
- Use `@/` path alias for all imports from `src/`

**Hooks discipline:**
- `eslint-plugin-react-hooks` is enforced: `rules-of-hooks` = error, `exhaustive-deps` = warn
- Always list all dependencies in useEffect/useCallback/useMemo
- Use `useCallback` for functions passed as props or used in dependency arrays
- Use `useMemo` for expensive computations (sorting, filtering, grouping large arrays)
- Never define functions inside useEffect when they need to be referenced elsewhere

**State management:**
- Local `useState` for component-specific UI state
- Props drilling for shared state (currentView, theme, photoCount)
- Tauri events (`listen`/`emit`) for cross-component notifications (e.g., `photos-updated`)
- Custom pub/sub for toasts (`src/lib/toast.ts`)
- No external state library (Redux/Zustand) — keep it simple

**API calls:**
- All Tauri IPC calls go through `src/lib/api.ts` — never call `invoke()` directly in components
- Wrap async calls in try/catch, show error toasts on failure
- Use AbortController for cancellable requests (search debounce)
- Debounce user-triggered searches (300ms) and auto-save (800ms)

**Styling:**
- Tailwind CSS utility classes only (no CSS modules, no inline `style`)
- Theme colors via CSS custom properties: `var(--color-bg)`, `var(--color-text)`, etc.
- Use `[var(--color-*)]` bracket notation in Tailwind for theme-aware colors
- Support both dark and light themes via `data-theme` attribute
- When using Tailwind color variants (green, red, etc.), always specify both light and dark: `text-red-700 dark:text-red-300`

**Constants & utilities:**
- App-wide constants in `src/lib/constants.ts` (version, timings, sizes)
- Date formatting in `src/lib/format.ts` (all ja-JP locale)
- Never hardcode magic numbers — extract to constants.ts
- Never duplicate date formatting — use format.ts functions

**Accessibility:**
- Dialogs: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`
- Icon buttons: always include `aria-label`
- Focus management: auto-focus safe element (cancel button) on dialog open
- Keyboard: Escape to close dialogs, arrow keys for navigation

**Japanese UI:**
- All user-facing text in Japanese
- Use `Intl.DateTimeFormat` with `ja-JP` locale
- Font: "Noto Sans JP" primary, system fonts as fallback

### Rust

**Error handling:**
- All fallible functions return `AppResult<T>` (alias for `Result<T, AppError>`)
- `AppError` variants: Database, Io, Parse, Image, Validation, Lock, NotFound, Sidecar, Setup
- Serialized as `{ kind: string, message: string }` JSON for frontend error handling
- Never use `expect()` or `unwrap()` in production code paths — use `?` operator or `map_err`
- `unwrap()` is only acceptable in tests and where the invariant is guaranteed (with `// SAFETY:` comment)

**Input validation:**
- Validate all user-provided inputs in `commands.rs` before passing to `db.rs`
- Clamp pagination: `offset.max(0)`, `limit.clamp(1, 1000)`
- String validation: trim, check empty, enforce max length
- Settings: whitelist allowed keys (`ALLOWED_SETTINGS` constant)
- Paths: use component-based traversal check, require absolute paths, reject symlinks

**Database (SQLite):**
- All SQL in `db.rs`, never in `commands.rs`
- Parameter binding with `params![]` — never string interpolation
- WAL mode enabled with `busy_timeout=5000`
- Wrap multi-statement operations in `BEGIN`/`COMMIT` transactions
- Paginate large queries — never `get_photos(0, i64::MAX)`
- Schema changes: add new `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE` in `initialize_tables()`

**Performance:**
- Cache compiled Regex with `std::sync::OnceLock`
- Use `partition_point` (binary search) for sorted data matching
- Paginate batch operations (200 items per page for thumbnails, 500 for session matching)
- Use `spawn_blocking` for long-running CPU work to avoid blocking Tauri's main thread

**Tauri commands:**
- Defined in `commands.rs`, registered in `lib.rs`
- Return `AppResult<T>` for auto-serialization
- Log errors with `log::error!()` before returning

**Process management:**
- Hold Mutex lock through entire check-and-start to prevent race conditions
- Redirect child process stdout/stderr to log files (not `/dev/null`)
- Meilisearch: always start with `--master-key`

### Python Sidecar

**Route handlers:**
- Use `def` (not `async def`) for routes that do blocking ML inference — lets FastAPI run them in thread pool
- Use `async def` only for routes that are truly async (no blocking calls)
- Validate file upload size: `len(data) > MAX_SIZE` check before processing
- Validate batch request sizes with Pydantic `Field(max_length=N)`

**ML model lifecycle:**
- Lazy loading: constructor stores `None`, actual load on first `generate()`/`embed()`/etc.
- Thread-safe singletons via double-checked locking in `core/instances.py`
- Every model class must have a `close()` method that releases GPU memory
- `cleanup_all()` in `instances.py` calls all `close()` methods on shutdown

**Resource management:**
- Always `image.close()` PIL Images in try/finally blocks
- Call `torch.cuda.empty_cache()` in `close()` methods
- GPU/CPU fallback: check `torch.cuda.is_available()`, use `device` parameter

**Error handling:**
- Return per-item errors in batch endpoints (not HTTPException for whole batch)
- Log warnings for recoverable errors, raise HTTPException for unrecoverable
- Use Pydantic models for all request/response types with validation

**Pagination:**
- All search endpoints support `limit` and `offset` parameters
- Default limit: 20, max limit: 100

---

## Key Design Decisions

1. **Fully local** — No cloud services. All data stays on user's PC. Privacy first.
2. **Lazy ML loading** — Models loaded on first use, not app startup. Avoids 30-60s startup delay.
3. **Hybrid search** — Meilisearch (metadata/text) + LanceDB (CLIP vectors) merged with reciprocal rank fusion.
4. **VRChat log-based** — Extract world/player info from log files, not VRChat API (avoids ban risk).
5. **PNG primary** — VRChat screenshots are PNG format. Support JPEG for thumbnails.
6. **WAL mode SQLite** — Enables concurrent reads during background writes.
7. **Structured errors** — `{ kind, message }` JSON errors enable frontend error-type branching.
8. **Singleton ML models** — One instance per model via `core/instances.py`. Prevents GPU memory duplication.
9. **Adaptive polling** — Fast poll (2s) during indexing, slow poll (15s) when idle. Reduces unnecessary IPC.
10. **Authenticated Meilisearch** — Master key required even for local instance. Defense in depth.

---

## Database Schema (10 tables)

```sql
photos          -- id, filepath, filename, datetime, world_name, world_id, tags(JSON), caption, thumbnail_path, ocr_text, image_hash, created_at
world_visits    -- id, world_name, world_id, entered_at, left_at, players(JSON), instance_type, rating, notes  [UNIQUE(world_id, entered_at)]
friends         -- id, name, notes, created_at, updated_at
avatars         -- id, friend_id(FK), name, created_at
avatar_references -- id, avatar_id(FK), image_path
albums          -- id, name, description, created_at
album_photos    -- album_id(FK), photo_id(FK)  [composite PK]
settings        -- key(PK), value
watch_folders   -- id, path(UNIQUE), folder_type, enabled
encounters      -- id, friend_id(FK), world_visit_id(FK), met_at
```

**Indexes:** photos(datetime), photos(world_name), photos(image_hash), world_visits(entered_at), avatars(friend_id), encounters(friend_id), encounters(world_visit_id)

---

## VRChat File Paths (Windows)

```
Screenshots:  %UserProfile%\Pictures\VRChat\
Logs:         %LOCALAPPDATA%Low\VRChat\VRChat\
App data:     %APPDATA%\VRCMemory\
```

---

## Development Phases & Status

| Phase | Feature | Status |
|-------|---------|--------|
| 1 (MVP) | Photo folder monitoring, log parsing, metadata DB, grid UI | Done |
| 2 (AI Search) | BLIP-2 captions, CLIP vectors, Meilisearch, hybrid search | Done |
| 3 (Friends) | Friend profiles, avatar registration, playstyle analytics | Done |
| 4 (Polish) | OCR, auto-albums, dedup, performance optimization | Done |
| - (Quality) | Test coverage, CI hardening, schema migrations | In Progress |

---

## Known Gaps & Improvement Areas

### Testing
- **Frontend**: 0 test files. Need vitest + @testing-library/react setup.
- **Python**: 0 test files. Need pytest + mock ML models.
- **Rust**: 27 tests in db.rs, indexer.rs, vrchat_log.rs. commands.rs, sidecar.rs, process_manager.rs untested.
- **CI**: Runs typecheck, lint, clippy, cargo test. Missing frontend/Python test execution.

### Architecture
- **Schema migrations**: Only `CREATE TABLE IF NOT EXISTS`. No ALTER TABLE migration system.
- **State management**: Pure useState + props drilling. Consider extracting shared state to Context if complexity grows.
- **Custom hooks**: No extracted custom hooks yet. Candidates: `useDebounce`, `usePolling`, `usePagination`.

### Performance
- **Settings.tsx**: 783 lines, 20+ state variables. Candidate for splitting into sub-components.
- **Large photo collections**: Test and optimize for 10,000+ photos.

---

## CSS Theme Tokens

```css
/* Dark (default) */              /* Light */
--color-primary: #7c3aed          --color-primary: #7c3aed
--color-primary-hover: #6d28d9    --color-primary-hover: #6d28d9
--color-bg: #0f172a               --color-bg: #f8fafc
--color-surface: #1e293b          --color-surface: #ffffff
--color-surface-hover: #334155    --color-surface-hover: #f1f5f9
--color-text: #f8fafc             --color-text: #0f172a
--color-text-muted: #94a3b8      --color-text-muted: #64748b
--color-border: #334155           --color-border: #e2e8f0
```

---

## Constants Reference

```typescript
// src/lib/constants.ts
APP_VERSION = "v0.1.0"
PAGE_SIZE = 40                    // Photo grid pagination
DEBOUNCE_SEARCH_MS = 300          // Search input debounce
DEBOUNCE_NOTES_MS = 800           // Auto-save debounce
POLL_INDEXING_MS = 2000            // Status poll during indexing
POLL_IDLE_MS = 15000               // Status poll when idle
POLL_SIDECAR_MS = 30000            // Sidecar health check
BATCH_SIZE_DEFAULT = 20            // Default batch size for AI operations
```

```rust
// src-tauri/src/commands.rs
ALLOWED_SETTINGS = ["photo_folder", "log_folder", "theme", "batch_size", ...]
```

---

## Commit & Review Checklist

Before committing changes:

1. `pnpm typecheck` — 0 TypeScript errors
2. `pnpm lint` — 0 ESLint errors (warnings acceptable but review exhaustive-deps)
3. `cd src-tauri && cargo clippy -- -D warnings` — 0 Clippy warnings
4. `cd src-tauri && cargo test` — All 27+ tests pass
5. No `expect()`/`unwrap()` added to production Rust code
6. No `async def` with blocking calls in Python routes
7. All new useEffect/useCallback/useMemo have correct dependency arrays
8. New API calls go through `src/lib/api.ts`, not direct `invoke()`
9. Theme support: check both dark and light mode visuals
10. Japanese text: all user-facing strings in Japanese
