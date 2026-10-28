"use client";
import{useEffect,useRef,useState}from"react";import{ArrowUpRight,X}from"lucide-react";
import type{ReviewReport,ReportEvidence,ReportClaim}from"@/lib/reports/types";
import{evidenceText}from"@/lib/reports/validate";import{Button}from"./ui/button";
export function ReportContent({report}:{report:ReviewReport}) {
  const[evidence,setEvidence]=useState<ReportEvidence|null>(null);
  const claims=(items:ReportClaim[])=>items.length?<div className="report-claims">{items.map((item,i)=><article key={i} className={`report-claim ${item.kind}`}><span className="claim-kind">{item.kind==="fact"?"事实 · 字段已核对":item.kind==="inference"?"AI 推断 · 待验证":"不确定性"}</span><p>{item.text}</p>{item.kind!=="fact"&&item.values.length>0&&<p className="claim-figures">引用数据 · 字段已核对：{item.values.map(v=>`${v.value} ${v.unit}`).join(" · ")}</p>}<div className="claim-citations">{item.evidence_ids.map((id,index)=><button key={id} onClick={()=>setEvidence(report.evidence.find(e=>e.id===id)??null)}>证据 {index+1}<ArrowUpRight size={11}/></button>)}</div></article>)}</div>:<p className="report-no-data">本次模型未输出独立结论。</p>;
  return <div className="generated-report"><div className="report-provenance"><span>{report.partial?"部分数据可用 · 已列明限制":"生成完成"}</span><span>{report.model} · {new Date(report.generatedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false})}（上海）</span></div>
    {!!report.summary.length&&<section><h3>{report.style==="swing"?"核心结论":"今日核心总结"}</h3>{claims(report.summary)}</section>}
    {!!report.observations.length&&<section><h3>重要市场观察</h3>{claims(report.observations)}</section>}
    <div className="report-specialist">{report.specialist.filter(s=>s.items.length).map(section=><section key={section.key}><h3>{section.title}</h3>{claims(section.items)}</section>)}</div>
    {report.watchlist.some(s=>s.items.length>0)&&<section><h3>自选股分析</h3>{report.watchlist.filter(s=>s.items.length).map(stock=><div className="report-watch-stock" key={stock.subject}><h4>{stock.subject}</h4>{claims(stock.items)}</div>)}</section>}
    {!!report.risks.length&&<section><h3>风险及后续观察</h3>{claims(report.risks)}</section>}
    <details className="report-limitations"><summary>本次数据边界与缺失项{report.limitations.length?` · ${report.limitations.length}项`:''}</summary><ul>{report.limitations.map((item,i)=><li key={i}>{item}</li>)}</ul></details>
    {!!report.deduplicatedCount&&<p className="helper">已合并 {report.deduplicatedCount} 项重复引用或高度近似内容，独立结论保留。</p>}
    <p className="helper">事实来自当前证据字段；AI 推断未经独立事实核验。复盘仅用于信息整理，不构成投资建议。</p>
    {evidence&&<EvidenceDetail evidence={evidence} onClose={()=>setEvidence(null)}/>}
  </div>;
}
function EvidenceDetail({evidence,onClose}:{evidence:ReportEvidence;onClose:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} className="evidence-dialog report-evidence" aria-label="AI报告证据详情" onClose={onClose} onClick={e=>{if(e.target===ref.current)ref.current.close();}}><div className="evidence-dialog-header"><h2>复盘证据</h2><Button variant="ghost" size="icon" aria-label="关闭报告证据" onClick={()=>ref.current?.close()}><X size={18}/></Button></div><p>{evidenceText(evidence)}</p><dl><dt>唯一证据 ID</dt><dd>{evidence.id}</dd><dt>报告日期 / 数据日期</dt><dd>{evidence.date} / {evidence.observedDate}</dd><dt>对象 / 字段</dt><dd>{evidence.subject} / {evidence.field}</dd><dt>数值 / 单位</dt><dd>{evidence.value} / {evidence.unit}</dd><dt>统计口径</dt><dd>{evidence.scope}</dd><dt>计算规则</dt><dd>{evidence.formula}</dd></dl>{evidence.sources.map((s,i)=><dl key={i}><dt>数据来源</dt><dd>{s.source} · {s.endpoint}</dd><dt>取数时间</dt><dd>{s.fetchedAt}</dd><dt>供应商时间</dt><dd>{s.sourceTime?new Date(s.sourceTime).toISOString():"未返回"}</dd><dt>请求标识</dt><dd>{s.requestId??"未返回"}</dd></dl>)}<p className="helper">字段核对不等于独立数源对账。</p></dialog>;
}
