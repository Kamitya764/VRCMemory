# VRCMemory 辛口コードレビュー

## Context

VRCMemory のコードベース全体（フロントエンド・Rust バックエンド・Python サイドカー）を精査し、アーキテクチャ・セキュリティ・パフォーマンス・コード品質の観点から問題を洗い出した。コードは「動く」状態にはあるが、プロダクション品質には程遠い。以下、深刻度順に全指摘事項を列挙する。

---

## 総合評価

| レイヤー | 致命的 | 高 | 中 | 低 | 合計 |
|----------|--------|-----|-----|-----|------|
| Rust バックエンド | 0 | 8 | 19 | 20 | 47 |
| React フロントエンド | 0 | 6 | 15 | 24 | 45 |
| Python サイドカー | 0 | 5 | 8 | 7 | 20 |
| **合計** | **0** | **19** | **42** | **51** | **112** |

---

## 1. アーキテクチャの根本的問題

### 1.1 Python サイドカー: async def なのに同期ブロッキング [HIGH]

**全ルートハンドラが `async def` で定義されているが、ML 推論は全て同期処理。** FastAPI のイベントループが 5〜30 秒間完全にブロックされ、`/health` すら応答しなくなる。

- `caption.py:38` — `generator.generate(image_data)` BLIP-2 推論 5〜30秒ブロック
- `embed.py:35` — `engine.embed_texts(request.texts)` 1〜3秒ブロック
- `embed.py:46` — `engine.embed_image(image_data)` 1〜2秒ブロック
- `detect.py:39` — `detector.detect(image_data)` 1〜5秒ブロック
- `ocr.py:45` — `ocr_engine.read_world_name(image_data)` 2〜5秒ブロック
- `search.py:137` — `embed.embed_image(image_data)` インデックスバッチ内ループで1枚あたり1〜2秒

**修正:** 全ルートを `def`（非 async）に変更し FastAPI のスレッドプール実行に任せるか、`await asyncio.to_thread()` でラップする。

### 1.2 Rust: 同期 Tauri コマンドが Mutex を長時間保持 [HIGH]

`commands.rs` の複数コマンドが DB Mutex を取得したまま大量の I/O を実行。数千枚のスキャン中、UI 全体がフリーズする。

- `scan_photos` (line 117-145) — 全写真ファイルをイテレートしながら Mutex 保持
- `start_indexing` (line 184-234) — 写真スキャン + ログパース全体で Mutex 保持
- `generate_thumbnails` (line 451-464) — 全画像のリサイズ中 Mutex 保持
- `build_encounters` (line 424-427) — O(friends × visits) のネストループ中 Mutex 保持

**修正:** `tokio::task::spawn_blocking` で非同期化し、進捗イベントを emit する。

### 1.3 Rust: DB が単一 `std::sync::Mutex` [HIGH]

`DbState` は `Mutex<Database>` で、読み取りすら直列化される。SQLite は WAL モードで並行読み取りをサポートするが、Mutex がそれを殺している。

**修正:** `RwLock` への変更、または WAL モード有効化 + コネクションプール導入。

### 1.4 Python: EmbeddingEngine が2箇所で別々にインスタンス化 [HIGH]

- `embed.py:15` — `_engine = EmbeddingEngine()` (Instance 1)
- `search.py:31` — `_embed = EmbeddingEngine()` (Instance 2)

E5 + CLIP で1インスタンスあたり ~1.9GB の GPU メモリ。**2つで ~3.8GB が無駄に消費される。**

**修正:** シングルトンを1箇所に統合（`functools.lru_cache` or `app.state`）。

### 1.5 Python: lifespan が空 — リソース解放なし [HIGH]

`main.py:15-21` の lifespan は `yield` するだけ。GPU メモリ・LanceDB 接続・Meilisearch 接続のクリーンアップが一切ない。

---

## 2. セキュリティ

### 2.1 Python: ファイルアップロードのサイズ制限なし [HIGH]

全 `UploadFile` エンドポイントが `await file.read()` を無制限で実行。1GB のバイナリを送り込めば OOM クラッシュ。

- `caption.py:38`, `embed.py:44`, `detect.py:37`, `ocr.py:44`, `search.py:218`

### 2.2 Python: バッチリクエストのサイズ制限なし [HIGH]

`BatchCaptionRequest.image_paths: list[str]` に `max_length` がない。100万パスを送りつけるだけで DoS 可能。

- `caption.py:25`, `embed.py:50`, `ocr.py:27`, `dedup.py:21`, `search.py:56-59`

### 2.3 Rust: パストラバーサル検査が不十分 [MEDIUM-HIGH]

`commands.rs:598-607` の `validate_export_path` は `path.contains("..")` のみ。Windows のバックスラッシュ、URL エンコード、シンボリックリンク等を考慮していない。さらに `scan_photos` や `parse_logs` は任意のファイルパスを受け入れる。

