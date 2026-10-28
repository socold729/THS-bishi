import { NextResponse } from "next/server";
import { z } from "zod";
import { loadDashboard } from "@/lib/finance/dashboard";
import { createOpenAIClient,createReviewPlanner } from "@/lib/reports/openai";
import { reportRequestSchema } from "@/lib/reports/schema";
import { ReportTaskStore } from "@/lib/reports/tasks";
import { ReportError } from "@/lib/reports/errors";
import { isSameOrigin, reviewSessionSchema } from "@/lib/reports/request-security";

export const runtime="nodejs";
export const maxDuration=180;
const root=globalThis as typeof globalThis & { mingriReportTasks?:ReportTaskStore };
const store=root.mingriReportTasks ??=new ReportTaskStore();
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
function owner(request:Request) { return reviewSessionSchema.safeParse(request.headers.get("X-Review-Session")); }
export async function POST(request:Request) {
  const session=owner(request);
  if(!session.success) return json({error:"复盘会话无效，请刷新页面。",code:"SESSION_INVALID"},403);
  if(!isSameOrigin(request)) return json({error:"请求来源与当前访问地址不一致，请从当前页面重新尝试。",code:"ORIGIN_MISMATCH"},403);
  try {
    if(Number(request.headers.get("content-length"))>8192) return json({error:"请求过大。"},413);
    const input=reportRequestSchema.safeParse(await request.json());
    if(!input.success) return json({error:"复盘日期、策略或自选股参数无效。"},400);
    const id=z.uuid().safeParse(request.headers.get("X-Review-Task"));
    if(!id.success) return json({error:"任务标识无效，请重新生成。"},400);
    const result=store.start(session.data,input.data,{configured:!!process.env.OPENAI_API_KEY?.trim(),load:loadDashboard,plan:createReviewPlanner({apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL}),analyze:createOpenAIClient({apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL,timeoutMs:Math.min(60000,Math.max(1000,Number(process.env.OPENAI_TIMEOUT_MS)||45000))})},id.data);
    if(!result.created) return json(result.task,202);
    return json(await result.promise);
  } catch(error) { return json({error:error instanceof ReportError ? error.message : "复盘请求处理失败。"},error instanceof ReportError && error.code === "TASK_BUSY" ? 409 : 400); }
}
export async function GET(request:Request) {
  const session=owner(request);
  if(!session.success) return json({error:"复盘会话无效。"},403);
  const task=store.get(session.data,new URL(request.url).searchParams.get("id") ?? "");
  return task ? json(task) : json({error:"任务已失效或不属于当前会话，请重新生成。"},404);
}
export async function DELETE(request:Request) {
  const session=owner(request);
  if(!session.success) return json({error:"复盘会话无效。",code:"SESSION_INVALID"},403);
  if(!isSameOrigin(request)) return json({error:"请求来源与当前访问地址不一致。",code:"ORIGIN_MISMATCH"},403);
  const input=reportRequestSchema.safeParse(await request.json().catch(()=>null));
  if(!input.success) return json({error:"取消任务参数无效。"},400);
  store.cancel(session.data,input.data); return json({cancelled:true});
}
