# VRCMemory - Development Guide

## Project Overview

VRCMemory is a desktop application that manages VRChat photos, world visit history, and playstyle analytics using AI-powered fuzzy search. Built with Tauri v2 (Rust) + React + TypeScript frontend and a Python FastAPI sidecar for ML/AI processing.

**Concept**: "VRChatの思い出をAIで整理し、雑な言葉で見つけ出せるデスクトップアプリ"

## Architecture

```
Tauri (Rust) ─── React + TypeScript (Frontend)
     │ IPC
     │ HTTP (localhost:8765)
     ▼
Python FastAPI Sidecar (AI/ML)
```

### Key Components

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Tauri v2 (Rust) | Desktop app shell, file ops, DB |
| Frontend | React + TypeScript + Tailwind CSS | UI |
| AI/ML | Python FastAPI sidecar | Captioning, CLIP, YOLO, OCR |
| Metadata DB | SQLite (rusqlite) | Photos, friends, settings |
| Text Search | Meilisearch | Fuzzy Japanese search |
| Vector DB | LanceDB | Image/text embeddings |

## Directory Structure

```
VRCMemory/
├── src/                    # React frontend
│   ├── components/         # React components
│   ├── lib/               # Tauri API wrappers
│   └── styles.css         # Tailwind entry
├── src-tauri/             # Rust backend
│   └── src/
│       ├── lib.rs         # App entry, plugin setup
│       ├── commands.rs    # Tauri IPC commands
│       ├── db.rs          # SQLite operations
│       ├── models.rs      # Data types
│       ├── vrchat_log.rs  # VRChat log parser
│       ├── watcher.rs     # File system watcher
│       └── error.rs       # Error types
├── python-sidecar/        # Python ML service
│   ├── main.py            # FastAPI entry
│   ├── api/routes/        # API endpoints
│   └── core/              # ML model wrappers
└── CLAUDE.md              # This file
```

## Development Commands

```bash
# Frontend development
pnpm dev                    # Start Vite dev server
pnpm build                  # Build frontend
pnpm typecheck              # TypeScript type checking
pnpm lint                   # ESLint

# Rust backend
cd src-tauri && cargo check  # Check Rust compilation
cd src-tauri && cargo test   # Run Rust tests
cd src-tauri && cargo clippy # Lint Rust code

# Full app (requires display server)
pnpm tauri dev              # Run in dev mode
pnpm tauri build            # Production build

# Python sidecar
cd python-sidecar && pip install -r requirements.txt
cd python-sidecar && python main.py  # Start sidecar
```

## Coding Conventions

### TypeScript / React
- Functional components only
- Use `@/` path alias for imports from `src/`
- Props interfaces defined in same file as component
- Tailwind CSS for all styling (no CSS modules)
- Japanese text in UI (this is a Japanese-user-focused app)

### Rust
- Use `thiserror` for error types
- `AppResult<T>` return type for all fallible functions
- Tauri commands return `AppResult<T>` (auto-serialized)
- SQLite operations in `db.rs`, Tauri commands in `commands.rs`
- Log parsing regex in `vrchat_log.rs`

### Python
- Type hints on all function signatures
- Lazy model loading (load on first request, not startup)
- GPU with CPU fallback pattern
- Pydantic models for API request/response

## Key Design Decisions

1. **Fully local** - No cloud services, all data stays on user's PC
2. **Lazy ML loading** - Models loaded on first use, not app startup
3. **Hybrid search** - Meilisearch (metadata) + LanceDB (vectors) merged with reranking
4. **VRChat log-based** - Extract info from log files, not VRChat API (avoids ban risk)
5. **PNG primary** - VRChat screenshots are PNG format

## VRChat File Paths (Windows)

```
Screenshots:  %UserProfile%\Pictures\VRChat\
Logs:         %LOCALAPPDATA%Low\VRChat\VRChat\
App data:     %APPDATA%\VRCMemory\
```

## Development Phases

- **Phase 1 (MVP)**: Photo folder monitoring, log parsing, metadata DB, basic grid UI
- **Phase 2 (AI Search)**: BLIP-2 captions, CLIP vectors, Meilisearch, hybrid search
- **Phase 3 (Friends + Analytics)**: Friend profiles, avatar registration, playstyle dashboards
- **Phase 4 (Polish)**: OCR, auto-albums, dedup, performance optimization
