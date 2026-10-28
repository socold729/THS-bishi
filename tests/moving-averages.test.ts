import assert from "node:assert/strict";
import { test } from "node:test";
import { chartPoints } from "../src/lib/metrics";
import { MOVING_AVERAGES } from "../src/lib/moving-averages";
import { dateMs } from "../src/lib/dates";
import type { Bar } from "../src/lib/domain";

// Constructed unit-test inputs only, never used as product market data.
function bar(timestamp: number, close: number): Bar { return { date_ms: timestamp, open_price: close, high_price: close + .5, low_price: close - .5, close_price: close, volume: 1, turnover: 1 }; }
const daily = Array.from({ length: 61 }, (_, i) => bar(dateMs("2026-01-01") + i * 86400000, i + 1));
test("MA10/30/60 require exactly their full sample, without changing MA5/20", () => {
  const points = chartPoints(daily, "day");
  for (const { key, period } of MOVING_AVERAGES) {
    assert.equal(points[period - 2][key], null);
    assert.equal(points[period - 1][key], (period + 1) / 2);
  }
});
test("rolling averages drop old closes instead of using the entire history", () => {
  const last = chartPoints(daily, "day").at(-1)!;
  assert.equal(last.ma10, 56.5); assert.equal(last.ma30, 46.5); assert.equal(last.ma60, 31.5);
});
test("all five averages stay unavailable when history completeness fails", () => {
  const last = chartPoints(daily, "day", false).at(-1)!;
  assert.ok(MOVING_AVERAGES.every(({ key }) => last[key] === null));
});
test("weekly MA60 uses 60 weekly closes, not the most recent 60 daily bars", () => {
  const bars = Array.from({ length: 60 }, (_, i) => [bar(dateMs("2025-01-06") + i * 7 * 86400000, 1000), bar(dateMs("2025-01-07") + i * 7 * 86400000, i + 1)]).flat();
  const points = chartPoints(bars, "week");
  assert.equal(points.length, 60); assert.equal(points.at(-1)!.ma60, 30.5); assert.equal(points.at(-2)!.ma60, null);
});
test("monthly MA60 is recomputed after monthly OHLC aggregation", () => {
  const bars = Array.from({ length: 60 }, (_, i) => {
    const date = new Date(Date.UTC(2021, i, 1)).toISOString().slice(0, 7);
    return [bar(dateMs(date + "-01"), 1000), bar(dateMs(date + "-15"), i + 1)];
  }).flat();
  const points = chartPoints(bars, "month");
  assert.equal(points.length, 60); assert.equal(points.at(-1)!.ma60, 30.5);
});
