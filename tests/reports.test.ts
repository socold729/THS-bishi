import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAnalysisPacket } from "../src/lib/reports/packet";
import { validateReport } from "../src/lib/reports/validate";
import { createOpenAIClient } from "../src/lib/reports/openai";
import { ReportTaskStore, type ReportServices } from "../src/lib/reports/tasks";
import { ReportError } from "../src/lib/reports/errors";
import { dateMs } from "../src/lib/dates";
import type { Style } from "../src/lib/domain";
import { fixture, mockDraft } from "./fixtures/report-fixture";

const input={date:"2026-10-27",style:"short" as Style,symbols:["600519.SH"]};
const packet=()=>buildAnalysisPacket(fixture("short"));
const validate=(draft:unknown,p=packet())=>validateReport(draft,p,"explicit-model-mock","mock-response");
const hasCode=(code:string)=>(error:unknown)=>error instanceof ReportError && error.code===code;
const services=(style:Style):ReportServices=>({configured:true,load:async()=>fixture(style),analyze:async p=>({raw:mockDraft(p),model:"explicit-model-mock",responseId:"mock-response"})});

test("explicit mocks: three strategies generate distinct data packets and report structures",async()=>{
  const packets=["short","swing","value"].map(style=>buildAnalysisPacket(fixture(style as Style)));
  assert.ok(packets[0].evidence.some(e=>e.field==="sample-height-change"));
  assert.ok(packets[0].evidence.some(e=>e.field==="topic-sample-count"));
  assert.ok(packets[1].evidence.some(e=>e.field==="week-MA10"));
  assert.ok(packets[1].evidence.some(e=>e.field==="relative-daily"));
  assert.ok(packets[2].evidence.some(e=>e.field==="income-0-operating_income"));
  assert.ok(!packets[2].evidence.some(e=>e.field.includes("MA")||e.field==="pe"));
  const sections=[];
  for(const style of ["short","swing","value"] as Style[]) {
    const job=new ReportTaskStore().start("owner",{...input,style},services(style));
    const done=await job.promise; assert.equal(done.status,"completed");
    assert.ok([...done.report!.summary,...done.report!.specialist.flatMap(s=>s.items)].some(c=>c.validation==="matched_data")); sections.push(done.report!.specialist.map(s=>s.key).join(","));
  }
  assert.equal(new Set(sections).size,3);
});
test("unknown citation cannot become a verified fact",()=>{
  const p=packet(),draft=mockDraft(p); draft.summary[0].evidence_ids=["invented"];
  assert.throws(()=>validate(draft,p),hasCode("CITATION_INVALID"));
  const duplicate=mockDraft(p);duplicate.summary[0].evidence_ids.push(duplicate.summary[0].evidence_ids[0]);assert.throws(()=>validate(duplicate,p),hasCode("CITATION_INVALID"));
});
test("changed price and unit are rejected against source evidence",()=>{
  for(const mode of ["value","unit"]) {const p=packet(),d=mockDraft(p); if(mode==="value")d.summary[0].values[0].value=999999;else d.summary[0].values[0].unit="万美元"; assert.throws(()=>validate(d,p),hasCode("VALUE_MISMATCH"));}
});
test("same numeric value from the wrong date or subject is rejected",()=>{
  for(const mode of ["date","subject","future"]) {const p=packet(),d=mockDraft(p),e=p.evidence.find(e=>e.id===d.summary[0].evidence_ids[0])!; if(mode==="date")e.date="2026-10-26";else if(mode==="subject")e.subject="other";else e.observedDate="2026-10-28"; assert.throws(()=>validate(d,p),hasCode("EVIDENCE_CONTEXT"));}
});
test("report context cannot differ from date, style or watchlist",()=>{
  const p=packet(); const d=mockDraft(p); d.date="2026-10-26"; assert.throws(()=>validate(d,p),hasCode("CONTEXT_MISMATCH"));
  d.date=p.date;d.watchlist[0].subject="000001.SH";assert.throws(()=>validate(d,p),hasCode("SUBJECT_MISMATCH"));
});
test("model prose cannot be labeled a verified fact; unbound numbers are rejected",()=>{
  const p=packet(),d=mockDraft(p);d.summary[0].narrative="公司经营持续改善";assert.throws(()=>validate(d,p),hasCode("FACT_UNVERIFIED"));
  d.summary[0]={...d.summary[0],kind:"inference",narrative:"可能上涨99%"};assert.throws(()=>validate(d,p),hasCode("UNBOUND_VALUE"));
});
test("forecasts, return promises and trade instructions are blocked",()=>{
  for(const text of ["明日一定上涨","明日将上涨","明天肯定反弹","保证收益","稳赚保本","建议买入","立即卖出","可以加仓","目标价待验证","buy now"]) {
    const p=packet(),d=mockDraft(p);d.risks[0].narrative=text;assert.throws(()=>validate(d,p),hasCode("COMPLIANCE_REJECTED"));
  }
});
test("price movement alone cannot support an invented event cause",()=>{
  const p=packet(),d=mockDraft(p);d.risks[0].narrative="可能由于政策导致上涨";assert.throws(()=>validate(d,p),hasCode("CAUSAL_REJECTED"));
});
test("denying knowledge of a price cause is uncertainty, not an invented attribution",()=>{
  const p=packet(),d=mockDraft(p);
  d.risks[0].narrative="高位候选仅来自有限样本，无法确认全市场龙头地位或后续延续性。供应商题材归类不能证明上涨原因，题材词频也不能代表板块收益或全市场强度。";
  assert.equal(validate(d,p).risks[0].kind,"uncertainty");
  for(const narrative of ["无法判断下跌的原因，仍需要后续证据。","供应商题材标签不足以确认实际上涨原因，仍需公告核验。","不足以确认实际上涨原因，但由于政策导致上涨。","不能证明上涨原因，但由于政策导致上涨。","无法确认上涨原因；利好推动股价上涨，仍待验证。"]){
    d.risks[0].narrative=narrative;
    if(narrative.includes("无法判断下跌")||narrative.startsWith("供应商题材标签不足以确认实际"))assert.equal(validate(d,p).risks[0].kind,"uncertainty");
    else assert.throws(()=>validate(d,p),hasCode("CAUSAL_REJECTED"));
  }
});
test("unsupported industry/event and topic inferences are rejected without matching datasets",()=>{
  for(const [narrative,code] of [["政策可能改善行业景气","UNSUPPORTED_EVENT"],["热点题材可能继续扩散","UNSUPPORTED_TOPIC"]]) {
    const p=packet(),d=mockDraft(p);d.summary[0]={...d.summary[0],kind:"inference",narrative};assert.throws(()=>validate(d,p),hasCode(code));
  }
});
test("value reports require watchlist financial evidence rather than generic index facts",()=>{
  const noWatch=fixture("value");noWatch.stocks=[];assert.throws(()=>buildAnalysisPacket(noWatch),hasCode("WATCHLIST_REQUIRED"));
  const missing=fixture("value");missing.stocks[0].metrics=[];missing.evidence=missing.evidence.filter(e=>!e.id.startsWith("income-")&&!e.id.startsWith("cash-"));assert.throws(()=>buildAnalysisPacket(missing),hasCode("NO_EVIDENCE"));
});
test("stale latest annual financials cannot be presented as current fundamental analysis",()=>{
  const data=fixture("value");for(const row of data.evidence.find(e=>e.id==="income-600519.SH")!.observations){row.period_end_ms=dateMs("2020-12-31");row.report_date_ms=dateMs("2021-04-20");}
  assert.throws(()=>buildAnalysisPacket(data),hasCode("NO_EVIDENCE"));
});
test("zero-valued evidence is retained; overlong source topics are excluded with explicit limitation",()=>{
  const data=fixture("short");data.ladder[0].stocks[0].topic="超长".repeat(100);const p=buildAnalysisPacket(data);
  assert.equal(p.evidence.find(e=>e.field==="limit-down-pool")?.value,0);assert.ok(!p.evidence.some(e=>e.field==="supplier-topic"));assert.ok(p.limitations.some(s=>s.includes("文本超出")));
});
test("seven-or-more display buckets never replace exact sample board counts",()=>{
  const data=fixture("short");data.ladder[0].height=7;data.ladder[0].label="7板及以上";data.previousLadder!.rows[0].height=7;
  data.evidence.find(e=>e.id==="ladder")!.observations[0].board_num=10;data.evidence.find(e=>e.id==="ladder-previous")!.observations[0].board_num=9;
  const p=buildAnalysisPacket(data);assert.equal(p.evidence.find(e=>e.field==="sample-max-height")?.value,10);assert.equal(p.evidence.find(e=>e.field==="sample-height-change")?.value,1);assert.equal(p.evidence.find(e=>e.field==="board-height")?.value,10);
});
test("inferences must cite existing evidence and remain unverified interpretations",()=>{
  const p=packet(),d=mockDraft(p);d.observations[0]={...d.observations[0],kind:"inference",narrative:"当前量价结构可能仍需观察，不能据此判断后续方向。"};
  const report=validate(d,p);assert.equal(report.observations[0].validation,"unverified_interpretation");
  d.observations[0].evidence_ids=[];d.observations[0].values=[];assert.throws(()=>validate(d,p),hasCode("INFERENCE_UNGROUNDED"));
});
test("partial financial API failure omits missing metrics and retains explicit limitations",async()=>{
  const data=fixture("swing");data.indices[0].indicatorsComplete=false;data.coverage.push({label:"指数历史",status:"error",reason:"明确模拟超时"});
  const p=buildAnalysisPacket(data);assert.ok(!p.evidence.some(e=>e.subject==="000001.SH" && e.field.includes("MA")));assert.ok(p.evidence.some(e=>e.subject==="600519.SH" && e.field.includes("MA")));assert.ok(p.limitations.some(s=>s.includes("明确模拟超时")));assert.equal(validate(mockDraft(p),p).partial,true);
});
test("generic index prices cannot masquerade as short or swing strategy reports",()=>{
  for(const style of ["short","swing"] as Style[]){const data=fixture(style);data.stocks=[];data.limitCounts=[];data.ladder=[];data.indices[0].indicatorsComplete=false;data.evidence=data.evidence.filter(e=>e.id.startsWith("index-"));assert.throws(()=>buildAnalysisPacket(data),hasCode("STRATEGY_DATA_MISSING"));}
});
test("future financial disclosures and latest valuation snapshot do not enter historical AI",()=>{
  const data=fixture("value");data.evidence.find(e=>e.id==="income-600519.SH")!.observations.unshift({report_date_ms:dateMs("2026-10-28"),period_end_ms:dateMs("2026-09-30"),operating_income:999999});
  const p=buildAnalysisPacket(data);assert.ok(!p.evidence.some(e=>e.value===999999||e.field==="pe"));
});
test("non-trading-day blocked data stops before the model",async()=>{
  let calls=0;const svc=services("short");svc.load=async()=>({...fixture("short"),status:"blocked",messages:["所选日期不是交易日"]});svc.analyze=async()=>{calls++;throw Error("not expected");};
  const task=await new ReportTaskStore().start("owner",input,svc).promise;assert.equal(task.errorCode,"DATA_BLOCKED");assert.equal(calls,0);assert.equal(task.report,undefined);
});
test("missing key fails explicitly before calling financial or model APIs",async()=>{
  const svc=services("short");svc.configured=false;svc.load=async()=>{throw Error("must not fetch");};const task=await new ReportTaskStore().start("owner",input,svc).promise;
  assert.equal(task.errorCode,"OPENAI_NOT_CONFIGURED");assert.equal(task.status,"failed");
});
test("repeated clicks share one pending task and do not duplicate model calls",async()=>{
  const store=new ReportTaskStore();let release!:()=>void,calls=0;const wait=new Promise<void>(r=>release=r);const svc=services("short");svc.analyze=async p=>{calls++;await wait;return {raw:mockDraft(p),model:"mock",responseId:"mock"};};
  const first=store.start("owner",input,svc);await new Promise(r=>setImmediate(r));assert.equal(first.task.status,"analyzing");
  const second=store.start("owner",input,svc);assert.equal(second.created,false);assert.equal(first.task.id,second.task.id);release();await first.promise;assert.equal(calls,1);assert.equal(store.get("other",first.task.id),undefined);
});
test("rapid context switching cancels old work; stale completion cannot publish a report",async()=>{
  const store=new ReportTaskStore();let release!:()=>void;const wait=new Promise<void>(r=>release=r);const svc=services("short");svc.load=async()=>{await wait;return fixture("short");};
  const old=store.start("owner",input,svc);store.cancel("owner",input);const next=store.start("owner",{...input,style:"swing"},services("swing"));release();
  assert.equal((await old.promise).status,"cancelled");assert.equal(old.task.report,undefined);assert.equal((await next.promise).report?.style,"swing");
});
test("OpenAI Responses request uses strict JSON Schema, store=false and server authorization",async()=>{
  const p=packet();let body:Record<string,unknown>={};const client=createOpenAIClient({apiKey:"explicit-test-secret",fetcher:async(url,options)=>{assert.equal(url,"https://api.openai.com/v1/responses");assert.equal(new Headers(options?.headers).get("Authorization"),"Bearer explicit-test-secret");body=JSON.parse(String(options?.body));return Response.json({id:"mock-response",status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(mockDraft(p))}]}]});}});
  const result=await client(p);assert.equal(body.store,false);assert.equal((body.text as {format:{strict:boolean}}).format.strict,true);assert.equal(validate(result.raw,p).responseId,"mock-response");
});
test("OpenAI HTTP failure, malformed response and refusal never become a report",async()=>{
  for(const response of [new Response("secret must not escape",{status:401}),Response.json({id:"mock",status:"incomplete"}),Response.json({id:"mock",status:"completed",output:[{type:"message",content:[{type:"refusal"}]}]}),Response.json({id:"mock",status:"completed",output:[{type:"message",content:[{type:"output_text",text:"broken"}]}]})]) {
    await assert.rejects(createOpenAIClient({apiKey:"test-only",fetcher:async()=>response})(packet()),(e:unknown)=>e instanceof ReportError && !e.message.includes("secret"));
  }
});
test("OpenAI timeout has an explicit error; task cannot complete with stale output",async()=>{
  const client=createOpenAIClient({apiKey:"test-only",timeoutMs:10,fetcher:async(_url,options)=>new Promise((_resolve,reject)=>{const signal=options!.signal!;const handle=setTimeout(()=>reject(Error("mock network timeout")),30);signal.addEventListener("abort",()=>{clearTimeout(handle);reject(signal.reason);},{once:true});})});
  await assert.rejects(client(packet()),hasCode("OPENAI_TIMEOUT"));
  const svc=services("short");svc.analyze=client;const task=await new ReportTaskStore().start("owner",input,svc).promise;assert.equal(task.status,"failed");assert.equal(task.errorCode,"OPENAI_TIMEOUT");assert.equal(task.report,undefined);
});
test("unknown schema fields and missing strategy sections fail closed",()=>{
  const p=packet(),d=mockDraft(p);assert.throws(()=>validate({...d,hiddenAdvice:"x"},p),hasCode("SCHEMA_INVALID"));d.specialist[1]=d.specialist[0];assert.throws(()=>validate(d,p),hasCode("STRUCTURE_INVALID"));
});
