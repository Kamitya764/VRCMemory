# VRCMemory

**VRChatの思い出をAIで整理し、雑な言葉で見つけ出せるデスクトップアプリ**

写真管理 × ワールド履歴 × プレイスタイル分析を統合し、AI曖昧検索で「先月のあの青いワールド」「〇〇さんと行ったクラブっぽい所」のような自然言語で写真を見つけ出せます。

## Features

- AI写真管理 + 曖昧検索（CLIP + Meilisearch ハイブリッド検索）
- VRChatログ自動解析（ワールド名・プレイヤー・インスタンスタイプ）
- フレンドプロファイル + アバター登録
- ワールド訪問管理
- プレイスタイル分析
- 完全ローカル動作

## Tech Stack

- **Framework**: Tauri v2 (Rust)
- **Frontend**: React + TypeScript + Tailwind CSS
- **AI/ML**: Python FastAPI sidecar (BLIP-2, Japanese CLIP, YOLOv8, manga-ocr)
- **Database**: SQLite + LanceDB + Meilisearch

## Development

```bash
# Install dependencies
pnpm install

# Start development
pnpm tauri dev

# Build
pnpm tauri build
```

## Requirements

- Windows 10/11
- NVIDIA GPU recommended (CUDA, CPU fallback available)
- RAM: 16GB+
- Node.js 20+, Rust 1.77+, Python 3.10+

## License

MIT
