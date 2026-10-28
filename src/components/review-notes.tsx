"use client";
import { useId } from "react";
import { NotebookPen } from "lucide-react";
import { NOTE_MAX_LENGTH } from "@/lib/review-notes";

export interface NoteEditorProps { date: string; value: string; hydrated: boolean; failed: boolean; onChange: (text: string) => void }
export function ReviewNoteEditor({ date, value, hydrated, failed, onChange, compact = false }: NoteEditorProps & { compact?: boolean }) {
  const id = useId();
  const title = compact ? "每日复盘笔记" : "复盘笔记";
  const ready = hydrated && !!date;
  return <section className={`review-note-editor ${compact ? "compact" : ""}`} aria-label={title}>
    <div className="note-heading"><label htmlFor={id}><NotebookPen size={16} />{title}</label><span>{date || "请选择日期"}</span></div>
    <textarea id={id} aria-label={compact ? "日历下方每日复盘笔记" : "右侧复盘笔记"} value={value} disabled={!ready} maxLength={NOTE_MAX_LENGTH} onChange={event => onChange(event.target.value)} placeholder={ready ? "记录今天的市场观察、需要验证的判断和明天想关注的问题…" : "选择复盘日期后，在这里记录想法…"} />
    <div className="note-editor-footer"><span className={failed ? "note-save-failed" : ""}>{!ready ? "正在准备笔记" : failed ? "保存失败，输入暂留本页" : value.trim() ? "已保存到当前浏览器" : "按日期自动保存 · 两处笔记同步"}</span><span>{value.length} / {NOTE_MAX_LENGTH}</span></div>
    {!compact && <p className="helper">切换复盘日历日期，可查看当天的想法。笔记仅保存在当前浏览器，不跨设备同步。</p>}
  </section>;
}
