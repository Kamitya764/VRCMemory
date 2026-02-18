/** Shared date/time formatting utilities */

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
 * Format a datetime string as relative time (e.g., "3日前")
 */
export function formatRelativeTime(datetime: string): string {
  try {
    const date = new Date(datetime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
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
