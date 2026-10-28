import { randomUUID } from "node:crypto";
import type { DashboardData } from "../domain";
import type { z } from "zod";
import type { reportRequestSchema } from "./schema";
import { ReportError } from "./errors";
import { buildAnalysisPacket } from "./packet";
import { validateReport } from "./validate";
import type { AnalysisPacket, ReportTask, TaskPhase } from "./types";
import { hypothesisKey } from "../investment-hypotheses";
import {defaultPlan,reviewConfigurationKey,type ReviewPlan}from"./plan";

export type ReportRequest = z.infer<typeof reportRequestSchema>;
export const contextKey = (input: ReportRequest) => `${input.date}|${input.style}|${[...input.symbols].sort().join(",")}|${reviewConfigurationKey(input.hypotheses,input.customInstructions)}`;
interface Entry { owner: string; key: string; task: ReportTask; controller: AbortController; promise: Promise<ReportTask> }
export interface ReportServices {
  configured: boolean;
  load: (style: ReportRequest["style"], date: string, symbols: string[], signal: AbortSignal,plan?:ReviewPlan) => Promise<DashboardData>;
  plan?: (style:ReportRequest["style"],preference:string,signal:AbortSignal)=>Promise<ReviewPlan>;
  analyze: (packet: AnalysisPacket, signal: AbortSignal) => Promise<{raw:unknown;model:string;responseId:string}>;
}
const active = (phase: TaskPhase) => ["fetching","analyzing","validating"].includes(phase);

// Local MVP: bounded in-memory tasks, not durable storage or a cross-instance lock.
export class ReportTaskStore {
  private entries = new Map<string, Entry>();
  get(owner: string, id: string) { const entry=this.entries.get(id); return entry?.owner === owner ? entry.task : undefined; }
  cancel(owner: string, input: ReportRequest) {
    for (const entry of this.entries.values()) if (entry.owner === owner && entry.key === contextKey(input) && active(entry.task.status)) {
      entry.controller.abort(); entry.task.status="cancelled"; entry.task.updatedAt=new Date().toISOString(); entry.task.error="日期或策略已切换，本次任务已取消。";
    }
  }
  start(owner: string, input: ReportRequest, services: ReportServices, taskId: string = randomUUID()) {
    const key=contextKey(input), now=Date.now();
    const existing=this.entries.get(taskId);
    if(existing) {
      if(existing.owner !== owner || existing.key !== key) throw new ReportError("TASK_CONFLICT", "任务标识不匹配，请重新生成。");
      return {created:false,task:existing.task,promise:existing.promise};
    }
    for (const [id,entry] of this.entries) if (!active(entry.task.status) && now-Date.parse(entry.task.updatedAt)>15*60_000) this.entries.delete(id);
    for (const entry of this.entries.values()) if (entry.owner === owner && active(entry.task.status)) {
      if (entry.key === key) return {created:false, task:entry.task, promise:entry.promise};
      throw new ReportError("TASK_BUSY", "已有复盘任务进行中，请等待取消完成后重试。");
    }
    if ([...this.entries.values()].filter(e=>active(e.task.status)).length >= 4) throw new ReportError("TASK_BUSY", "复盘任务繁忙，请稍后重试。");
    if (this.entries.size >= 64) {
      const oldest=[...this.entries].find(([,e])=>!active(e.task.status));
      if(oldest) this.entries.delete(oldest[0]);
    }
    const controller=new AbortController();
    const task:ReportTask={id:taskId,...input,configurationKey:reviewConfigurationKey(input.hypotheses,input.customInstructions),status:"fetching",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    const entry:Entry={owner,key,task,controller,promise:Promise.resolve(task)};
    this.entries.set(task.id,entry);
    const update=(status:TaskPhase)=>{ controller.signal.throwIfAborted(); task.status=status; task.updatedAt=new Date().toISOString(); };
    entry.promise=(async()=>{
      // Hard task budget applies to both data loading and model execution.
      const timer=setTimeout(()=>controller.abort(new Error("TASK_TIMEOUT")),135_000);
      try {
        if (!services.configured) throw new ReportError("OPENAI_NOT_CONFIGURED", "尚未配置 OpenAI 密钥。请在服务端 .env.local 设置 OPENAI_API_KEY 并重启服务。");
        const custom=input.customInstructions?.trim()??"";
        if(custom&&!services.plan)throw new ReportError("CUSTOM_PLAN_FAILED","自定义复盘规划器未配置，未回退默认报告。");
        const plan=custom?await services.plan!(input.style,custom,controller.signal):defaultPlan(input.style);
        const data=await services.load(input.style,input.date,input.symbols,controller.signal,plan);
        controller.signal.throwIfAborted();
        if (data.date !== input.date || data.style !== input.style || data.stocks.some(s=>!input.symbols.includes(s.code)) || input.symbols.some(s=>!data.stocks.some(row=>row.code===s))) throw new ReportError("CONTEXT_MISMATCH", "数据日期、策略或自选范围不匹配，未交给 AI 分析。");
        const packet=buildAnalysisPacket(data,input.hypotheses,plan);
        packet.configurationKey=reviewConfigurationKey(input.hypotheses,custom);
        packet.configurationSnapshot={style:input.style,symbols:[...input.symbols],customInstructions:custom,hypotheses:structuredClone(input.hypotheses??[]),plan:structuredClone(plan)};
        update("analyzing");
        const result=await services.analyze(packet,controller.signal);
        update("validating");
        const report=validateReport(result.raw,packet,result.model,result.responseId);
        controller.signal.throwIfAborted(); task.report=report; update("completed");
      } catch(error) {
        delete task.report;
        if(task.status !== "cancelled") {
          task.status="failed";
          task.errorCode=error instanceof ReportError ? error.code : controller.signal.aborted ? "TASK_TIMEOUT" : "REPORT_FAILED";
          task.error=error instanceof ReportError ? error.message : controller.signal.aborted ? "本次复盘等待超时，请稍后重试。" : "复盘处理失败，未展示未验证结果。";
        }
        task.updatedAt=new Date().toISOString();
      } finally { clearTimeout(timer); }
      return task;
    })();
    return {created:true,task,promise:entry.promise};
  }
}
