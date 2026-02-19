/** Shared date/time formatting utilities */

/**
 * Normalize VRChat-style timestamps (e.g., "2024.01.15 20:30:00")
 * to ISO-parseable format.
 */
function normalizeTimestamp(ts: string): string {
  return ts.replace(/\./g, "-").replace(" ", "T");
}

/**
 * Format a datetime string as a short date (e.g., "1月15日")
 */
export function formatDateShort(datetime: string): string {
  try {
    const date = new Date(datetime);
    return date.toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Format a datetime string as a full date (e.g., "2024年1月15日")
 */
export function formatDateFull(datetime: string): string {
  try {
    const date = new Date(datetime);
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Format a datetime string as date + time (e.g., "2024/01/15 20:30")
 */
export function formatDateTime(datetime: string): string {
  try {
    const date = new Date(datetime);
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Format a datetime string as short date + time (e.g., "1月15日 20:30")
 * Handles VRChat-style timestamps with dot separators.
 */
export function formatDateTimeShort(datetime: string): string {
  try {
    const date = new Date(normalizeTimestamp(datetime));
    return date.toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return datetime;
  }
}

/**
 * Format a datetime string as time only (e.g., "20:30")
 * Handles VRChat-style timestamps with dot separators.
 */
export function formatTime(datetime: string): string {
  try {
    const date = new Date(normalizeTimestamp(datetime));
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return datetime;
  }
}

/**
 * Format a datetime string as relative time (e.g., "3日前")
 */
export function formatRelativeTime(datetime: string): string {
  try {
    const date = new Date(datetime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return "今日";
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "今日";
    if (diffDays === 1) return "昨日";
    if (diffDays < 7) return `${diffDays}日前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}ヶ月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  } catch {
    return "";
  }
}

/**
 * Format a date string as relative label for recent, full date for older.
 * (e.g., "今日", "昨日", "3日前", "2024年1月15日")
 */
export function formatDateLabel(dateStr: string): string {
  try {
    const date = new Date(dateStr + "T00:00:00");
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) return "今日";
    if (diffDays === 1) return "昨日";
    if (diffDays < 7) return `${diffDays}日前`;

    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Calculate duration between two timestamps as human-readable string.
 * Handles VRChat-style timestamps with dot separators.
 */
export function calcDuration(start: string, end: string): string {
  try {
    const s = new Date(normalizeTimestamp(start));
    const e = new Date(normalizeTimestamp(end));
    const diffMin = Math.round((e.getTime() - s.getTime()) / 60000);
    if (diffMin < 60) return `${diffMin}分`;
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `${hours}時間${mins > 0 ? `${mins}分` : ""}`;
  } catch {
    return "";
  }
}

/**
 * Format a playtime duration in minutes as human-readable string.
 * (e.g., "45分", "2時間30分")
 */
export function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}時間${mins > 0 ? `${mins}分` : ""}`;
}
