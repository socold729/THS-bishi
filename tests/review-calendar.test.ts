import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarCells, shiftMonth } from "../src/lib/review-calendar";
import { decodeNote, loadNotes, NOTE_MAX_LENGTH, NOTE_PREFIX, saveNote, type NoteStorage } from "../src/lib/review-notes";
import { ladderRows } from "../src/lib/ladder";

class MemoryStorage implements NoteStorage {
  entries = new Map<string, string>();
  get length() { return this.entries.size; }
  key(index: number) { return [...this.entries.keys()][index] ?? null; }
  getItem(key: string) { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string) { this.entries.set(key, value); }
  removeItem(key: string) { this.entries.delete(key); }
}
test("October 2026 starts on Thursday in a Monday-first calendar", () => {
  const cells = calendarCells("2026-10");
  assert.equal(cells.length, 35); assert.deepEqual(cells.slice(0, 4), [null, null, null, "2026-10-01"]);
  assert.equal(cells.filter(Boolean).length, 31); assert.equal(cells.at(-1), null);
});
test("calendar handles leap and non-leap February without invented dates", () => {
  assert.equal(calendarCells("2028-02").filter(Boolean).length, 29);
  assert.equal(calendarCells("2026-02").filter(Boolean).length, 28);
});
test("month navigation crosses year boundaries correctly", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01"); assert.equal(shiftMonth("2026-01", -1), "2025-12");
});
test("invalid months are rejected", () => assert.throws(() => calendarCells("2026-13")));
test("daily notes remain isolated when rapidly alternating dates", () => {
  const storage = new MemoryStorage();
  saveNote(storage, "2026-10-27", "测试：27日第一稿"); saveNote(storage, "2026-10-26", "测试：26日笔记"); saveNote(storage, "2026-10-27", "测试：27日修订");
  const { notes } = loadNotes(storage);
  assert.equal(notes["2026-10-26"].text, "测试：26日笔记"); assert.equal(notes["2026-10-27"].text, "测试：27日修订");
});
test("clearing one day's note preserves every other date", () => {
  const storage = new MemoryStorage(); saveNote(storage, "2026-10-26", "测试：保留"); saveNote(storage, "2026-10-27", "测试：清除"); saveNote(storage, "2026-10-27", " \n ");
  assert.deepEqual(Object.keys(loadNotes(storage).notes), ["2026-10-26"]);
});
test("malformed notes are reported without overwriting their stored bytes", () => {
  const storage = new MemoryStorage(); storage.setItem(NOTE_PREFIX + "2026-10-27", "{broken");
  assert.equal(loadNotes(storage).malformed, 1); assert.equal(storage.getItem(NOTE_PREFIX + "2026-10-27"), "{broken");
});
test("a mismatched note date cannot be shown under a different day", () => {
  const note = JSON.stringify({ version: 1, date: "2026-10-26", text: "测试笔记", updatedAt: "2026-10-27" });
  assert.equal(decodeNote(note, "2026-10-27"), null);
});
test("invalid dates and excessive note lengths cannot be persisted", () => {
  const storage = new MemoryStorage(); assert.throws(() => saveNote(storage, "2026-02-30", "测试")); assert.throws(() => saveNote(storage, "2026-10-27", "x".repeat(NOTE_MAX_LENGTH + 1))); assert.equal(storage.length, 0);
});
test("quota failures propagate rather than falsely reporting a saved note", () => {
  const storage = new MemoryStorage(); storage.setItem = () => { throw new Error("simulated quota limit"); };
  assert.throws(() => saveNote(storage, "2026-10-27", "测试：未保存")); assert.equal(storage.length, 0);
});
// Constructed ladder inputs are confined to tests, never market analysis.
test("ladder heights descend, empty buckets disappear, and topics join by code", () => {
  const result = ladderRows({ two_board: [{ name: "测试A", thscode: "600001.SH", board_num: 2 }], five_board: [{ name: "测试B", thscode: "600002.SH", board_num: 5 }], seven_over: [] }, [{ thscode: "600001.SH", limit_up_reason: "测试题材A+测试题材B" }]);
  assert.deepEqual(result.map(row => row.height), [5, 2]); assert.equal(result[1].stocks[0].topic, "测试题材A+测试题材B"); assert.equal(result[0].stocks[0].topic, null);
  assert.equal(JSON.stringify(result).includes("600001.SH"), false);
});
test("missing same-day reasons never borrow fabricated or stale topics", () => {
  const result = ladderRows({ two_board: [{ name: "测试A", thscode: "600001.SH", board_num: 2 }] }, []);
  assert.equal(result[0].stocks[0].topic, null); assert.deepEqual(result[0].stocks[0].evidenceIds, ["ladder"]);
});
test("highest bucket keeps individual board counts ordered descending", () => {
  const result = ladderRows({ seven_over: [{ name: "测试7", board_num: 7 }, { name: "测试9", board_num: 9 }] }, []);
  assert.deepEqual(result[0].stocks.map(row => row.name), ["测试9", "测试7"]);
});
