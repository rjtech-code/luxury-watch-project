import { db } from '../db/client.js';
import { DEFAULT_SETTINGS } from '../db/defaults.js';

let cache = null;
let cachedAt = 0;
const TTL_MS = 15_000;

/** All site settings as one object, with defaults filled in for any missing key. */
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await db.siteSettings.find();
  const merged = { ...DEFAULT_SETTINGS };
  for (const r of rows) merged[r.key] = r.value;
  cache = merged;
  cachedAt = Date.now();
  return merged;
}

export const clearSettingsCache = () => {
  cache = null;
};
