import { randomUUID } from "node:crypto";
import type { Bar, DashboardData, Metric, Period } from "../domain";
import { chartPoints, aggregateBars, mean, percentChange, ratio } from "../metrics";
import { shanghaiDate, dateMs } from "../dates";
import { MOVING_AVERAGES } from "../moving-averages";
import { ReportError } from "./errors";
import type { AnalysisPacket, ReportEvidence } from "./types";
import { checkHypothesis, hypothesisKey, type HypothesisCondition } from "../investment-hypotheses";
import{wants,UNSUPPORTED_REQUESTS,type ReviewPlan}from"./plan";
import{liquidityMetrics}from"../liquidity";

// Only server-loaded datasets enter this adapter. Browser-supplied financial values are never accepted.
export function buildAnalysisPacket(data: DashboardData, conditions:HypothesisCondition[]=[],plan?:ReviewPlan): AnalysisPacket {
  if (data.status === "blocked" || !data.latestClosedDate || data.date > data.latestClosedDate) throw new ReportError("DATA_BLOCKED", data.messages[0] || "无法确认交易日或已收盘数据，本次不生成报告。");
  const id = randomUUID();
  const packet: AnalysisPacket = { id, date: data.date, style: data.style, symbols: data.stocks.map(s => s.code), subjects: ["市场", ...data.indices.map(i => i.code), ...data.stocks.map(s => s.code)], evidence: [], partial: data.status === "partial", limitations: [...data.messages, ...data.coverage.filter(c => c.status !== "ready").map(c => `${c.label}：${c.reason}`)] };
  const add = (subject: string, label: string, field: string, value: number | string | null | undefined, unit: string, scope: string, sourceIds: string[], observedDate = data.date, formula = "供应商原始字段") => {
    if (value == null || (typeof value === "number" && !Number.isFinite(value))) return;
    if(typeof value === "string" && value.length > 160) {packet.limitations.push(`${label}的${field}文本超出本轮长度上限，未截断后作为完整事实提供给AI。`);return;}
    const sources = data.evidence.filter(e => sourceIds.includes(e.id));
    if (!sources.length || sources.length !== new Set(sourceIds).size) return;
    if (observedDate > data.date) return;
    const point: ReportEvidence = { id: `${id}:E${packet.evidence.length + 1}`, date: data.date, observedDate, subject, label, field, value: typeof value === "number" ? Math.round(value * 10000) / 10000 : value, unit, scope, formula:formula+(typeof value === "number" ? "；标准化到小数点后最多四位" : ""), status: "usable", sources: sources.map(({ source, endpoint, requestId, fetchedAt, sourceTime }) => ({ source, endpoint, requestId, fetchedAt, sourceTime })) };
    packet.evidence.push(point);
    if (!packet.subjects.includes(subject)) packet.subjects.push(subject);
  };
  const addMetric = (subject: string, label: string, item: Metric) => {
    const financialRows=data.style === "value" ? data.evidence.filter(e=>item.evidenceIds.includes(e.id)).flatMap(e=>e.observations.slice(0,2)) : [];
    const disclosureDates=financialRows.flatMap(row=>typeof row.report_date_ms === "number" ? [shanghaiDate(row.report_date_ms)] : []).sort();
    const periods=[...new Set(financialRows.flatMap(row=>typeof row.period_end_ms === "number" ? [shanghaiDate(row.period_end_ms)] : []))];
    add(subject, label, item.id, item.value, item.unit, item.note+((item.reportPeriods??periods).length ? `；财务报告期：${(item.reportPeriods??periods).join("、")}` : ""), item.evidenceIds, item.observedDate ?? disclosureDates.at(-1) ?? data.date, item.note);
  };
  packet.plan=plan;
  for (const index of wants(plan,"indices")?data.indices:[]) {
    if (index.close === null || shanghaiDate(index.bars.at(-1)?.date_ms ?? 0) !== data.date) continue;
    add(index.code, index.name, "close", index.close, "点", "选定交易日收盘", index.evidenceIds);
    add(index.code, index.name, "change", index.changePercent, "%", "相邻交易日收盘价涨跌幅", index.evidenceIds, data.date, "(本日收盘/前交易日收盘−1)×100");
  }
  if (data.style === "short") {
    if(wants(plan,"limits"))data.limitCounts.forEach(item => addMetric("市场", "市场", item));
    const boardRows=(sourceId:string,date:string)=>data.evidence.find(e=>e.id===sourceId)?.observations.filter(row=>row.date===date && typeof row.name==="string") ?? [];
    const exactHeight=(value:unknown):value is number=>typeof value === "number" && Number.isInteger(value) && value>=2;
    const currentRows=boardRows("ladder",data.date);
    // The seven_over display bucket is a lower bound, not an exact board count.
    const max = currentRows.length && currentRows.every(r=>exactHeight(r.board_num)) ? Math.max(...currentRows.map(r=>r.board_num as number)) : null;
    add("市场", "连板样本", "sample-max-height", max, "板", "上游有限样本最大板位，非全市场完整梯队或龙头认定", ["ladder"], data.date, "max(有限样本板位)");
    const previousRows=data.previousLadder ? boardRows("ladder-previous",data.previousLadder.date) : [];
    if (data.previousLadder && previousRows.length && previousRows.every(r=>exactHeight(r.board_num)) && max !== null) {
      const previousMax = Math.max(...previousRows.map(r=>r.board_num as number));
      add("市场", "连板样本", "previous-sample-height", previousMax, "板", "相邻交易日有限样本最大板位", ["ladder-previous"], data.previousLadder.date, "max(前一交易日有限样本板位)");
      add("市场", "连板样本", "sample-height-change", max - previousMax, "板", "只比较相邻日有限样本最高板位，不代表晋级率", ["ladder", "ladder-previous"], data.date, "本日样本最高板位−前交易日样本最高板位");
    } else packet.limitations.push("相邻交易日连板样本缺失时，不分析梯队高度变化或晋级率。");
    for (const level of data.ladder.slice(0, 3)) for (const stock of level.stocks.slice(0, 5)) {
      const height=currentRows.find(row=>row.name===stock.name)?.board_num;
      add(stock.name, stock.name, "board-height", exactHeight(height) ? height : null, "板", "有限连板样本的board_num；仅作为高位观察候选，不是龙头确认或交易建议", ["ladder"]);
      if (stock.topic) add(stock.name, stock.name, "supplier-topic", stock.topic, "题材", "同日涨停池归类，不将涨跌直接归因为题材", stock.evidenceIds);
    }
    const topicSource = data.evidence.find(e => e.id === "limit-up-pool");
    const topics = new Map<string, number>();
    for (const row of topicSource?.observations ?? []) if (typeof row.limit_up_reason === "string") for (const topic of new Set(row.limit_up_reason.split(/[+＋]/).map(s => s.trim()).filter(Boolean))) topics.set(topic, (topics.get(topic) ?? 0) + 1);
    [...topics].sort((a,b) => b[1]-a[1]).slice(0, 5).forEach(([topic,count]) => add("市场", topic, "topic-sample-count", count, "只", "仅同日最多200条涨停池样本中的题材词频，非板块涨幅或热度评分", ["limit-up-pool"], data.date, "按+分隔题材，同只股票同题材去重计数"));
    packet.limitations.push("涨跌停家数为供应商股票池口径；没有全市场涨跌宽度。题材词频仅描述涨停池样本，不能证明上涨原因或板块强弱。");
  }
  const trends = (subject: string, label: string, bars: Bar[], complete: boolean, sourceIds: string[], unit: string) => {
    if (!complete || shanghaiDate(bars.at(-1)?.date_ms ?? 0) !== data.date) { packet.limitations.push(`${label}历史不完整或当日缺失，趋势均线和相对表现不作结论。`); return; }
    for (const period of ["day", "week", "month"] as Period[]) {
      const rows = aggregateBars(bars, period), point = chartPoints(bars, period).at(-1)!;
      const scope = `${period}周期，按截至选定日可见日线聚合；边界周/月可能尚未完成`;
      for (const { key, label: ma } of MOVING_AVERAGES) add(subject, label, `${period}-${ma}`, point?.[key], unit, scope, sourceIds, data.date, `${period}周期最近${ma.slice(2)}根收盘价算术平均`);
      add(subject, label, `${period}-change`, rows.length > 1 ? percentChange(rows.at(-1)!.close_price, rows.at(-2)!.close_price) : null, "%", scope, sourceIds, data.date, "当前可见周期收盘/上一周期收盘−1");
      const ma20 = point?.ma20;
      if (ma20 != null) add(subject, label, `${period}-position`, point.close >= ma20 ? "收盘不低于该周期均线" : "收盘低于该周期均线", "MA20相对位置", scope, sourceIds, data.date, "比较本周期收盘与本周期MA20；不推断未来方向");
    }
    for(const item of liquidityMetrics(bars,data.date,"swing",sourceIds,complete))if(!packet.evidence.some(e=>e.subject===subject&&e.field===item.id))addMetric(subject,label,item);
  };
  if(data.style==="short"&&wants(plan,"indices"))for(const index of data.indices)for(const item of liquidityMetrics(index.bars,data.date,"short",index.evidenceIds,index.indicatorsComplete))addMetric(index.code,index.name,item);
  if (data.style === "swing"&&wants(plan,"trends")) {
    for (const i of data.indices) trends(i.code, i.name, i.bars, i.indicatorsComplete, i.evidenceIds, "点");
    if(wants(plan,"industry"))packet.limitations.push(data.industries?.some(s=>s.news.length)?"行业资讯仅为实际返回片段，潜在影响仍待验证，不从价格推断原因。":"缺少通过日期/行业关联校验的产业事件，不从指数涨跌推断行业发展或轮动。周/月历史不足时均线留空。");
  }
  for (const stock of data.stocks) {
    if(data.style === "value"&&wants(plan,"financials")) {
      const visible=data.evidence.find(e=>e.id===`income-${stock.code}`)?.observations.filter(r=>typeof r.report_date_ms === "number" && typeof r.period_end_ms === "number" && r.report_date_ms < dateMs(data.date)+86400000 && r.period_end_ms < dateMs(data.date)+86400000) ?? [];
      const extra=stock.value?.reports.map(r=>dateMs(r.periodEnd))??[];
      const allPeriods=[...visible.map(r=>r.period_end_ms as number),...extra];
      const latestPeriod=allPeriods.length ? Math.max(...allPeriods) : null;
      // Product freshness policy, not a claim about statutory filing deadlines.
      if(latestPeriod === null || dateMs(data.date)-latestPeriod > 732*86400000) {
        packet.limitations.push(`${stock.code}没有可确认的近期财报（本轮要求最新可见财报期末距所选日不超过732天），财务分析已停用。`);
        continue;
      }
    }
    if((data.style!=="value"&&wants(plan,"watchlist")) || (data.style==="value"&&!stock.value))for (const item of stock.metrics) if (!["pe", "value-basis"].includes(item.id)) addMetric(stock.code, stock.name, item);
    if (data.style === "swing" && stock.bars&&wants(plan,"watchlist")) {
      trends(stock.code, stock.name, stock.bars, !!stock.indicatorsComplete, [`stock-${stock.code}`], "元/股");
      const benchmark = data.indices[0], change = stock.metrics.find(m => m.id === "change")?.value;
      if (stock.indicatorsComplete && change != null && benchmark?.changePercent != null) add(stock.code, stock.name, "relative-daily", change - benchmark.changePercent, "百分点", "自选股日涨跌幅减上证指数日涨跌幅；不复权，非超额收益承诺", [`stock-${stock.code}`, ...benchmark.evidenceIds], data.date, "个股日涨跌幅−上证指数日涨跌幅");
    }
    if (data.style === "value") {
      if(stock.value) {
        for(const frequency of wants(plan,"financials")?["annual","quarterly"] as const:[]) {
          const current=stock.value.reports.find(r=>r.frequency===frequency);
          if(!current || dateMs(data.date)-dateMs(current.periodEnd)>732*86400000)continue;
          for(const metric of current.metrics)addMetric(stock.code,`${stock.name} · ${current.label}`,{...metric,id:`${frequency}-${metric.id}`});
        }
        for(const q of wants(plan,"financials")?stock.value.quarterComparisons??[]:[]){
          for(const[field,value,unit]of[["single-current",q.current,"元"],["single-previous",q.previous,"元"],["delta",q.delta,"元"],["rate",q.rate,"%"]]as const)add(stock.code,`${stock.name} · ${q.label}`,`qoq-${q.field}-${field}`,value,unit,`${q.periodEnd}对比${q.previousPeriodEnd}；${q.reason}；${q.formula}`,q.evidenceIds,q.disclosedAt??data.date,q.formula);
          if(q.delta===null)packet.limitations.push(`${stock.name}${q.label}：暂无可比环比数据，未强行计算。`);
        }
        if(wants(plan,"industry")&&stock.value.industry){const info=stock.value.industry;add(stock.code,stock.name,"company-industry",info.name,info.level?`同花顺${info.level}`:"同花顺行业（级别未返回）",`截至${info.asOf}的响应元数据，非当前资料冒充历史`,info.evidenceIds,info.asOf);if(info.business)add(stock.code,stock.name,"company-business",info.business,"主营业务文本","公司资料文本，仅作业务背景，不证明行业发展",info.evidenceIds,info.asOf);}
        for(const valuation of wants(plan,"valuations")?stock.value.valuations:[]) {
          add(stock.code,stock.name,`historical-pe-ttm-${valuation.date}`,valuation.peTtm,"倍",`${valuation.date}实际返回的PE(TTM)；不是最新快照或估值分位`,valuation.evidenceIds,valuation.date);
          add(stock.code,stock.name,`historical-pb-${valuation.date}`,valuation.pb,"倍",`${valuation.date}实际返回的${valuation.pbBasis}；仅按供应商口径`,valuation.evidenceIds,valuation.date);
        }
        for(const notice of wants(plan,"announcements")?stock.value.announcements:[]) {
          add(stock.code,stock.name,"notice-title",notice.title,"公告题名",`披露日${notice.date}；检索相关片段，非完整目录；${notice.url?"原文URL见来源字段":"原文URL未返回，未独立核对全文"}`,notice.evidenceIds,notice.date);
          add(stock.code,stock.name,"notice-excerpt",notice.excerpt.slice(0,120),"公告检索片段（前120字）","只是返回片段的限定引用，不能推断全文或未经片段明确支持的事项",notice.evidenceIds,notice.date);
        }
        packet.limitations.push(...stock.value.warnings.map(w=>`${stock.name}：${w}`));
        if(wants(plan,"announcements"))packet.limitations.push(`${stock.name}：本次检索${stock.value.announcements.length}条相关公告片段，其中${stock.value.announcements.filter(n=>n.date===data.date).length}条日期等于所选日；检索非全量，不能据此宣称没有重要新变化。`);
        continue;
      }
      for (const prefix of ["income", "cash"]) {
        const source = data.evidence.find(e => e.id === `${prefix}-${stock.code}`);
        for (const [index,row] of (source?.observations ?? []).slice(0,2).entries()) {
          if (typeof row.report_date_ms !== "number" || typeof row.period_end_ms !== "number" || row.report_date_ms >= dateMs(data.date)+86400000 || row.period_end_ms >= dateMs(data.date)+86400000) continue;
          for (const field of prefix === "income" ? ["operating_income", "net_profit"] : ["act_cash_flow_net"]) if (typeof row[field] === "number") add(stock.code, stock.name, `${prefix}-${index}-${field}`, row[field], "元", `报告期末${shanghaiDate(row.period_end_ms)}；披露日${shanghaiDate(row.report_date_ms)}；供应商历史修订不能还原`, [source!.id], shanghaiDate(row.report_date_ms));
        }
      }
    }
  }
  for(const sector of wants(plan,"industry")?data.industries??[]:[]){
    const subject=sector.code??`行业:${sector.name}`;
    for(const metric of sector.metrics)addMetric(subject,sector.name,metric);
    for(const news of sector.news){
      const subjects=[subject,...data.stocks.filter(s=>s.value?.industry?.name===sector.name).map(s=>s.code)];
      for(const linkedSubject of subjects){
        add(linkedSubject,sector.name,"industry-news-title",news.title,"资讯标题",`发布日${news.date}；原文链接${news.url}；仅片段未独立全文核实；公司关联仅使用所选日已核验行业归属`,news.evidenceIds,news.date);
        add(linkedSubject,sector.name,"industry-news-excerpt",news.excerpt,"已返回行业资讯片段","片段并非已确认政策全文；潜在公司影响只能作为待验证推断",news.evidenceIds,news.date);
      }
    }
    packet.limitations.push(...sector.warnings.map(w=>`${sector.name}：${w}`));
  }
  if (plan)packet.limitations.push(...plan.unavailable.flatMap(key=>key in UNSUPPORTED_REQUESTS?[UNSUPPORTED_REQUESTS[key as keyof typeof UNSUPPORTED_REQUESTS]]:[]));
  if (data.style === "value") packet.limitations.push("财务仅用截至所选日已披露数据。季度环比必须有同币种/同报告期单季或累计口径交叉验证，不能直接比较累计值。最新估值快照不进历史分析，公告与行业资讯仅为片段，不能据此宣称无新变化。");
  if (data.style === "value" && !data.stocks.length) throw new ReportError("WATCHLIST_REQUIRED", "价值投资复盘需要先添加自选股，当前没有可分析的公司。");
  if(data.style === "short" && !packet.evidence.some(e=>["limit-up-pool","limit-down-pool","sample-max-height"].includes(e.field))) throw new ReportError("STRATEGY_DATA_MISSING", "涨跌停与梯队核心数据均未取得，不能只用指数摘要冒充短线复盘。请稍后手动重试。");
  if(data.style === "swing" && !packet.evidence.some(e=>/^(day|week|month|industry)-/.test(e.field) || e.field === "volume-ratio")) throw new ReportError("STRATEGY_DATA_MISSING", "缺少完整历史趋势或量能证据，当前不能生成波段复盘。请稍后手动重试。");
  if (!packet.evidence.length || (data.style === "value" && !packet.evidence.some(e => packet.symbols.includes(e.subject)))) throw new ReportError("NO_EVIDENCE", "当前策略证据不足，财务资料可能缺失或过期，本次不生成报告。");
  packet.configurationKey=hypothesisKey(conditions);
  for(const condition of wants(plan,"hypotheses")?conditions:[]) {
    if(data.style!=="value"||!packet.symbols.includes(condition.code))throw new ReportError("SUBJECT_MISMATCH","投资假设不属于当前价值复盘自选范围。");
    const check=checkHypothesis(condition,data);
    if(check.value===null){packet.limitations.push(`${condition.code}的用户假设条件缺少可核验指标，不作成立与否判断。`);continue;}
    const sources=data.evidence.filter(e=>check.sourceIds.includes(e.id));
    if(!sources.length)continue;
    packet.evidence.push({id:`${packet.id}:E${packet.evidence.length+1}`,date:data.date,observedDate:check.disclosedAt??data.date,subject:condition.code,label:`${condition.code} · 用户自设条件回看`,field:"hypothesis-check",value:`${check.label}${condition.comparison==="gte"?"≥":"≤"}${condition.threshold}${check.unit}；实际${Math.round(check.value*10000)/10000}${check.unit}；${check.status==="matches"?"指标符合条件":"需复核"}`,unit:"规则核验结果，非投资结论",scope:`条件为用户当前自设，对${data.date}已披露数据回看，不代表当时已有该假设；指标符合条件不证明长期投资假设成立`,formula:`按用户比较符核对程序计算的${check.label}`,status:"usable",sources:[...sources.map(({source,endpoint,requestId,fetchedAt,sourceTime})=>({source,endpoint,requestId,fetchedAt,sourceTime})),{source:"用户自设条件",endpoint:"local:hypothesis-condition",requestId:null,fetchedAt:new Date().toISOString(),sourceTime:null}]});
  }
  packet.limitations = [...new Set(packet.limitations)];
  packet.partial ||= packet.limitations.length > 0;
  return packet;
}
