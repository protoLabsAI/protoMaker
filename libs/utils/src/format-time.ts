/**
 * format-time.ts — Shared time formatting utilities
 *
 * Canonical implementations for duration, timestamp, and elapsed time
 * formatting used across UI and libs.
 */

/**
 * Formats a duration given in milliseconds into a human-readable string.
 *
 * Examples:
 *   500     → "500ms"
 *   1500    → "1s"
 *   90000   → "1m 30s"
 *   3700000 → "1h 1m"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Formats a Date (or ISO string / timestamp number) into a short display string.
 *
 * - If the date is today, returns a time string like "02:30 PM".
 * - Otherwise, returns a short date like "Jan 5".
 */
export function formatTimestamp(date: Date | string | number): string {
  if (!date) return 'N/A';

  try {
    const d = new Date(date as string | number);
    if (isNaN(d.getTime())) return 'Invalid';

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    if (isToday) {
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  } catch {
    return 'Invalid';
  }
}

/**
 * Formats an elapsed duration given in milliseconds into a compact string.
 *
 * Examples:
 *   500   → "500ms"
 *   5000  → "5s"
 *   90000 → "1m 30s"
 *   3700000 → "1h 1m"
 */
export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
