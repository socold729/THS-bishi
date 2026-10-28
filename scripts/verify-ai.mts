// Real local data verification; live OpenAI call only if privately configured.
import nextEnv from "@next/env";
import { mkdir,writeFile } from "node:fs/promises";
import { buildAnalysisPacket } from "../src/lib/reports/packet";
import { createOpenAIClient } from "../src/lib/reports/openai";
import { validateReport } from "../src/lib/reports/validate";
import { ReportError } from "../src/lib/reports/errors";
import { fixture,mockDraft } from "../tests/fixtures/report-fixture";
import type { DashboardData,Style } from "../src/lib/domain";
nextEnv.loadEnvConfig(process.cwd(),true);
const runStamp=new Date().toISOString().replace(/[:.]/g,"-"),runDirectory=`.cache/ai-verify-${runStamp}`;
await mkdir(runDirectory,{recursive:true});await mkdir("docs/examples",{recursive:true});
const summary:{recordedAt:string;openaiKeyConfigured:boolean;liveModelAttempted:boolean;liveModelSucceeded:boolean;datasets:unknown[];liveError?:unknown;missingKeyRoute?:unknown}={recordedAt:new Date().toISOString(),openaiKeyConfigured:!!process.env.OPENAI_API_KEY?.trim(),liveModelAttempted:false,liveModelSucceeded:false,datasets:[]};
let realPacket:ReturnType<typeof buildAnalysisPacket>|undefined;
for(const style of ["short","swing","value"] as Style[]) {
  try {
    const response=await fetch(`http://127.0.0.1:3000/api/dashboard?style=${style}&symbols=600519.SH`,{signal:AbortSignal.timeout(65000)});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data:DashboardData=await response.json();const packet=buildAnalysisPacket(data);
    summary.datasets.push({style,date:data.date,status:data.status,evidenceCount:packet.evidence.length,fields:[...new Set(packet.evidence.map(e=>e.field))],limitations:packet.limitations,previousLadderDate:data.previousLadder?.date ?? null});
    if(!realPacket)realPacket=packet;
    await writeFile(`${runDirectory}/${style}-real-packet.json`,JSON.stringify(packet,null,2));
  }catch(error){summary.datasets.push({style,success:false,error:error instanceof ReportError ? error.code : "LOCAL_DATA_FAILURE"});}
}
if(summary.openaiKeyConfigured && realPacket) {
  summary.liveModelAttempted=true;
  try {
    const result=await createOpenAIClient({apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL})(realPacket);
    await writeFile(`${runDirectory}/live-raw.json`,JSON.stringify(result,null,2));
    const report=validateReport(result.raw,realPacket,result.model,result.responseId);
    await writeFile(`${runDirectory}/live-report.json`,JSON.stringify(report,null,2));summary.liveModelSucceeded=true;
  }catch(error){summary.liveError=error instanceof ReportError ? {code:error.code,message:error.message} : {code:"LIVE_CALL_FAILED"};}
}else if(!summary.openaiKeyConfigured){
  const response=await fetch("http://127.0.0.1:3000/api/reports",{method:"POST",headers:{"Content-Type":"application/json","X-Review-Session":crypto.randomUUID(),"X-Review-Task":crypto.randomUUID()},body:JSON.stringify({date:realPacket?.date || "2026-10-27",style:"short",symbols:[]})});
  const task=await response.json();summary.missingKeyRoute={httpStatus:response.status,status:task.status,errorCode:task.errorCode};
}
for(const style of ["short","swing","value"] as Style[]) {
  const packet=buildAnalysisPacket(fixture(style));const report=validateReport(mockDraft(packet),packet,"EXPLICIT_TEST_MODEL_MOCK","NOT_A_REAL_OPENAI_CALL");
  await writeFile(`docs/examples/${style}-mock-review-${runStamp}.json`,JSON.stringify({warning:"仅为明确构造数据和模型Mock生成的测试示例，不是真实AI金融分析，不在产品中预置。",report},null,2));
}
await writeFile(`docs/evidence/${runStamp}-ai-data-and-model-check.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({keyConfigured:summary.openaiKeyConfigured,liveModelAttempted:summary.liveModelAttempted,liveModelSucceeded:summary.liveModelSucceeded,datasets:summary.datasets.map(d=>{const x=d as {style:string;evidenceCount?:number;error?:string};return {style:x.style,evidenceCount:x.evidenceCount,error:x.error};}),missingKeyRoute:summary.missingKeyRoute,liveError:summary.liveError},null,2));
