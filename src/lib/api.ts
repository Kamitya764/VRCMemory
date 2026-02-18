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

// World commands
export async function getWorldHistory(): Promise<WorldVisit[]> {
  return invoke("get_world_history");
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
