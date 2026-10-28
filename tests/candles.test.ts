import assert from "node:assert/strict";
import { test } from "node:test";
import { candleGeometry, candlePoints } from "../src/lib/candles";
import { dateMs } from "../src/lib/dates";
import type { Bar } from "../src/lib/domain";
// Constructed test inputs only; never used as market data.
const row = (date: string, open: number, close: number, high: number, low: number): Bar => ({ date_ms: dateMs(date), open_price: open, close_price: close, high_price: high, low_price: low, volume: 10, turnover: 100 });
test("rising candle body maps open/close to the same high/low pixel scale", () => {
  const shape = candleGeometry(row("2026-10-20", 12, 18, 20, 10), 50, 100);
  assert.deepEqual(shape, { top: 50, bottom: 150, bodyY: 70, bodyHeight: 60, rising: true });
});
test("falling candles keep their own OHLC and down direction", () => {
  const shape = candleGeometry(row("2026-10-20", 18, 12, 20, 10), 50, 100);
  assert.equal(shape.rising, false); assert.equal(shape.bodyY, 70); assert.equal(shape.bodyHeight, 60);
});
test("doji and flat trading ranges remain visible without NaN geometry", () => {
  const shape = candleGeometry(row("2026-10-20", 10, 10, 10, 10), 50, 0);
  assert.equal(shape.bodyHeight, 1); assert.equal(shape.bodyY, 50);
});
test("weekly candles use first open, last close, max high, min low", () => {
  const data = candlePoints([row("2026-10-19", 10, 12, 13, 9), row("2026-10-20", 12, 11, 14, 8)], "week", true);
  assert.equal(data.length, 1); assert.equal(data[0].open_price, 10); assert.equal(data[0].close_price, 11); assert.deepEqual(data[0].range, [8, 14]);
});
test("monthly candles do not fabricate OHLC from a closing price", () => {
  const data = candlePoints([row("2026-09-30", 10, 12, 15, 8), row("2026-10-08", 13, 14, 16, 11)], "month", false);
  assert.equal(data.length, 2); assert.equal(data[0].high_price, 15); assert.equal(data[0].low_price, 8); assert.equal(data[1].ma5, null);
});
