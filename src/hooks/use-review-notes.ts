"use client";
import { useEffect, useState } from "react";
import { validDate } from "@/lib/dates";
import { decodeNote, loadNotes, NOTE_PREFIX, saveNote, type ReviewNote } from "@/lib/review-notes";

export function useReviewNotes() {
  const [notes, setNotes] = useState<Record<string, ReviewNote>>({});
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");
  const [failedDates, setFailedDates] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const loaded = loadNotes(window.localStorage);
      setNotes(loaded.notes);
      if (loaded.malformed) setError("部分本地笔记无法读取，原始记录未被覆盖。");
    } catch { setError("浏览器笔记存储无法读取；输入内容可能无法保存。"); }
    setHydrated(true);
    function onStorage(event: StorageEvent) {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === null) { setNotes({}); return; }
      if (!event.key.startsWith(NOTE_PREFIX)) return;
      const date = event.key.slice(NOTE_PREFIX.length);
      const note = decodeNote(event.newValue, date);
      if (event.newValue && !note) { setError("其他页面的笔记格式异常，当前内容保持不变。"); return; }
      setNotes(previous => { const next = { ...previous }; if (note) next[date] = note; else delete next[date]; return next; });
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  function update(date: string, text: string) {
    if (!hydrated || !validDate(date)) return;
    // Persist synchronously by the explicit date. Rapid date switching never
    // assigns a delayed save to the newly selected day's note.
    const draft: ReviewNote = { version: 1, date, text, updatedAt: new Date().toISOString() };
    setNotes(previous => ({ ...previous, [date]: draft }));
    try {
      saveNote(window.localStorage, date, text);
      setFailedDates(previous => ({ ...previous, [date]: false })); setError("");
    } catch {
      setFailedDates(previous => ({ ...previous, [date]: true }));
      setError("笔记未能保存，当前输入仍保留在页面中。请检查浏览器存储，关闭页面前请复制备份。");
    }
  }
  const markedDates = Object.keys(notes).filter(date => notes[date].text.trim().length > 0);
  return { notes, hydrated, error, failedDates, update, markedDates };
}
