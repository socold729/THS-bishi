import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateBars, chartPoints, disclosedRows, mean, normalizeBars, percentChange, ratio } from "../src/lib/metrics";
import { dateMs, latestClosedDate, validDate } from "../src/lib/dates";
import { decodePreferences } from "../src/lib/preferences";
import { preferencesSchema } from "../src/lib/domain";
import type { Bar } from "../src/lib/domain";

// Synthetic, explicitly isolated unit-test inputs. Never used by the application.
const bar = (date: string, close: number, volume: number | null = 10): Bar => ({ date_ms: dateMs(date), open_price: close - 1, close_price: close, high_price: close + 2, low_price: close - 2, volume, turnover: 100 });
test("percentage change uses percent units", () => assert.equal(percentChange(110, 100), 10.000000000000009));
test("null and zero denominator never become a fabricated ratio", () => { assert.equal(ratio(null, 10), null); assert.equal(ratio(5, 0), null); assert.equal(ratio(5, -1), null); });
test("numeric strings do not silently become financial numbers", () => assert.equal(ratio("5", 10), null));
test("MA requires the whole requested sample", () => { assert.equal(mean([1, 2], 5), null); assert.equal(mean([1, 2, 3], 2), 2.5); });
test("invalid calendar dates are rejected", () => { assert.equal(validDate("2026-02-30"), false); assert.equal(validDate("2026-02-28"), true); assert.equal(validDate("2026-2-2"), false); });
test("before Shanghai close uses previous completed trading day", () => assert.equal(latestClosedDate(["20261026", "20261027"], new Date("2026-10-27T06:59:00Z")), "2026-10-26"));
test("after Shanghai close permits the current trading day", () => assert.equal(latestClosedDate(["20261026", "20261027"], new Date("2026-10-27T07:00:00Z")), "2026-10-27"));
test("weekend resolves through supplied trading calendar", () => assert.equal(latestClosedDate(["2026-10-23", "2026-10-26"], new Date("2026-10-24T09:00:00Z")), "2026-10-23"));
test("missing calendar does not guess trading days", () => assert.equal(latestClosedDate([], new Date("2026-10-27T09:00:00Z")), null));
test("daily bars are sorted, deduplicated, and future bars are excluded", () => {
  const input = [bar("2026-10-22", 12), bar("2026-10-20", 10), bar("2026-10-20", 10), bar("2026-10-23", 13)];
  const result = normalizeBars(input as unknown as Record<string, unknown>[], dateMs("2026-10-22"));
  assert.deepEqual(result.map(b => b.close_price), [10, 12]);
});
test("malformed OHLC bars are excluded", () => assert.equal(normalizeBars([{ ...bar("2026-10-20", 10), high_price: 1 }], dateMs("2026-10-20")).length, 0));
test("negative transaction volume cannot enter volume indicators", () => assert.equal(normalizeBars([{ ...bar("2026-10-20", 10), volume: -1 }], dateMs("2026-10-20"))[0].volume, null));
test("weekly bars preserve OHLC and sum volume", () => {
  const result = aggregateBars([bar("2026-10-19", 10), bar("2026-10-20", 12), bar("2026-10-26", 15)], "week");
  assert.equal(result.length, 2); assert.equal(result[0].open_price, 9); assert.equal(result[0].close_price, 12); assert.equal(result[0].volume, 20);
});
test("monthly aggregation does not merge separate calendar months", () => assert.equal(aggregateBars([bar("2026-09-30", 10), bar("2026-10-08", 11)], "month").length, 2));
test("missing component volume remains null after aggregation", () => assert.equal(aggregateBars([bar("2026-10-19", 10), bar("2026-10-20", 12, null)], "week")[0].volume, null));
test("disabled indicators remain null even with enough samples", () => assert.equal(chartPoints(Array.from({ length: 25 }, (_, i) => bar(`2026-10-${String(i + 1).padStart(2, "0")}`, i + 10)), "day", false).at(-1)?.ma20, null));
test("financial selection excludes future and unknown disclosure dates", () => {
  const rows = [
    { period_end_ms: dateMs("2025-12-31"), report_date_ms: dateMs("2026-04-01") },
    { period_end_ms: dateMs("2025-12-31"), report_date_ms: dateMs("2026-10-28") },
    { period_end_ms: dateMs("2025-12-31"), report_date_ms: null },
  ];
  assert.equal(disclosedRows(rows, "2026-10-27").length, 1);
});
test("financial selection excludes period ends after selected day", () => assert.equal(disclosedRows([{ period_end_ms: dateMs("2027-12-31"), report_date_ms: dateMs("2026-04-01") }], "2026-10-27").length, 0));
test("broken or outdated browser configuration is not treated as valid", () => { assert.equal(decodePreferences("{"), null); assert.equal(decodePreferences('{"version":0}'), null); });
test("configuration refuses duplicate or excessive watchlist symbols", () => {
  const config = { version: 1, style: "swing", period: "day", updatedAt: "2026-10-27", watchlist: [{ code: "600519.SH", name: "测试标的" }, { code: "600519.SH", name: "重复" }] };
  assert.equal(preferencesSchema.safeParse(config).success, false);
  assert.equal(preferencesSchema.safeParse({ ...config, watchlist: ["000001.SZ", "600519.SH", "000858.SZ", "300059.SZ"].map(code => ({ code, name: "构造测试标的" })) }).success, false);
});
