import "server-only";
import type { Coverage, DashboardData, Evidence, Metric, Style } from "../domain";
import { MARKET_INDICES } from "../domain";
import { dateMs, latestClosedDate, normalizeDate, shanghaiDate } from "../dates";
import { disclosedRows, finite, mean, normalizeBars, percentChange, ratio } from "../metrics";
import { fuyao } from "./server";
import { records, type ProviderResult } from "./transport";
import { ladderRows } from "../ladder";
import { loadValueCompanies } from "./value";
import{loadIndustries}from"./industry";
import{wants,type ReviewPlan}from"../reports/plan";
import {liquidityMetrics} from '../liquidity';

function metric(id: string, label: string, value: number | null, unit: string, note: string, ids: string[]): Metric {
  return { id, label, value, unit, note, evidenceIds: ids };
}
export async function loadDashboard(style: Style, requestedDate: string | undefined, symbols: string[], signal?: AbortSignal,plan?:ReviewPlan): Promise<DashboardData> {
  const deadline = Date.now() + (style === "value" ? plan ? 50_000 : 70_000 : 35_000);
  const request = async (path: string, params?: Record<string, string | number>): Promise<ProviderResult> => {
    signal?.throwIfAborted();
    if (Date.now() >= deadline) return { ok: false, status: "error", data: null, requestId: null, endpoint: path, fetchedAt: new Date().toISOString(), sourceTime: null, reason: "本次数据等待已达到时间预算，本项未继续请求。可稍后手动重试。" };
    return fuyao(path, params, signal);
  };
  const output: DashboardData = { style, date: requestedDate ?? "", latestClosedDate: null, fetchedAt: new Date().toISOString(), status: "blocked", metrics: [], indices: [], limitCounts: [], bars: [], indicatorsComplete: false, stocks: [], ladder: [], coverage: [], evidence: [], messages: [], ai: { status: "available", message: "可生成基于当前日期和投资风格的 AI 复盘。事实数据与 AI 推断分别标识。" } };
  function source(id: string, result: ProviderResult, scope: string, unit: string, rows = records(result.data), fields: string[] = []): string[] {
    if (!result.ok) return [];
    const observations = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key, value]) => (fields.length === 0 || fields.includes(key)) && (value === null || typeof value === "string" || typeof value === "number")))) as Evidence["observations"];
    output.evidence.push({ id, source: "扶摇", endpoint: result.endpoint, requestId: result.requestId, fetchedAt: result.fetchedAt, sourceTime: result.sourceTime, scope, unit, fields: fields.length ? fields : [...new Set(rows.flatMap(r => Object.keys(r)))], count: rows.length, observations });
    return [id];
  }
  function coverage(label: string, result: ProviderResult, rows: unknown[], note: string) {
    output.coverage.push({ label, status: !result.ok ? result.status : rows.length ? "ready" : "empty", reason: !result.ok ? result.reason : rows.length ? note : "该查询未返回记录，本项不作结论。" });
  }
  const calendar = await request("/api/a-share/calendar/trading-days");
  const calendarRows = records(calendar.data);
  const tradingDates = calendarRows.map(r => typeof r.date === "string" ? normalizeDate(r.date) : typeof r.date_ms === "number" ? shanghaiDate(r.date_ms) : "").filter(Boolean);
  const latest = latestClosedDate(tradingDates);
  output.latestClosedDate = latest;
  if (!calendar.ok || !latest) {
    output.messages.push(calendar.reason || "交易日历缺失，无法确认报告日期，已停止后续分析。");
    output.coverage.push({ label: "交易日历", status: calendar.ok ? "empty" : calendar.status, reason: "无法确认交易日，未继续请求其他数据。" });
    return output;
  }
  const date = requestedDate ?? latest;
  output.date = date;
  if (!tradingDates.includes(date) || date > latest) {
    output.messages.push(date > latest ? "所选日期尚未收盘，不能进行完整盘后复盘。" : "所选日期不是可确认的交易日，或超出近一年日历范围。请另选日期。");
    return output;
  }
  const cutoff = dateMs(date);
  const historyStart = Math.max(cutoff-5*365*86400000,dateMs(shanghaiDate(Date.now()))-(5*365-7)*86400000);
  const expectedPrevious = [...tradingDates].filter(d => d < date).sort().at(-1);
  // At most two upstream calls at a time. Large annual index histories should
  // not consume the entire request budget before personal datasets start.
  const requestedIndices=wants(plan,"indices")||wants(plan,"trends")?MARKET_INDICES:[];
  const indexResults: ProviderResult[] = [];
  for (let offset = 0; offset < requestedIndices.length; offset += 2) {
    indexResults.push(...await Promise.all(requestedIndices.slice(offset, offset + 2).map(definition => request("/api/a-share-index/prices/historical", { thscode: definition.code, interval: "1d", start: historyStart, end: cutoff }))));
  }
  for (const [index, definition] of requestedIndices.entries()) {
    const result = indexResults[index];
    const rawBars = records(result.data), bars = normalizeBars(rawBars, cutoff);
    const ids = source(`index-${definition.code}`, result, `${definition.name} ${definition.code}；截至 ${date} 的历史 OHLC，不使用最新快照补历史`, "点；成交量按供应商口径，非全市场成交量", rawBars, ["date_ms", "open_price", "high_price", "low_price", "close_price", "volume", "turnover"]);
    coverage(`${definition.name}日线`, result, bars, `已接收 ${bars.length} 根有效 OHLC；涨跌幅按相邻交易日收盘价计算`);
    const last = bars.at(-1), previous = bars.at(-2);
    const exact = last && shanghaiDate(last.date_ms) === date;
    const previousExact = previous && shanghaiDate(previous.date_ms) === expectedPrevious;
    const firstKnown=[...tradingDates].sort()[0],barDays=bars.map(b=>shanghaiDate(b.date_ms)),daySet=new Set(barDays),calendarSet=new Set(tradingDates);
    const complete=tradingDates.filter(d=>d>=(barDays[0]??date)&&d<=date).every(d=>daySet.has(d))&&barDays.filter(d=>d>=firstKnown).every(d=>calendarSet.has(d));
    output.indices.push({ code: definition.code, name: definition.name, close: exact ? last.close_price : null, changePercent: exact && previousExact ? percentChange(last.close_price, previous.close_price) : null, bars, indicatorsComplete: !!exact && complete, evidenceIds: ids });
    if (!exact) output.messages.push(`${definition.name}所选交易日行情缺失，未使用上一交易日替代。`);
    if (!complete) output.messages.push(`${definition.name}日线存在交易日缺口，该指数均线已停算。`);
  }
  const primary = output.indices[0]??{bars:[],indicatorsComplete:false,evidenceIds:[],close:null};
  output.bars = primary.bars;
  output.indicatorsComplete = primary.indicatorsComplete;
  const benchIds = primary.evidenceIds, exact = primary.close !== null, completeHistory = primary.indicatorsComplete;

  let sameDayLimitUpRows: Record<string, unknown>[] = [];
  // The header always shows the same date's limit-up/down counts.
  for (const [kind, label] of wants(plan,"limits")||wants(plan,"topics")?[["limit-up-pool", "涨停家数"], ["limit-down-pool", "跌停家数"]] as const:[]) {
      const result = await request(`/api/a-share/special-data/${kind}`, { date_ms: cutoff, page: 1, size: 200, ...(kind === "limit-up-pool" ? { sort_field: "continue_day_cnt", sort_dir: "desc" } : {}) });
      const rows = records(result.data);
      if (kind === "limit-up-pool" && result.ok) sameDayLimitUpRows = rows;
      const pagination = result.data?.pagination as Record<string, unknown> | undefined;
      const total = finite(pagination?.total);
      const ids = source(kind, result, `${date} 股票池；家数取 pagination.total，非页面样本数`, "家；金额字段原币元", rows, ["thscode", "name", "continue_day_cnt", "limit_up_reason"]);
      output.limitCounts.push(metric(kind, label, result.ok ? total : null, "家", "供应商股票池总数；不代表全市场涨跌家数", ids));
      coverage(label.replace("家数", "池"), result, total === 0 ? [0] : rows, `总计 ${total ?? "未知"} 家；本次接收 ${rows.length} 条，最多200条`);
  }
  if (style === "short"&&wants(plan,"ladder")) {
    const ladder = await request("/api/a-share/special-data/limit-up-ladder");
    const rows = records(ladder.data);
    const selected = rows.find(row => typeof row.date === "string" && normalizeDate(row.date) === date);
    const boards = selected?.boards as Record<string, unknown> | undefined;
    const ladderEvidenceRows = Object.values(boards ?? {}).flatMap(value => Array.isArray(value) ? value.filter(row => typeof row === "object" && row !== null).map(row => ({ ...row, date })) : []);
    source("ladder", ladder, `${date} 连板样本；每板位数量有上游截断，不用于估算全市场连板家数；题材另见同日涨停池 limit_up_reason`, "只；连板数单位为板", ladderEvidenceRows, ["date", "name", "thscode", "board_num"]);
    output.ladder = ladderRows(boards, sameDayLimitUpRows);
    const prior = rows.find(row => typeof row.date === "string" && normalizeDate(row.date) === expectedPrevious);
    if (prior && expectedPrevious) {
      const priorBoards = prior.boards as Record<string, unknown> | undefined;
      const priorRows = Object.values(priorBoards ?? {}).flatMap(value => Array.isArray(value) ? value.map(row => ({ ...row, date: expectedPrevious })) : []);
      source("ladder-previous", ladder, `${expectedPrevious} 相邻交易日有限连板样本；仅用于与本日同口径比较`, "板", priorRows, ["date", "name", "thscode", "board_num"]);
      output.previousLadder = { date: expectedPrevious, rows: ladderRows(priorBoards, []) };
    }
    coverage("连板梯队", ladder, selected ? [selected] : [], "仅展示上游每个板位的有限样本，不据此判断龙头或买卖机会");
    const stocks = output.ladder.flatMap(row => row.stocks), missingTopics = stocks.filter(stock => !stock.topic).length;
    output.coverage.push({ label: "连板题材", status: !stocks.length ? "empty" : missingTopics ? "unavailable" : "ready", reason: !stocks.length ? "没有可关联题材的连板样本。" : missingTopics ? `${missingTopics}只样本未取得同日题材，已显示“题材暂缺”，未使用其他日期补全。` : "题材直接取同日涨停池 limit_up_reason，按证券代码关联；不附加所属板块，不由AI生成。" });
    output.coverage.push({ label: "全市场宽度 / 热点题材", status: "unavailable", reason: "尚未完成全市场行情分页与板块归因，暂不计算涨跌家数、情绪分数或题材强度。" });
  } else if (style === "swing") {
    if(wants(plan,"trends")){
    const closes = output.bars.map(row => row.close_price);
    output.metrics.push(metric("ma20", "上证指数 · MA20", exact && completeHistory ? mean(closes, 20) : null, "点", "最近20根完整交易日日线收盘价的算术平均", benchIds));
    output.metrics.push(metric("ma60", "上证指数 · MA60", exact && completeHistory ? mean(closes, 60) : null, "点", "样本不足60根时不计算", benchIds));
    output.coverage.push({ label: "周 K / 月 K", status: output.bars.length ? "ready" : "empty", reason: "由日线按自然周/月聚合；边界周期可能未完成，周月均线按对应周期单独计算。" });
    }
    if(!plan||plan.mode==="default")output.coverage.push({ label: "行业轮动 / 产业事件", status: "unavailable", reason: "行业目录已验证；行业全量时序与事件归因尚未接入，不能从单一指数推断轮动。" });
  } else {
    output.metrics.push(metric("watchlist-count", "基本面观察范围", symbols.length, "只", "仅分析手动添加的自选股，上限3只", []));
    output.metrics.push(metric("value-basis", "财务截面", null, "", "只使用披露日期不晚于所选日的报表；不保证供应商历史修订的时点还原", []));
    if(wants(plan,"announcements"))output.coverage.push({ label: "公告覆盖范围", status: "unavailable", reason: "公告为检索片段而非完整目录/全文；未返回记录不能说明没有重要新变化。" });
  }

  // Public market overview must finish before optional company/MCP work consumes the budget.
  if(style === "value") {
    const value=await loadValueCompanies(symbols,date,latest,request,deadline,signal,plan);
    output.stocks=value.stocks;output.evidence.push(...value.evidence);output.coverage.push(...value.coverage);
  }
  for (const code of style === "value" ? [] : symbols) {
    const stock: DashboardData["stocks"][number] = { code, name: code, metrics: [] };
    if (style !== "value"&&wants(plan,"watchlist")) {
      const result = await request("/api/a-share/prices/historical", { thscode: code, interval: "1d", start: historyStart, end: cutoff, adjust: "none" });
      const raw = records(result.data), bars = normalizeBars(raw, cutoff);
      const ids = source(`stock-${code}`, result, `${code}；${date}；不复权日线，分红送转可能影响技术指标`, "价格元/股；成交量股；成交额元", raw, ["date_ms", "open_price", "high_price", "low_price", "close_price", "volume","turnover"]);
      coverage(code, result, bars, "已接收不复权日线；价格与均线由程序计算");
      const latestBar = bars.at(-1), prev = bars.at(-2);
      const valid = latestBar && shanghaiDate(latestBar.date_ms) === date;
      stock.bars = bars;
      const barDays=new Set(bars.map(b=>shanghaiDate(b.date_ms)));
      stock.indicatorsComplete = !!valid && tradingDates.filter(d=>d>=shanghaiDate(bars[0]?.date_ms??cutoff)&&d<=date).every(d=>barDays.has(d));
      stock.metrics.push(metric("close", "收盘价", valid ? latestBar.close_price : null, "元", "所选日期收盘价", ids));
      stock.metrics.push(metric("change", "日涨跌", valid && prev && shanghaiDate(prev.date_ms) === expectedPrevious ? percentChange(latestBar.close_price, prev.close_price) : null, "%", "相邻交易日；不复权", ids));
      if (style === "swing") {
        const complete = stock.indicatorsComplete;
        stock.metrics.push(metric("ma20", "MA20", valid && complete ? mean(bars.map(b => b.close_price), 20) : null, "元", "20个交易日收盘价均值；缺失交易日则不计算", ids));
      }
      stock.metrics.push(...liquidityMetrics(bars,date,style,ids,!!stock.indicatorsComplete));
    }
    output.stocks.push(stock);
  }
  if(wants(plan,"industry")&&(style==="value"||!!plan?.industries.length)){
    const names=plan?.industries.length?plan.industries:output.stocks.flatMap(s=>s.value?.industry?[s.value.industry.name]:[]);
    const sectors=await loadIndustries(names,date,request,deadline,signal,tradingDates);output.industries=sectors.industries;output.evidence.push(...sectors.evidence);output.coverage.push(...sectors.coverage);
  }
  if (symbols.length === 0) output.messages.push("尚未添加自选股。市场数据仍可查看，个性化标的分析等待你添加自选。");
  const ready = output.coverage.some(c => c.status === "ready");
  output.status = ready ? output.coverage.some(c => c.status !== "ready") ? "partial" : "ready" : "blocked";
  return output;
}
