import { preferencesSchema, type Preferences } from "./domain";
export const PREFERENCES_KEY = "panhou.preferences.v1";
export function decodePreferences(raw: string | null): Preferences | null {
  if (!raw) return null;
  try { const result = preferencesSchema.safeParse(JSON.parse(raw)); return result.success ? result.data : null; }
  catch { return null; }
}
export interface PreferenceStore { read(): Preferences | null; write(value: Preferences): void }
export const browserPreferenceStore: PreferenceStore = {
  read() { return decodePreferences(window.localStorage.getItem(PREFERENCES_KEY)); },
  write(value) { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferencesSchema.parse(value))); },
};
