"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Trash2, ListPlus } from "lucide-react";
import { usePreferences } from "./providers";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
interface SymbolItem { code: string; name: string }
export function Watchlist() {
  const { preferences, hydrated, save } = usePreferences();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!hydrated) return <p>正在读取自选股…</p>;
  async function search(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setResults([]); setMessage("");
    try { const response = await fetch(`/api/symbols?q=${encodeURIComponent(query.trim())}`); const json = await response.json(); if (!response.ok) throw new Error(json.error); setResults(json.items); if (!json.items.length) setMessage("没有找到对应 A 股标的，请核对名称或完整代码。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "检索失败，请稍后重试。"); }
    finally { setBusy(false); }
  }
  return <><div className="page-heading"><div><span className="eyebrow">YOUR RESEARCH UNIVERSE</span><h1>只关注，你想理解的公司。</h1><p>手动管理复盘范围。当前每次最多分析 3 只自选股，降低信息噪音与数据等待。</p></div><Badge>{preferences?.watchlist.length ?? 0} / 3 只</Badge></div>
    {!preferences ? <div className="notice">请先<Button asChild variant="ghost"><Link href="/settings">设置投资风格</Link></Button>再添加自选股。</div> : <>
      <Card className="search-card"><form onSubmit={search} className="search-form"><Search size={19} /><label className="sr-only" htmlFor="symbol-search">股票名称或完整代码</label><input id="symbol-search" placeholder="输入股票名称或代码，例如 600519.SH" value={query} onChange={e => setQuery(e.target.value)} maxLength={40} required /><Button type="submit" disabled={busy || !query.trim()}>{busy ? "检索中…" : "搜索标的"}</Button></form><span className="helper">通过扶摇标的检索确认证券身份；不会猜测交易所或创建虚构公司。</span></Card>
      {message && <p className="notice" role="status">{message}</p>}
      {results.length > 0 && <Card className="search-results"><h3>检索结果 <small>来源：扶摇 · A 股标的检索</small></h3>{results.map(item => <div className="watchlist-row" key={item.code}><div><strong>{item.name}</strong><small>{item.code}</small></div><Button variant="outline" size="sm" disabled={preferences.watchlist.length >= 3 || preferences.watchlist.some(stock => stock.code === item.code)} onClick={() => { if (save({ ...preferences, watchlist: [...preferences.watchlist, item], updatedAt: new Date().toISOString() })) { setMessage(`已添加 ${item.name}`); } }}><Plus size={14} />{preferences.watchlist.some(s => s.code === item.code) ? "已添加" : "加入自选"}</Button></div>)}</Card>}
      <Card className="watchlist-card"><div className="card-header"><h2>我的自选股</h2><span>配置保存在当前浏览器</span></div>{preferences.watchlist.length === 0 ? <div className="empty-state"><ListPlus size={34} /><h3>从第一家公司开始</h3><p>搜索并添加标的，Dashboard 就能展示对应策略的数据与指标。</p></div> : preferences.watchlist.map(item => <div className="watchlist-row" key={item.code}><div className="stock-identity"><span className="stock-initial">{item.name.slice(0, 1)}</span><span><strong>{item.name}</strong><small>{item.code}</small></span></div><Button variant="ghost" size="icon" aria-label={`删除${item.name}`} onClick={() => { if (save({ ...preferences, watchlist: preferences.watchlist.filter(s => s.code !== item.code), updatedAt: new Date().toISOString() })) setMessage(`已删除 ${item.name}`); }}><Trash2 size={16} /></Button></div>)}</Card>
    </>}
  </>;
}