### 2.4 Rust: Meilisearch が認証なしで起動 [MEDIUM]

`process_manager.rs:53-63` — `--env development` でマスターキーなし。同一マシン上の他プロセスからインデックスデータに自由にアクセス可能。

### 2.5 Rust: FS プラグイン権限がスコープ制限なし [MEDIUM]

`capabilities/default.json` — `fs:allow-read`, `fs:allow-write`, `fs:allow-mkdir` にスコープ指定がなく、フロントエンド JS からユーザーのアクセス可能なファイル全てを読み書きできる。

### 2.6 Rust: 入力バリデーションの欠如 [MEDIUM]

- `get_photos(offset, limit)` — `limit = i64::MAX` を渡せば全写真ロード
- `update_world_rating(id, rating)` — rating の範囲チェックなし
- `update_settings` — 任意のキーを設定テーブルに書き込み可能（ホワイトリストなし）
- `add_friend(name)` — 空文字・超長文のチェックなし

---

## 3. データ整合性

### 3.1 Rust: ワールド訪問の重複挿入 [MEDIUM-HIGH]

`commands.rs:148-180` の `parse_logs` は毎回新規 UUID を生成して `INSERT OR IGNORE` するが、UUID は常にユニークなので IGNORE が発動しない。**ログを再パースするたびに全訪問が重複挿入される。**

**修正:** `(world_id, entered_at)` に UNIQUE 制約を追加。

### 3.2 Rust: バッチ操作にトランザクションなし [MEDIUM]

`db.rs` の以下の操作が明示的トランザクションなし:
- `import_data` — 複数テーブルへの挿入
- `build_encounters` — 数百行の挿入
- `delete_photos` — 1件ずつ DELETE
- `parse_logs` のループ全体

SQLite のオートコミットで各ステートメントが個別コミットされ、**パフォーマンスが数十〜数百倍低下**する。

### 3.3 Rust: SQLite WAL モード未使用 [MEDIUM]

デフォルトの DELETE ジャーナルモード。WAL にすれば並行読み取りが可能になり、ファイルウォッチャーのポーリングとインデックス書き込みの競合も解消される。

### 3.4 Rust: スキーマ移行の仕組みがない [MEDIUM]

`initialize_tables` は `CREATE TABLE IF NOT EXISTS` のみ。アプリ更新時のカラム追加・変更に対応する移行メカニズムがない。

---

## 4. パフォーマンス

### 4.1 Rust: `generate_thumbnails_batch` が全写真をメモリにロード [HIGH]

`indexer.rs:243` — `db.get_photos(0, i64::MAX)` で全レコードを一括取得。万単位の写真でメモリ爆発。

### 4.2 Rust: O(n×m) の写真-セッションマッチング [MEDIUM]

`indexer.rs:278-305` — 全写真 × 全セッションのブルートフォース比較。10,000写真 × 5,000セッション = 5,000万回。セッションをソートして二分探索すべき。

### 4.3 Rust: O(friends×visits×SQL) のエンカウンター構築 [MEDIUM]

`db.rs:741-785` — 各訪問 × 各フレンドで SQL EXISTS を実行。100フレンド × 5,000訪問 = 50万クエリ。単一の INSERT...SELECT に書き換えるべき。

### 4.4 Rust: Regex が毎回コンパイル [MEDIUM]

`vrchat_log.rs:141` — `parse_room_info` 内で `Regex::new()` を毎回呼ぶ。`OnceLock` や `lazy_static!` で1回だけコンパイルすべき。

### 4.5 React: ソート・フィルタが毎レンダーで再計算 [HIGH]

`PhotoGrid.tsx:112-137` — IIFE で `sortedPhotos` を計算。`useMemo` なし。数千枚の写真で毎レンダー再ソート。

同様に:
- `PhotoGrid.tsx:139` — `visiblePhotos = sortedPhotos.slice(0, visibleCount)` 毎レンダー新配列
- `PhotoGrid.tsx:452` — `groupPhotosByDate(visiblePhotos)` を JSX 内で毎回呼ぶ
- `PhotoGrid.tsx:538` — `visiblePhotos.map(p => p.id)` を props に毎レンダー渡す

### 4.6 React: StatusBar が無条件で2秒ポーリング [MEDIUM]

`StatusBar.tsx:24-39` — インデックス実行中でなくても2秒間隔で `getIndexingStatus` を呼び続ける。不要な IPC トラフィック。

### 4.7 Rust: `delete_photos` が1件ずつ DELETE [LOW]

`db.rs:604-612` — `DELETE FROM photos WHERE id IN (...)` で一括削除すべき。

---

## 5. React フロントエンド

