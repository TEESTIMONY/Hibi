// Keep the original keys so existing browser data survives the refactor.
export const DATA_KEY = 'daylight-v1';
export const THEME_KEY = 'daylight-theme';

export function loadPlanner(storage, fallback) {
  try {
    const saved = JSON.parse(storage.getItem(DATA_KEY));
    if (!Array.isArray(saved?.tasks) || !Array.isArray(saved?.projects)) {
      return structuredClone(fallback);
    }
    return saved;
  } catch {
    return structuredClone(fallback);
  }
}

export function savePlanner(storage, { tasks, projects }) {
  storage.setItem(DATA_KEY, JSON.stringify({ tasks, projects }));
}

export function loadTheme(storage) {
  try { return storage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function saveTheme(storage, theme) {
  storage.setItem(THEME_KEY, theme);
}
