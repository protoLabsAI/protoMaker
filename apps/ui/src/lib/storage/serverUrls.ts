const STORAGE_KEY = 'recentServerUrls';
const MAX_RECENT = 10;

export function getRecentServerUrls(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentServerUrl(url: string): void {
  try {
    const existing = getRecentServerUrls();
    const deduped = [url, ...existing.filter((u) => u !== url)].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  } catch {
    // Gracefully handle localStorage quota exceeded
  }
}

export function clearRecentServerUrls(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
