"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { browserPreferenceStore, PREFERENCES_KEY } from "@/lib/preferences";
import { preferencesSchema, type Preferences } from "@/lib/domain";

interface Context { preferences: Preferences | null; hydrated: boolean; error: string | null; save: (value: Preferences) => boolean }
const PreferencesContext = createContext<Context | null>(null);
export function Providers({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    function read() { try { setPreferences(browserPreferenceStore.read()); } catch { setError("浏览器存储不可用，配置可能无法保存。请检查隐私设置。"); } }
    read(); setHydrated(true);
    const handler = (e: StorageEvent) => { if (e.key === PREFERENCES_KEY) read(); };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  function save(value: Preferences) {
    try { const valid = preferencesSchema.parse(value); browserPreferenceStore.write(valid); setPreferences(valid); setError(null); return true; }
    catch { setError("配置保存失败，当前修改尚未持久化。请检查浏览器存储或输入内容。"); return false; }
  }
  return <PreferencesContext.Provider value={{ preferences, hydrated, error, save }}>{children}</PreferencesContext.Provider>;
}
export function usePreferences() { const context = useContext(PreferencesContext); if (!context) throw new Error("Preferences provider required"); return context; }
