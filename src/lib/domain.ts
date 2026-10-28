import { z } from "zod";
import type { ValueCompanyData } from "./value-types";

export const styleSchema = z.enum(["short", "swing", "value"]);
export type Style = z.infer<typeof styleSchema>;
export const symbolSchema = z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/, "请使用完整 A 股代码，例如 600519.SH");
export const preferencesSchema = z.object({
  version: z.literal(1),
  style: styleSchema,
  period: z.enum(["day", "week", "month"]),
  watchlist: z.array(z.object({ code: symbolSchema, name: z.string().min(1).max(40) })).max(3).refine(items => new Set(items.map(item => item.code)).size === items.length, "自选股不能重复"),
  updatedAt: z.string(),
  reviewMethods: z.object({short:z.string().max(1200),swing:z.string().max(1200),value:z.string().max(1200)}).optional(),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export type Period = Preferences["period"];
export type Status = "ready" | "empty" | "unavailable" | "error";
export interface Evidence {
  id: string;
  source: "扶摇" | "iFinD";
  endpoint: string;
  requestId: string | null;
  fetchedAt: string;
  sourceTime: number | null;
  scope: string;
  unit: string;
  fields: string[];
  count: number;
  observations: Record<string, string | number | null>[];
}
export interface Metric {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  note: string;
  evidenceIds: string[];
  observedDate?: string;
  reportPeriods?: string[];
}
export interface Bar { date_ms: number; open_price: number; close_price: number; high_price: number; low_price: number; volume: number | null; turnover: number | null }
export interface ChartPoint { date: string; close: number; ma5: number | null; ma10: number | null; ma20: number | null; ma30: number | null; ma60: number | null }
export interface StockRow { code: string; name: string; metrics: Metric[]; bars?: Bar[]; indicatorsComplete?: boolean; value?: ValueCompanyData }
export interface Coverage { label: string; status: Status; reason: string }
export interface LadderStock { name: string; topic: string | null; evidenceIds: string[] }
export interface LadderRow { label: string; height: number; stocks: LadderStock[] }
export const MARKET_INDICES = [
  { code: "000001.SH", name: "上证指数" },
  { code: "399001.SZ", name: "深证成指" },
  { code: "399006.SZ", name: "创业板指" },
  { code: "000680.SH", name: "科创综指", description: "上证科创板综合指数" },
] as const;
export interface MarketIndex {
  code: string;
  name: string;
  close: number | null;
  changePercent: number | null;
  bars: Bar[];
  indicatorsComplete: boolean;
  evidenceIds: string[];
}
export interface DashboardData {
  industries?:{name:string;code:string|null;metrics:Metric[];news:{title:string;excerpt:string;date:string;url:string;evidenceIds:string[]}[];warnings:string[]}[];
  style: Style;
  date: string;
  latestClosedDate: string | null;
  fetchedAt: string;
  status: "ready" | "partial" | "blocked";
  metrics: Metric[];
  indices: MarketIndex[];
  limitCounts: Metric[];
  bars: Bar[];
  indicatorsComplete: boolean;
  stocks: StockRow[];
  ladder: LadderRow[];
  previousLadder?: { date: string; rows: LadderRow[] };
  coverage: Coverage[];
  evidence: Evidence[];
  messages: string[];
  ai: { status: "available" | "not_implemented"; message: string };
}
export const STRATEGIES: Record<Style, { name: string; en: string; brief: string; focus: string[]; data: string; analysis: string }> = {
  short: { name: "短线复盘", en: "MARKET PULSE", brief: "读懂情绪与市场结构", focus: ["涨跌停分布", "连板梯队", "量价变化"], data: "指数日线 · 涨跌停池 · 连板矩阵", analysis: "从市场结构切入，关注情绪分化与数据覆盖范围。" },
  swing: { name: "波段复盘", en: "TREND & ROTATION", brief: "跟踪趋势与量价节奏", focus: ["日 / 周 / 月 K", "MA5 / MA20 / MA60", "成交量变化"], data: "指数与自选股历史日线 · 程序聚合周月 K", analysis: "从时间序列切入，核对趋势持续性和量价关系。" },
  value: { name: "价值投资复盘", en: "BUSINESS & VALUE", brief: "回到公司的经营事实", focus: ["财务三表", "盈利与成长", "估值口径"], data: "已披露财务报表 · 最新估值（单独标时）", analysis: "从经营质量切入，对照收入、利润与现金流证据。" },
};
