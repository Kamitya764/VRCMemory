import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Convert a local file path to a URL that can be used in <img> src.
 * Uses Tauri's asset protocol to serve local files securely.
 */
export function toAssetUrl(filepath: string): string {
  try {
    return convertFileSrc(filepath);
  } catch {
    // Fallback for dev mode outside Tauri
    return filepath;
  }
}
