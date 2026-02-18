import { invoke } from "@tauri-apps/api/core";

// Photo types
export interface Photo {
  id: string;
  filepath: string;
  filename: string;
  datetime: string;
  world_name: string | null;
  world_id: string | null;
  tags: string[];
  caption: string | null;
  thumbnail_path: string | null;
}

export interface SearchResult {
  photos: Photo[];
  total: number;
}

export interface WorldVisit {
  id: string;
  world_name: string;
  world_id: string;
  entered_at: string;
  left_at: string | null;
  players: string[];
  instance_type: string;
  rating: number | null;
  notes: string | null;
}

export interface Friend {
  id: string;
  name: string;
  notes: string | null;
  avatars: Avatar[];
  created_at: string;
}

export interface Avatar {
  id: string;
  friend_id: string;
  name: string;
  reference_images: string[];
}

export interface AppSettings {
  photo_folder: string;
  log_folder: string;
  theme: "dark" | "light";
  gpu_enabled: boolean;
}

export interface PhotoStats {
  total: number;
  with_caption: number;
  with_world: number;
  with_thumbnail: number;
}

export interface Album {
  id: string;
  name: string;
  description: string | null;
  photo_count: number;
  cover_photo: string | null;
  created_at: string;
}

// Photo commands
export async function getPhotos(
  offset: number,
  limit: number,
): Promise<SearchResult> {
  return invoke("get_photos", { offset, limit });
}

export async function searchPhotos(query: string): Promise<SearchResult> {
  return invoke("search_photos", { query });
}

export async function getPhotoDetail(id: string): Promise<Photo | null> {
  return invoke("get_photo_detail", { id });
}

export async function deletePhoto(id: string): Promise<void> {
  return invoke("delete_photo", { id });
}

export async function deletePhotos(ids: string[]): Promise<number> {
  return invoke("delete_photos", { ids });
}

export async function getPhotoStats(): Promise<PhotoStats> {
  return invoke("get_photo_stats");
}

export async function updatePhotoTags(
  id: string,
  tags: string[],
): Promise<void> {
  return invoke("update_photo_tags", { id, tags });
}

// Album commands
export async function getAlbums(): Promise<Album[]> {
  return invoke("get_albums");
}

export async function createAlbum(
  name: string,
  description?: string,
): Promise<Album> {
  return invoke("create_album", { name, description: description ?? null });
}

export async function deleteAlbum(id: string): Promise<void> {
  return invoke("delete_album", { id });
}

export async function updateAlbum(
  id: string,
  name: string,
  description?: string,
): Promise<void> {
  return invoke("update_album", { id, name, description: description ?? null });
}

export async function addPhotosToAlbum(
  albumId: string,
  photoIds: string[],
): Promise<number> {
  return invoke("add_photos_to_album", { albumId, photoIds });
}

export async function removePhotosFromAlbum(
  albumId: string,
  photoIds: string[],
): Promise<number> {
  return invoke("remove_photos_from_album", { albumId, photoIds });
}

export async function getAlbumPhotos(
  albumId: string,
): Promise<SearchResult> {
  return invoke("get_album_photos", { albumId });
}

// World commands
export async function getWorldHistory(): Promise<WorldVisit[]> {
  return invoke("get_world_history");
}

export async function updateWorldRating(
  id: string,
  rating: number | null,
): Promise<void> {
  return invoke("update_world_rating", { id, rating });
}

export async function updateWorldNotes(
  id: string,
  notes: string | null,
): Promise<void> {
  return invoke("update_world_notes", { id, notes });
}

// Friend commands
export async function getFriends(): Promise<Friend[]> {
  return invoke("get_friends");
}

export async function addFriend(name: string): Promise<Friend> {
  return invoke("add_friend", { name });
}

export async function deleteFriend(id: string): Promise<void> {
  return invoke("delete_friend", { id });
}

export async function updateFriendNotes(
  id: string,
  notes: string | null,
): Promise<void> {
  return invoke("update_friend_notes", { id, notes });
}

export async function updateFriendName(
  id: string,
  name: string,
): Promise<void> {
  return invoke("update_friend_name", { id, name });
}

// Avatar commands
export async function addAvatar(
  friendId: string,
  name: string,
): Promise<Avatar> {
  return invoke("add_avatar", { friendId, name });
}

