"use client";
import { ArrowDown, ArrowUp, ArrowUpRight, Database } from "lucide-react";
import { MARKET_INDICES, type MarketIndex, type Metric } from "@/lib/domain";
import { formatNumber } from "@/lib/utils";
import { Card } from "./ui/card";

export function LimitSummary({ counts, busy, date, onEvidence }: { counts: Metric[]; busy: boolean; date: string; onEvidence: (ids: string[]) => void }) {
  return <div className="limit-summary" aria-label="涨跌停家数">
    <h1 className="sr-only">当日涨跌停家数</h1>
    <span className="eyebrow">DAILY LIMIT-UP / LIMIT-DOWN</span>
    <div className="limit-counts">{["limit-up-pool", "limit-down-pool"].map((id, i) => {
      const item = counts.find(count => count.id === id);
      return <button key={id} className={`limit-count ${i === 0 ? "positive" : "negative"}`} onClick={() => onEvidence(item?.evidenceIds ?? [])} disabled={!item?.evidenceIds.length || busy} aria-label={`查看${i === 0 ? "涨停" : "跌停"}家数证据`}>
        <span>{i === 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}{i === 0 ? "涨停" : "跌停"}</span>
        <strong>{busy ? "…" : formatNumber(item?.value ?? null, 0)}<small>家</small></strong>
      </button>;
    })}</div>
    <p>{date || "交易日待确认"} · 股票池统计，不代表全市场涨跌家数</p>
  </div>;
}

export function IndexCards({ indices, busy, selected, onSelect, onEvidence }: { indices: MarketIndex[]; busy: boolean; selected: string; onSelect: (code: string) => void; onEvidence: (ids: string[]) => void }) {
  return <>{!busy && indices.length === 0 && <p className="notice">等待可核验的市场数据，当前未使用示例数值。</p>}
    <div className="metrics-grid index-cards" aria-label="四大指数" aria-busy={busy}>{MARKET_INDICES.map(definition => {
      const index = indices.find(item => item.code === definition.code);
      const change = index?.changePercent ?? null;
      return <Card className={`metric-card index-card ${selected === definition.code ? "selected" : ""}`} key={definition.code}>
        <button type="button" className="index-select" aria-label={`查看${definition.name}K线`} aria-pressed={selected === definition.code} onClick={() => onSelect(definition.code)}>
          <div className="metric-label">{definition.name}{definition.code === "000680.SH" && <small>科创板</small>}<span className="index-code">{definition.code}</span></div>
          <span className={`metric-value ${change === null ? "" : change >= 0 ? "positive" : "negative"}`}>{busy ? "…" : formatNumber(index?.close ?? null)}<small>{!busy && index?.close !== null && index?.close !== undefined ? "点" : ""}</small></span>
          <div className={`index-change ${change === null ? "" : change >= 0 ? "positive" : "negative"}`}>{change !== null && !busy && (change >= 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}<strong>{busy ? "更新中…" : change === null ? "涨跌幅不可用" : `${change > 0 ? "+" : ""}${formatNumber(change)}%`}</strong><span>日涨跌</span></div>
        </button>
        <div className="index-card-footer"><button className="evidence-link" disabled={busy || !index?.evidenceIds.length} onClick={() => onEvidence(index?.evidenceIds ?? [])}><Database size={11} />查看原始证据<ArrowUpRight size={11} /></button><span>{selected === definition.code ? "正在查看 K 线" : "点击查看 K 线"}</span></div>
      </Card>;
    })}</div>
  </>;
}
