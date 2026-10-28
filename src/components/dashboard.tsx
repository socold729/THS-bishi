"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronRight, Database, FileText, Info, RefreshCw, ScanLine, ShieldCheck, Sparkles, X } from "lucide-react";
import { STRATEGIES, MARKET_INDICES, type DashboardData, type Evidence, type Metric, type Period, type Style } from "@/lib/domain";
import { formatNumber } from "@/lib/utils";
import { MOVING_AVERAGES } from "@/lib/moving-averages";
import { AIReportPanel } from "./ai-report";
import { ValueReview } from "./value-review";
import{IndustryReview}from"./industry-review";
import { useInvestmentHypotheses } from "@/hooks/use-investment-hypotheses";
import { hypothesisKey } from "@/lib/investment-hypotheses";
import {reviewConfigurationKey}from"@/lib/reports/plan";
import { ReviewCalendar } from "./review-calendar";
import { ReviewNoteEditor } from "./review-notes";
import {AnomalyAlerts} from './anomaly-alerts';
import { useReviewNotes } from "@/hooks/use-review-notes";
import { usePreferences } from "./providers";
import { StrategyForm } from "./strategy-form";
import { PriceChart } from "./price-chart";
import { IndexCards, LimitSummary } from "./market-overview";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

function EvidenceDialog({ evidence, onClose }: { evidence: Evidence[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (dialog && !dialog.open) dialog.showModal(); }, []);
  return <dialog ref={ref} className="evidence-dialog" onClose={onClose} onClick={e => { if (e.target === ref.current) ref.current.close(); }} aria-labelledby="evidence-title">
    <div className="evidence-dialog-header"><div><span className="eyebrow">SOURCE & EVIDENCE</span><h2 id="evidence-title">这项数据从哪里来？</h2></div><Button variant="ghost" size="icon" onClick={() => ref.current?.close()} aria-label="关闭证据详情"><X size={18}/></Button></div>
    {evidence.map(item=><section key={item.id} className="evidence-source-section"><h3>{item.source} · {item.endpoint}</h3><dl>
      <dt>来源</dt><dd>{item.source} · {item.endpoint}</dd>
      <dt>范围与口径</dt><dd>{item.scope}</dd><dt>单位</dt><dd>{item.unit}</dd>
      <dt>抓取时点</dt><dd>{new Date(item.fetchedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}（上海）</dd>
      <dt>来源时间</dt><dd>{item.sourceTime?new Date(item.sourceTime).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false}):"未返回"}（不直接等于成交或披露时间）</dd>
      <dt>请求标识</dt><dd>{item.requestId??"未返回"}</dd><dt>字段</dt><dd>{item.fields.join(" · ")||"见数据口径"}</dd>
    </dl><h3>支撑指标的原始字段</h3><pre>{JSON.stringify(item.observations,null,2)}</pre><p className="helper">已接收 {item.count} 条记录。数值来自供应商原始字段；不代表已完成独立数值对账。</p></section>)}
  </dialog>;
}
function MetricValue({ item }: { item: Metric }) {
  const directional = item.id.includes("change") && item.value !== null;
  return <span className={`metric-value ${directional ? item.value! >= 0 ? "positive" : "negative" : ""}`}>{directional && (item.value! >= 0 ? <ArrowUp size={19} /> : <ArrowDown size={19} />)}{formatNumber(item.value, item.unit === "家" || item.unit === "只" ? 0 : 2)}<small>{item.value !== null ? item.unit : ""}</small></span>;
}
export function Dashboard() {
  const { preferences, hydrated, save } = usePreferences();
  const [data, setData] = useState<DashboardData | null>(null);
  const [date, setDate] = useState("");
  const [resolvedDate, setResolvedDate] = useState("");
  const notes = useReviewNotes();
  const hypotheses = useInvestmentHypotheses(data?.style === preferences?.style ? data : null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence[] | null>(null);
  const [selectedIndexCode, setSelectedIndexCode] = useState<string>(MARKET_INDICES[0].code);
  const style = preferences?.style;
  const symbols = preferences?.watchlist.map(stock => stock.code).join(",") ?? "";
  useEffect(() => {
    if (!hydrated || !style) return;
    const controller = new AbortController();
    setBusy(true); setError(""); setData(null);
    const query = new URLSearchParams({ style, symbols });
    if (date) query.set("date", date);
    fetch(`/api/dashboard?${query}`, { signal: controller.signal }).then(async response => { const json = await response.json(); if (!response.ok) throw new Error(json.error || "请求失败"); return json as DashboardData; }).then(result => { if (!controller.signal.aborted) { setData(result); if (result.date) setResolvedDate(result.date); } }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "获取数据失败"); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [hydrated, style, symbols, date, refresh]);
  if (!hydrated) return <div className="loading-state">正在打开你的复盘空间…</div>;
  if (!preferences) return <StrategyForm />;
  const definition = STRATEGIES[preferences.style];
  const readyCount = data?.coverage.filter(c => c.status === "ready").length ?? 0;
  const period = preferences.period;
  const selectedDate = date || resolvedDate;
  const conditions = style === "value" ? hypotheses.store.hypotheses.filter(h=>!h.archived && h.effectiveDate<=selectedDate && preferences.watchlist.some(s=>s.code===h.code)).map(({id,code,metric,comparison,threshold})=>({id,code,metric,comparison,threshold})) : [];
  const noteProps = { date: selectedDate, value: notes.notes[selectedDate]?.text ?? "", hydrated: notes.hydrated, failed: !!notes.failedDates[selectedDate], onChange: (text: string) => notes.update(selectedDate, text) };
  const activeIndex = data?.indices?.find(index => index.code === selectedIndexCode);
  const activeDefinition = MARKET_INDICES.find(index => index.code === selectedIndexCode) ?? MARKET_INDICES[0];
  function showEvidence(ids: string[]) { const found = data?.evidence.filter(item => ids.includes(item.id)); if (found?.length) setSelectedEvidence(found); }
  function updatePeriod(value: Period) { if (preferences) save({ ...preferences, period: value, updatedAt: new Date().toISOString() }); }
  return <>
    <div className="review-overview">
      <div className="review-market-summary"><LimitSummary counts={data?.limitCounts ?? []} busy={busy} date={selectedDate} onEvidence={showEvidence} /><Button variant="outline" onClick={() => setRefresh(value => value + 1)} disabled={busy}><RefreshCw size={15} className={busy ? "spin" : ""} />{busy ? "更新中" : "更新数据"}</Button><p className="review-date-hint">点击复盘日历日期，查看当天的市场数据和复盘想法。</p></div>
      <ReviewCalendar date={selectedDate} markedDates={notes.markedDates} onSelect={setDate} note={noteProps} />
    </div>
    {notes.error && <div className="notice error-notice" role="alert">{notes.error}</div>}
    <div className="strategy-bar"><div className="strategy-tabs" aria-label="切换复盘风格">{(Object.keys(STRATEGIES) as Style[]).map(key => <button key={key} className={style === key ? "selected" : ""} aria-pressed={style === key} onClick={() => save({ ...preferences, style: key, updatedAt: new Date().toISOString() })}>{STRATEGIES[key].name}</button>)}</div><span className="data-label"><span />{busy ? "正在请求真实数据" : data?.status === "blocked" || error ? "数据尚未就绪" : style === "value" ? "扶摇 / iFinD · 状态见证据" : "扶摇 · 真实金融数据"}<span className="label-separator">/</span>Asia/Shanghai</span></div>
    {error && <div role="alert" className="notice error-notice"><Info size={17} />{error} 本次未展示旧结果或替代数据。</div>}
    {data?.messages.map(message => <div className="notice" role="status" key={message}><Info size={17} />{message}</div>)}
    <IndexCards indices={data?.indices ?? []} busy={busy} selected={selectedIndexCode} onSelect={setSelectedIndexCode} onEvidence={showEvidence} />
    {style === "value" && <ValueReview data={data} date={selectedDate} busy={busy} watchlist={preferences.watchlist} tracker={hypotheses} onEvidence={showEvidence} />}
    {style==="value"&&!busy&&data&&<IndustryReview data={data} onEvidence={showEvidence}/>}
    <AIReportPanel customInstructions={preferences.reviewMethods?.[preferences.style]??""} conditions={conditions} key={`${selectedDate}|${style}|${symbols}|${reviewConfigurationKey(conditions,preferences.reviewMethods?.[preferences.style])}`} date={selectedDate} style={preferences.style} symbols={preferences.watchlist.map(s=>s.code)} enabled={!busy && !!data && data.style === style && data.date === selectedDate && data.status !== "blocked"} disabledReason={busy ? "正在获取当前日期的数据，请稍候。" : "当前日期的数据尚不可用，无法生成复盘。请查看上方数据提示。"} />
    <div className="dashboard-grid"><div className="main-column">
      <Card className="chart-card"><div className="card-header"><div><span className="section-kicker">MARKET BENCHMARK</span><h2>{activeDefinition.name} <small>{activeDefinition.code} · K线</small></h2></div><div className="period-tabs" aria-label="图表周期">{([ ["day", "日"], ["week", "周"], ["month", "月"] ] as [Period, string][]).map(([value, label]) => <button key={value} className={period === value ? "selected" : ""} aria-pressed={period === value} onClick={() => updatePeriod(value)}>{label}</button>)}</div></div><div className="chart-meta">{MOVING_AVERAGES.map(average => <span key={average.key}><i className="dot" style={{ backgroundColor: average.color }} />{average.label}</span>)}<span className="chart-meta-right">截至 {data?.date || "待确认"} · 单位：点</span></div>{busy ? <div className="chart-loading"><span className="spinner" />正在获取真实行情…</div> : <PriceChart bars={activeIndex?.bars ?? []} period={period} indicatorsComplete={activeIndex?.indicatorsComplete ?? false} name={activeDefinition.name} />}<div className="chart-footnote"><Info size={12} />{period === "day" ? "蜡烛实体为开盘至收盘，上下影线为最高和最低；红色收≥开，绿色收<开。" : "由日 K 聚合，边界周/月可能尚未完成；MA5/10/20/30/60按当前周期计算，样本不足留空。"}</div></Card>
      {style === "short" && <Card className="ladder-card"><div className="card-header"><div><span className="section-kicker">MARKET STRUCTURE</span><h2>连板梯队 <Badge>由高到低 · 有限样本</Badge></h2></div><button className="text-action" disabled={!data?.evidence.some(e => e.id === "ladder")} onClick={() => showEvidence(["ladder"])}>数据口径 <ArrowUpRight size={13} /></button></div>{data?.ladder.some(row => row.stocks.length) ? <div className="ladder-list">{data.ladder.map(row => <div className="ladder-row" key={row.label} data-height={row.height}><span className="board-label">{row.label}</span><div>{row.stocks.map(stock => <button type="button" className="ladder-stock topic-stock" key={stock.name} onClick={() => showEvidence(stock.evidenceIds)} title="查看连板与同日涨停题材来源"><strong>{stock.name}</strong>{" "}<span className={!stock.topic ? "topic-missing" : ""}>{stock.topic ?? "题材暂缺"}</span></button>)}</div></div>)}</div> : <div className="empty-state compact"><ScanLine size={25} /><p>{busy ? "正在检查连板数据…" : "所选日期暂无可展示的连板样本"}</p></div>}<div className="chart-footnote">按高度从高到低展示上游有限样本；题材来自同日涨停原因，缺失时不补写。点击股票可查看来源。</div></Card>}
      <Card className="personal-card"><div className="card-header"><div><span className="section-kicker">PERSONAL FOCUS</span><h2>我的自选 · {definition.name}</h2></div><Link className="text-action" href="/watchlist">管理自选 <ChevronRight size={14} /></Link></div>{preferences.watchlist.length === 0 ? <div className="empty-state compact"><p>还没有自选股。添加公司后，用你的投资视角持续观察。</p><Button asChild variant="outline" size="sm"><Link href="/watchlist">添加自选股 <ArrowRight size={14} /></Link></Button></div> : busy ? <div className="empty-state compact">正在按{definition.name}获取标的数据…</div> : data?.stocks.length ? <div className="personal-stocks">{data.stocks.map(stock => <div className="personal-stock" key={stock.code}><div className="personal-stock-title"><strong>{preferences.watchlist.find(s => s.code === stock.code)?.name ?? stock.name}</strong><small>{stock.code}</small></div><div className="stock-metrics">{stock.metrics.map(item => <div key={item.id}><span>{item.label}</span><button disabled={!item.evidenceIds.length} title={item.note} onClick={() => showEvidence(item.evidenceIds)}><MetricValue item={item} /></button><small>{item.note}</small></div>)}</div></div>)}</div> : <div className="empty-state compact"><p>当前数据不可用，未生成标的分析。</p></div>}</Card>
    </div><aside className="context-column">
      <Card className="daily-notes-card"><ReviewNoteEditor {...noteProps} /></Card>
      <AnomalyAlerts date={selectedDate} symbols={preferences.watchlist.map(s=>s.code)} names={Object.fromEntries(preferences.watchlist.map(s=>[s.code,s.name]))}/>
    </aside></div>
    {data && <details className="data-availability"><summary><ShieldCheck size={14} />数据来源与状态 · {readyCount}项已取得{data.coverage.some(item => item.status !== "ready") ? " · 部分数据未取得" : ""}</summary><div className="coverage-list">{data.coverage.map(item => <div className="coverage-item" key={item.label}><div><span className={`coverage-dot ${item.status}`} /><strong>{item.label}</strong><span className={`coverage-status ${item.status}`}>{item.status === "ready" ? "已取得" : item.status === "empty" ? "无数据" : item.status === "error" ? "获取失败" : "暂不可用"}</span></div><p>{item.reason}</p></div>)}</div></details>}
    {data && <div className="data-footer"><Info size={13} /><span>本次更新：{new Date(data.fetchedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（上海） · 行情数据与程序指标；AI 复盘单独标识推断与证据。</span></div>}
    {selectedEvidence && <EvidenceDialog evidence={selectedEvidence} onClose={() => setSelectedEvidence(null)} />}
  </>;
}
