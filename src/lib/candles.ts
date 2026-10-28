import type { Bar, Period } from "./domain";
import { aggregateBars, chartPoints } from "./metrics";

export function candlePoints(bars: Bar[], period: Period, allowIndicators: boolean) {
  const rows = aggregateBars(bars, period);
  const averages = chartPoints(bars, period, allowIndicators);
  return rows.map((row, i) => ({ ...row, ...averages[i], range: [row.low_price, row.high_price] as [number, number] }));
}
export const VISIBLE_CANDLES={day:66,week:26,month:12}as const;
export function visibleCandlePoints(bars:Bar[],period:Period,allowIndicators:boolean){return candlePoints(bars,period,allowIndicators).slice(-VISIBLE_CANDLES[period]);}

// The ranged bar supplies high/low pixel coordinates. Map open/close into
// that same scale, rather than drawing a price line or inventing OHLC values.
export function candleGeometry(bar: Pick<Bar, "open_price" | "close_price" | "high_price" | "low_price">, y: number, height: number) {
  const top = Math.min(y, y + height), bottom = Math.max(y, y + height);
  const span = bar.high_price - bar.low_price;
  const at = (price: number) => span > 0 ? bottom - ((price - bar.low_price) / span) * (bottom - top) : (top + bottom) / 2;
  const open = at(bar.open_price), close = at(bar.close_price);
  return { top, bottom, bodyY: Math.min(open, close), bodyHeight: Math.max(1, Math.abs(open - close)), rising: bar.close_price >= bar.open_price };
}
