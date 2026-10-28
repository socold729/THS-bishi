import type { Bar, ChartPoint, Period } from "./domain";
import { dateMs, shanghaiDate } from "./dates";
import { MOVING_AVERAGES, type MovingAverageKey } from "./moving-averages";

export function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function nonnegative(value: unknown): number | null { const number = finite(value); return number !== null && number >= 0 ? number : null; }
export function ratio(numerator: unknown, denominator: unknown, scale = 1): number | null {
  const a = finite(numerator), b = finite(denominator);
  return a !== null && b !== null && b > 0 ? (a / b) * scale : null;
}
export function percentChange(current: unknown, previous: unknown): number | null {
  const value = ratio(current, previous);
  return value === null ? null : (value - 1) * 100;
}
export function mean(values: number[], count: number): number | null {
  return values.length < count ? null : values.slice(-count).reduce((a, b) => a + b, 0) / count;
}
export function normalizeBars(items: Record<string, unknown>[], cutoff: number): Bar[] {
  const unique = new Map<number, Bar>();
  for (const item of items) {
    const date = finite(item.date_ms), open = finite(item.open_price), close = finite(item.close_price), high = finite(item.high_price), low = finite(item.low_price);
    if (date === null || date > cutoff || open === null || close === null || high === null || low === null || Math.min(open, close, high, low) <= 0) continue;
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) continue;
    unique.set(date, { date_ms: date, open_price: open, close_price: close, high_price: high, low_price: low, volume: nonnegative(item.volume), turnover: nonnegative(item.turnover) });
  }
  return [...unique.values()].sort((a, b) => a.date_ms - b.date_ms);
}
export function aggregateBars(bars: Bar[], period: Period): Bar[] {
  if (period === "day") return bars;
  const groups = new Map<string, Bar[]>();
  for (const bar of bars) {
    const date = shanghaiDate(bar.date_ms);
    const monday = new Date(`${date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const key = period === "month" ? date.slice(0, 7) : monday.toISOString().slice(0, 10);
    groups.set(key, [...(groups.get(key) ?? []), bar]);
  }
  return [...groups.values()].map(rows => ({
    date_ms: rows.at(-1)!.date_ms, open_price: rows[0].open_price, close_price: rows.at(-1)!.close_price,
    high_price: Math.max(...rows.map(b => b.high_price)), low_price: Math.min(...rows.map(b => b.low_price)),
    volume: rows.some(b => b.volume === null) ? null : rows.reduce((sum, b) => sum + b.volume!, 0),
    turnover: rows.some(b => b.turnover === null) ? null : rows.reduce((sum, b) => sum + b.turnover!, 0),
  }));
}
export function chartPoints(bars: Bar[], period: Period, allowIndicators = true): ChartPoint[] {
  const rows = aggregateBars(bars, period);
  const sums:Record<MovingAverageKey,number>={ma5:0,ma10:0,ma20:0,ma30:0,ma60:0};
  return rows.map((bar, i) => {
    const averages: Record<MovingAverageKey, number | null> = { ma5: null, ma10: null, ma20: null, ma30: null, ma60: null };
    if (allowIndicators) {
      for (const average of MOVING_AVERAGES){sums[average.key]+=bar.close_price;if(i>=average.period)sums[average.key]-=rows[i-average.period].close_price;averages[average.key]=i+1>=average.period?sums[average.key]/average.period:null;}
    }
    return { date: shanghaiDate(bar.date_ms), close: bar.close_price, ...averages };
  });
}
export function disclosedRows(items: Record<string, unknown>[], date: string) {
  const end = dateMs(date) + 86_400_000 - 1;
  return items.filter(row => {
    const reportDate = finite(row.report_date_ms), periodEnd = finite(row.period_end_ms);
    return reportDate !== null && periodEnd !== null && reportDate <= end && periodEnd <= end;
  }).sort((a, b) => Number(b.period_end_ms) - Number(a.period_end_ms));
}
