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
