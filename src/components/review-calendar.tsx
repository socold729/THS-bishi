"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { calendarCells, shiftMonth } from "@/lib/review-calendar";
import { shanghaiDate } from "@/lib/dates";
import { ReviewNoteEditor, type NoteEditorProps } from "./review-notes";

export function ReviewCalendar({ date, markedDates, onSelect, note }: { date: string; markedDates: string[]; onSelect: (date: string) => void; note: NoteEditorProps }) {
  const today = shanghaiDate();
  const [month, setMonth] = useState((date || today).slice(0, 7));
  useEffect(() => { if (date) setMonth(date.slice(0, 7)); }, [date]);
  const marked = new Set(markedDates);
  return <section className="card review-calendar" aria-label="复盘日历">
    <div className="calendar-heading"><h2>复盘日历</h2><div className="month-navigation"><button type="button" aria-label="上个月" onClick={() => setMonth(value => shiftMonth(value, -1))}><ChevronLeft size={17} /></button><span aria-live="polite">{month.slice(0, 4)}年 {Number(month.slice(5))}月</span><button type="button" aria-label="下个月" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(value => shiftMonth(value, 1))}><ChevronRight size={17} /></button></div></div>
    <div className="calendar-compact-layout"><div className="calendar-month-grid">
    <div className="calendar-weekdays" aria-hidden="true">{["一", "二", "三", "四", "五", "六", "日"].map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-days" role="group" aria-label={`${month}复盘日期`}>{calendarCells(month).map((day, index) => day ? <button type="button" key={day} className={`calendar-day ${day === date ? "selected" : ""} ${day === today ? "today" : ""}`} aria-label={`选择${day}复盘${marked.has(day) ? "，有笔记" : ""}`} aria-pressed={day === date} disabled={day > today} onClick={() => onSelect(day)}><span>{Number(day.slice(8))}</span>{marked.has(day) && <i className="note-dot" aria-hidden="true" />}</button> : <span className="calendar-blank" aria-hidden="true" key={`blank-${index}`} />)}</div>
    <p className="calendar-legend"><i className="note-dot" />蓝点表示当天有复盘笔记</p>
    </div>
    <ReviewNoteEditor {...note} compact />
    </div>
  </section>;
}
