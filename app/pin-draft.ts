import type { MapLocation } from "./world-map";

export type PinDraft = { location: MapLocation; story: string; category: string };
const STORAGE_KEY = "blackfart-map-draft-v1";
const MAX_AGE = 24 * 60 * 60 * 1000;
const categories = new Set(["other", "after-fight", "oopsie", "friends-house", "eleven-second"]);

export function restorePinDraft(): PinDraft | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored);
    const { latitude, longitude } = value.location ?? {};
    if (!Number.isFinite(value.savedAt) || Date.now() - value.savedAt > MAX_AGE ||
        !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      location: { latitude: Math.round(latitude * 2) / 2, longitude: Math.round(longitude * 2) / 2 },
      story: typeof value.story === "string" ? value.story.slice(0, 3000) : "",
      category: categories.has(value.category) ? value.category : "other",
    };
  } catch { return null; }
}

export function persistPinDraft(draft: PinDraft): boolean {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, savedAt: Date.now() })); return true; }
  catch { return false; }
}

export function clearPinDraft() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* The on-screen draft can still be discarded. */ }
}
