"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, X, ArrowUpRight } from "lucide-react";
import { STRATEGIES, type Style } from "@/lib/domain";
import type { ReportClaim, ReportEvidence, ReportTask, TaskPhase } from "@/lib/reports/types";
import { evidenceText } from "@/lib/reports/validate";
import { getReviewSession } from "@/lib/reports/request-security";
import { type HypothesisCondition } from "@/lib/investment-hypotheses";
import {reviewConfigurationKey,defaultPlan}from"@/lib/reports/plan";
import{readArchive,saveBrowserArchive}from"@/lib/report-archive";
import{usePreferences}from"./providers";
import{ReportContent}from"./report-content";
import type{Preferences}from"@/lib/domain";
import Link from"next/link";
import { Card } from "./ui/card";
import { Button } from "./ui/button";

const phases:Record<TaskPhase,string>={fetching:"正在核对金融数据…",analyzing:"AI 正在整理当前风格的复盘…",validating:"正在核对证据与分析边界…",completed:"复盘已完成",failed:"生成失败",cancelled:"任务已取消"};
const inProgress=(status?:TaskPhase)=>!!status && ["fetching","analyzing","validating"].includes(status);
export function AIReportPanel({date,style,symbols,enabled,disabledReason,conditions=[],customInstructions=""}:{customInstructions?:string;date:string;style:Style;symbols:string[];enabled:boolean;disabledReason:string;conditions?:HypothesisCondition[]}) {
  const [task,setTask]=useState<ReportTask|null>(null), [error,setError]=useState("");
  const{preferences}=usePreferences();
  const generationPreferences=useRef<Preferences|null>(null);
  const[savedReportId,setSavedReportId]=useState(""),[savingArchive,setSavingArchive]=useState(false),[archiveError,setArchiveError]=useState("");
  const controller=useRef<AbortController|null>(null), locked=useRef(false), mounted=useRef(true), session=useRef("");
  const symbolsKey=[...symbols].sort().join(",");
  const conditionsKey=reviewConfigurationKey(conditions,customInstructions);
  useEffect(()=>{
    mounted.current=true;
    return ()=>{
      mounted.current=false; controller.current?.abort();
      if(locked.current && session.current) void fetch("/api/reports",{method:"DELETE",headers:{"Content-Type":"application/json","X-Review-Session":session.current},body:JSON.stringify({date,style,symbols:symbolsKey.split(",").filter(Boolean),...(conditions.length?{hypotheses:conditions}:{}),...(customInstructions.trim()?{customInstructions:customInstructions.trim()}:{})}),keepalive:true}).catch(()=>{});
    };
  },[date,style,symbolsKey,conditionsKey]);
  const accept=(result:ReportTask)=>{
    if(!mounted.current || controller.current?.signal.aborted) return;
    if(result.date!==date || result.style!==style || [...result.symbols].sort().join(",")!==symbolsKey) throw new Error("报告日期、投资风格或自选范围不匹配，已停止展示。");
    if(result.report && (result.report.date!==date || result.report.style!==style || [...result.report.symbols].sort().join(",")!==symbolsKey)) throw new Error("报告正文与当前日期或风格不匹配，已停止展示。");
    if((conditions.length||customInstructions.trim()) && (result.configurationKey!==conditionsKey || (result.report&&result.report.configurationKey!==conditionsKey)))throw new Error("报告与当前自定义复盘或投资假设配置不匹配，已停止展示。");
    setTask(result);
  };
  async function generate() {
    if(locked.current || !enabled) return;
    locked.current=true; setError("");setArchiveError("");setSavedReportId("");generationPreferences.current=preferences?structuredClone(preferences):null;
    const abort=new AbortController(); controller.current=abort;
    const input={date,style,symbols,...(conditions.length?{hypotheses:conditions}:{}),...(customInstructions.trim()?{customInstructions:customInstructions.trim()}:{})}, id=crypto.randomUUID();
    try {
      session.current=getReviewSession(sessionStorage);
      setTask({id,...input,status:"fetching",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      const headers={"Content-Type":"application/json","X-Review-Session":session.current,"X-Review-Task":id};
      let pollBusy=false;
      const timer=setInterval(async()=>{
        if(pollBusy || abort.signal.aborted) return;
        pollBusy=true;
        try {const response=await fetch(`/api/reports?id=${id}`,{headers,signal:abort.signal}); if(response.ok) accept(await response.json());} catch {} finally {pollBusy=false;}
      },900);
      let result:ReportTask;
      try {
        const response=await fetch("/api/reports",{method:"POST",headers,body:JSON.stringify(input),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(160000)])});
        const body=await response.json(); if(!response.ok) throw new Error(body.error || "复盘请求失败，请重试。");
        result=body;
      } finally {clearInterval(timer);}
      const deadline=Date.now()+160000;
      while(inProgress(result.status) && !abort.signal.aborted) {
        if(Date.now()>deadline) throw new Error("等待复盘超时，请稍后重试。");
        accept(result); await new Promise(resolve=>setTimeout(resolve,900));
        const response=await fetch(`/api/reports?id=${result.id}`,{headers,signal:abort.signal});
        if(!response.ok) throw new Error("复盘任务已失效，请重新生成。"); result=await response.json();
      }
      accept(result);
    } catch(cause) {
      if(mounted.current && !abort.signal.aborted) {setError(cause instanceof Error ? cause.message : "复盘生成失败。");setTask(null);}
    } finally {locked.current=false;}
  }
  const report=task?.status === "completed" ? task.report : null;
  const busy=inProgress(task?.status);
  useEffect(()=>{if(!report)return;try{if(readArchive(localStorage).entries.some(e=>e.report.id===report.id&&e.report.responseId===report.responseId))setSavedReportId(report.id);}catch{}},[report]);
  async function saveReport(){if(!report||savingArchive||savedReportId===report.id)return;setSavingArchive(true);setArchiveError("");try{await saveBrowserArchive(report,generationPreferences.current,{style,symbols:[...symbols],customInstructions,hypotheses:structuredClone(conditions),plan:report.configurationSnapshot?.plan??defaultPlan(style)});setSavedReportId(report.id);}catch{setArchiveError("保存到复盘档案失败，报告尚未保存。可能是存储已满、不可用或档案损坏；当前报告仍保留在页面。");}finally{setSavingArchive(false);}}
  return <Card className="ai-review-panel" id="ai-review"><div className="card-header"><div><span className="section-kicker">PERSONAL AI REVIEW</span><h2><Sparkles size={17}/> AI 个性化复盘</h2><p className="report-context">{date || "待确认日期"} · {STRATEGIES[style].name} · {symbols.length ? `${symbols.length}只自选` : "尚无自选"}</p></div><Button onClick={generate} disabled={!enabled || busy}>{busy ? <><span className="spinner"/>生成中…</> : report ? "重新生成 AI 复盘" : "生成 AI 复盘"}</Button></div>
    {!enabled && !busy && <p className="report-no-data">{disabledReason}</p>}
    {busy && <p className="report-progress" role="status">{phases[task!.status]}切换日期或策略会取消本次任务。</p>}
    {(error || task?.status === "failed") && <div className="notice error-notice" role="alert">{error || task?.error}</div>}
    {!report && !busy && !error && task?.status!=="failed" && <p className="report-intro">按当前日期和投资风格独立获取真实数据，核对引用后生成。事实与推断分开展示；个人笔记不会发送给模型。</p>}
    {report&&<><div className="report-save-actions"><Button variant="outline" disabled={savingArchive||savedReportId===report.id} onClick={saveReport}>{savedReportId===report.id?"已保存":savingArchive?"保存中…":"保存到复盘档案"}</Button><Link href="/reports" className="text-action">查看复盘档案 ↗</Link><small>仅存当前浏览器，清除浏览器数据会丢失，不跨设备同步。</small></div>{archiveError&&<div role="alert" className="notice error-notice">{archiveError}</div>}<ReportContent report={report}/></>}
  </Card>;
}