export async function deleteAvatar(id: string): Promise<void> {
  return invoke("delete_avatar", { id });
}

export async function addAvatarReference(
  avatarId: string,
  imagePath: string,
): Promise<string> {
  return invoke("add_avatar_reference", { avatarId, imagePath });
}

export async function deleteAvatarReference(id: string): Promise<void> {
  return invoke("delete_avatar_reference", { id });
}

// Encounter commands
export interface Encounter {
  id: string;
  friend_id: string;
  friend_name: string;
  world_name: string;
  world_id: string;
  world_visit_id: string;
  met_at: string;
}

export interface FriendStats {
  friend_id: string;
  friend_name: string;
  encounter_count: number;
  last_met: string | null;
  top_worlds: [string, number][];
}

export async function buildEncounters(): Promise<number> {
  return invoke("build_encounters");
}

export async function getFriendEncounters(
  friendId: string,
): Promise<Encounter[]> {
  return invoke("get_friend_encounters", { friendId });
}

export async function getFriendStats(
  friendId: string,
): Promise<FriendStats> {
  return invoke("get_friend_stats", { friendId });
}

// Settings commands
export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function updateSettings(
  settings: Partial<AppSettings>,
): Promise<void> {
  return invoke("update_settings", { settings });
}

// Indexing commands
export async function startIndexing(): Promise<void> {
  return invoke("start_indexing");
}

export async function getIndexingStatus(): Promise<{
  total: number;
  processed: number;
  is_running: boolean;
}> {
  return invoke("get_indexing_status");
}

export async function scanPhotos(folder: string): Promise<number> {
  return invoke("scan_photos", { folder });
}

export async function parseLogs(logFolder: string): Promise<number> {
  return invoke("parse_logs", { logFolder });
}

export async function generateThumbnails(): Promise<number> {
  return invoke("generate_thumbnails");
}

// Watcher commands
export async function startWatcher(): Promise<void> {
  return invoke("start_watcher");
}

// AI Sidecar commands
export interface SidecarStatus {
  available: boolean;
  gpu_available: boolean;
}

export async function checkSidecar(): Promise<boolean> {
  return invoke("check_sidecar");
}

export async function getSidecarStatus(): Promise<SidecarStatus> {
  return invoke("get_sidecar_status");
}

export async function generateCaptions(batchSize?: number): Promise<number> {
  return invoke("generate_captions", { batchSize: batchSize ?? null });
}

// Filter commands
export async function filterPhotos(
  worldName?: string,
  dateFrom?: string,
  dateTo?: string,
  offset = 0,
  limit = 100,
): Promise<SearchResult> {
  return invoke("filter_photos", {
    worldName: worldName ?? null,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    offset,
    limit,
  });
}

export async function getWorldNames(): Promise<string[]> {
  return invoke("get_world_names");
}

// Filtered world history for analytics
export async function getWorldHistoryFiltered(
  dateFrom?: string,
  dateTo?: string,
): Promise<WorldVisit[]> {
  return invoke("get_world_history_filtered", {
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
  });
}

// Data export/import
export interface ImportStats {
  friends_imported: number;
  world_visits_imported: number;
  albums_imported: number;
}

export async function exportDataToFile(path: string): Promise<void> {
  return invoke("export_data_to_file", { path });
}

export async function importDataFromFile(path: string): Promise<ImportStats> {
  return invoke("import_data_from_file", { path });
}

// AI Search commands (Phase 2)

export async function aiSearch(
  query: string,
  limit?: number,
): Promise<SearchResult> {
  return invoke("ai_search", { query, limit: limit ?? null });
}

export async function indexPhotosVectors(
  batchSize?: number,
): Promise<{ indexed: number; skipped: number }> {
  return invoke("index_photos_vectors", { batchSize: batchSize ?? null });
}

export async function indexPhotosText(
  batchSize?: number,
): Promise<{ indexed: number }> {
  return invoke("index_photos_text", { batchSize: batchSize ?? null });
}

export interface SearchIndexStatus {
  total_vectors: number;
  total_documents: number;
  meilisearch_available: boolean;
}

export async function getSearchStatus(): Promise<SearchIndexStatus> {
  return invoke("get_search_status");
}