### 5.1 useEffect 依存配列違反（複数箇所） [HIGH]

`eslint-plugin-react-hooks` が未導入のため、以下が検出されない:

- `AlbumView.tsx:24-26` — `loadAlbums` が依存配列にない
- `FriendManager.tsx:26-28` — `loadFriends` が依存配列にない
- `Analytics.tsx:43-45` — `loadStats` が依存配列にない
- `PhotoGrid.tsx:142-157` — `handleLoadMore` が IntersectionObserver コールバック内で使われるが依存配列にない → **stale closure**

### 5.2 未ハンドルの Promise rejection [HIGH]

`SetupWizard.tsx:102-121` — `handleSetPhotoFolder` と `handleSetLogFolder` で `await updateSettings()` が try/catch なし。

### 5.3 デバウンスのクリーンアップ漏れ [MEDIUM]

`FriendManager.tsx:511-537` — `NotesArea` のデバウンスタイマーがアンマウント時にクリアされない。アンマウント後に `onSave` が呼ばれる可能性。

### 5.4 検索リクエストのレースコンディション [MEDIUM]

`PhotoGrid.tsx:52-99` — デバウンス付き検索でリクエストが並行発行されるが、AbortController がなく、古いレスポンスが新しいレスポンスを上書きする可能性。

### 5.5 アクセシビリティの欠如 [MEDIUM]

- `ConfirmDialog.tsx` — `aria-modal`, `aria-labelledby`, フォーカストラップなし
- SVG アイコンボタン全般 — `aria-label` なし
- 写真選択チェックボックス — `<div>` で実装、`role="checkbox"` なし
- 日付入力 — `<label>` なし
- 検索バー — `<label>` なし
- 星評価 — `aria-label`, `aria-pressed` なし

### 5.6 CSS/テーマの問題 [MEDIUM]

- `ToastContainer.tsx:39-43` — ハードコードの `text-green-300`, `text-red-300` はライトモードで見えない
- 全コンポーネント — `var(--color-*)` を Tailwind テーマに登録せず `[var(--color-*)]` を数百箇所で直接記述。タイポがビルド時に検出されない

### 5.7 コード重複 [LOW]

- `formatDate` が `FriendManager.tsx`, `PhotoGrid.tsx`, `PhotoDetail.tsx`, `WorldHistory.tsx` 等に散在（計11個の日時フォーマット関数）
- ローディング表示パターン `if (loading) return <div>読み込み中...</div>` が8コンポーネントで重複

### 5.8 マジックナンバー散在 [LOW]

- バージョン文字列 `"v0.1.0"` が `StatusBar.tsx:75` と `Settings.tsx:774` で二重管理
- バッチサイズ `20, 50, 100` が `Settings.tsx` の5箇所にハードコード
- デバウンス `300ms`, `800ms`, ポーリング `2000ms`, `30000ms` が定数化されていない

### 5.9 巨大コンポーネント [MEDIUM]

`Settings.tsx` が 783 行・20+ ステート変数。10セクションを1ファイルに詰め込んでいる。分割すべき。

---

## 6. Rust バックエンド

### 6.1 expect()/unwrap() によるパニックリスク [HIGH]

プロダクションコードパスに `expect()` が複数:

- `lib.rs:44` — `expect("failed to get app data dir")`
- `lib.rs:47` — `Database::new().expect("failed to initialize database")` — DB 破損でクラッシュ
- `setup.rs:587-596` — `expect("parent of src-tauri")`, `expect("resource dir")` — バンドル不完全時にクラッシュ
- `db.rs:292` — `friends.last_mut().unwrap()` — コンテキスト的に安全だが `expect("just pushed")` にすべき

### 6.2 ProcessManager のチェック-アンド-アクト競合 [MEDIUM]

`process_manager.rs:32-73` — `start_meilisearch()` で Mutex のロック→チェック→解放→再ロック→格納。2つの同時呼び出しで Meilisearch が二重起動する。

### 6.3 エラー型の情報損失 [MEDIUM]

`error.rs:27-34` — `AppError` が `serialize_str` で平文字列化。フロントエンドでエラー種別による分岐ができない。

### 6.4 `AppError::Parse` の過負荷 [LOW]

画像処理エラー・glob エラー・JSON シリアライズエラー・ファイル書き込みエラー・パスバリデーションエラー・zip 展開エラーが全て `Parse` バリアント。デバッグ困難。

### 6.5 子プロセスの stdout/stderr が `/dev/null` [LOW]

`process_manager.rs` — Meilisearch・Python サイドカーの出力が `Stdio::null()`。起動エラーやクラッシュの診断情報がゼロ。ログファイルにリダイレクトすべき。

### 6.6 未使用依存: `dirs` クレート [LOW]

