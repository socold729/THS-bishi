import { validDate } from "./dates";
export function calendarCells(month: string): (string | null)[] {
  if (!validDate(`${month}-01`)) throw new Error("无效月份");
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
  const count = last.getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > count ? null : `${month}-${String(day).padStart(2, "0")}`;
  });
}
export function shiftMonth(month: string, delta: number) {
  if (!validDate(`${month}-01`) || !Number.isInteger(delta)) throw new Error("无效月份");
  const first = new Date(`${month}-01T12:00:00Z`);
  first.setUTCMonth(first.getUTCMonth() + delta);
  return first.toISOString().slice(0, 7);
}
