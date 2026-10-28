import { validDate } from "./dates";
export const NOTE_PREFIX = "panhou.review-note.v1.";
export const NOTE_MAX_LENGTH = 10000;
export interface ReviewNote { version: 1; date: string; text: string; updatedAt: string }
export interface NoteStorage { length: number; key(index: number): string | null; getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export function decodeNote(raw: string | null, date: string): ReviewNote | null {
  if (!raw || !validDate(date)) return null;
  try {
    const value = JSON.parse(raw);
    return value?.version === 1 && value.date === date && typeof value.text === "string" && value.text.length <= NOTE_MAX_LENGTH && typeof value.updatedAt === "string" ? value as ReviewNote : null;
  } catch { return null; }
}
export function loadNotes(storage: NoteStorage) {
  const notes: Record<string, ReviewNote> = {};
  let malformed = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(NOTE_PREFIX)) continue;
    const note = decodeNote(storage.getItem(key), key.slice(NOTE_PREFIX.length));
    if (note) notes[note.date] = note; else malformed++;
  }
  return { notes, malformed };
}
export function saveNote(storage: NoteStorage, date: string, text: string): ReviewNote {
  if (!validDate(date) || text.length > NOTE_MAX_LENGTH) throw new Error("笔记日期或长度无效");
  const note: ReviewNote = { version: 1, date, text, updatedAt: new Date().toISOString() };
  if (text.trim()) storage.setItem(NOTE_PREFIX + date, JSON.stringify(note));
  else storage.removeItem(NOTE_PREFIX + date);
  return note;
}