`Cargo.toml` に `dirs = "6"` があるが、Tauri の `app.path()` を使用しており一切参照されていない。

### 6.7 テストカバレッジの偏り [INFO]

`db.rs`, `indexer.rs`, `vrchat_log.rs` にはユニットテストあり（良い）。しかし `commands.rs`, `process_manager.rs`, `setup.rs`, `sidecar.rs` はテストゼロ。

---

## 7. Python サイドカー

### 7.1 遅延初期化のレースコンディション [MEDIUM]

全ルートファイルのシングルトン取得が `if _x is None: _x = X()` パターン。同時リクエストでモデル二重ロード → GPU メモリ浪費。

- `caption.py:11-18`, `embed.py:11-18`, `detect.py:10-17`, `ocr.py:11-18`, `search.py:17-44`

### 7.2 バッチエラーハンドリングの不統一 [MEDIUM]

- `caption.py` batch → 1件失敗で全体 HTTPException（最悪）
- `search.py` index/batch → `skipped` カウントのみ、失敗理由不明（悪い）
- `ocr.py` batch → per-item エラー報告（良い）
- `dedup.py` hash batch → per-item エラー報告（良い）

### 7.3 CaptionGenerator が即座にモデルロード [MEDIUM]

`caption.py:20-32` — コンストラクタで BLIP-2 を即ロード（30〜60秒）。`EmbeddingEngine` の遅延ロードパターンと不統一。

### 7.4 ML モデルのアンロード手段なし [MEDIUM]

`CaptionGenerator`, `EmbeddingEngine`, `PersonDetector`, `WorldNameOCR` に `close()` メソッドがない。一度ロードした GPU メモリを解放する手段がない。

### 7.5 PIL Image の明示的クローズなし [LOW]

`caption.py:44`, `embed.py:93`, `detect.py:37`, `ocr.py:52,103` — `Image.open()` した画像を close しない。バッチ処理でメモリプレッシャー。

### 7.6 検索結果にページネーション未対応 [LOW]

`limit` はあるが `offset` がない。次ページの取得手段なし。

### 7.7 /health が models_loaded を常に空配列で返す [LOW]

`health.py:18` — `"models_loaded": []` がハードコード。実際のロード状態を反映していない。

### 7.8 テスト・CI 一切なし [INFO]

Python コードにテストファイルが1つもない。requirements.txt にテストライブラリもない。

---

## 8. フロントエンド設定・ツール

### 8.1 eslint-plugin-react-hooks 未導入 [HIGH]

`eslint.config.js` に React Hooks ルールがない。セクション5.1の依存配列違反が全て検出されない。

### 8.2 フロントエンドテスト基盤なし [INFO]

`package.json` にテストスクリプトなし。vitest, testing-library 等の導入なし。

---

## 9. 最優先修正リスト（TOP 10）

| # | 問題 | 影響 | 修正コスト |
|---|------|------|-----------|
| 1 | Python: async def 内の同期ブロッキング | サーバー全体フリーズ | 低（`def` に変更するだけ） |
| 2 | Rust: SQLite トランザクション未使用 | パフォーマンス数十倍低下 + データ不整合 | 低 |
| 3 | Rust: 同期コマンドの Mutex 長時間保持 | UI フリーズ | 中 |
| 4 | Python: EmbeddingEngine 二重インスタンス | GPU メモリ ~2GB 浪費 | 低 |
| 5 | Rust: ワールド訪問の重複挿入 | データ膨張 | 低 |
| 6 | React: useMemo 不足 | 不要な再レンダー・再計算 | 低 |
| 7 | Python: ファイルアップロードサイズ制限なし | OOM DoS | 低 |
| 8 | React: eslint-plugin-react-hooks 導入 | stale closure バグ防止 | 低 |
| 9 | Rust: WAL モード有効化 | 並行読み取り性能向上 | 極低 |
| 10 | Rust: FS プラグインスコープ制限 | セキュリティ強化 | 低 |

---

## 10. 良い点

公平を期して、良くできている点も挙げる:

- **SQL インジェクション対策**: `db.rs` の全クエリが `params![]` でパラメータバインディング。文字列補間なし
- **DB テスト**: `db.rs` に包括的なユニットテスト
- **エラー型**: `thiserror` + `AppResult<T>` の一貫した使用
- **プロセスクリーンアップ**: `Drop` + `on_window_event` での子プロセス終了
- **遅延モデルロード（部分的）**: `EmbeddingEngine` の `_load_text_model` / `_load_image_model` パターン
- **GPU/CPU フォールバック**: `torch.cuda.is_available()` による自動切り替え
- **タイムスタンプ正規化**: VRChat 独自フォーマットへの対応
- **N+1 クエリ回避**: `get_friends` で JOIN + Rust 側グルーピング
