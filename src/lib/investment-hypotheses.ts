import { z } from "zod";
import { symbolSchema, type DashboardData } from "./domain";
import { validDate } from "./dates";

export const HYPOTHESIS_METRICS = {
  "annual-revenue-yoy": { label:"年度营收同比", frequency:"annual", field:"revenue-yoy", unit:"%" },
  "quarterly-revenue-yoy": { label:"季报同报告期营收同比", frequency:"quarterly", field:"revenue-yoy", unit:"%" },
  "annual-debt-ratio": { label:"年度资产负债率", frequency:"annual", field:"debt-ratio", unit:"%" },
  "quarterly-debt-ratio": { label:"季报资产负债率", frequency:"quarterly", field:"debt-ratio", unit:"%" },
  "annual-cash-profit": { label:"年度经营现金/净利润", frequency:"annual", field:"cash-profit", unit:"倍" },
} as const;
export const hypothesisConditionSchema=z.strictObject({id:z.uuid(),code:symbolSchema,metric:z.enum(Object.keys(HYPOTHESIS_METRICS) as [keyof typeof HYPOTHESIS_METRICS,...(keyof typeof HYPOTHESIS_METRICS)[]]),comparison:z.enum(["gte","lte"]),threshold:z.number().finite().min(-1000000).max(1000000)});
export type HypothesisCondition=z.infer<typeof hypothesisConditionSchema>;
export const hypothesisSchema=hypothesisConditionSchema.extend({text:z.string().trim().min(1).max(160),recordedAt:z.iso.datetime(),effectiveDate:z.string().refine(validDate),archived:z.boolean(),supersedes:z.uuid().nullable()});
export type InvestmentHypothesis=z.infer<typeof hypothesisSchema>;
const observationSchema=z.strictObject({id:z.uuid(),hypothesisId:z.uuid(),date:z.string().refine(validDate),recordedAt:z.iso.datetime(),value:z.number().finite().nullable(),threshold:z.number().finite(),comparison:z.enum(["gte","lte"]),status:z.enum(["matches","review","unknown"]),periodEnd:z.string().nullable(),disclosedAt:z.string().nullable(),text:z.string(),metric:z.string(),sourceIds:z.array(z.string())});
export type HypothesisObservation=z.infer<typeof observationSchema>;
export const hypothesisStoreSchema=z.strictObject({version:z.literal(1),hypotheses:z.array(hypothesisSchema).max(100),history:z.array(observationSchema).max(5000)});
export type HypothesisStore=z.infer<typeof hypothesisStoreSchema>;
export const HYPOTHESIS_KEY="mingri.value-hypotheses.v1";
export const emptyHypotheses=():HypothesisStore=>({version:1,hypotheses:[],history:[]});
export function decodeHypotheses(raw:string|null):HypothesisStore|null {try{return raw?hypothesisStoreSchema.parse(JSON.parse(raw)):emptyHypotheses();}catch{return null;}}
export function hypothesisKey(items:HypothesisCondition[]=[]) {return JSON.stringify([...items].sort((a,b)=>a.id.localeCompare(b.id)).map(({id,code,metric,comparison,threshold})=>({id,code,metric,comparison,threshold})));}
export function checkHypothesis(item:HypothesisCondition,data:DashboardData) {
  const definition=HYPOTHESIS_METRICS[item.metric],company=data.stocks.find(s=>s.code===item.code);
  const period=company?.value?.reports.find(r=>r.frequency===definition.frequency),metric=period?.metrics.find(m=>m.id===definition.field);
  const stale=!period||Date.parse(data.date)-Date.parse(period.periodEnd)>732*86400000;
  const value=!stale && metric?.value!=null && Number.isFinite(metric.value)?metric.value:null;
  return {value,status:value===null?"unknown" as const:(item.comparison==="gte"?value>=item.threshold:value<=item.threshold)?"matches" as const:"review" as const,periodEnd:period?.periodEnd??null,disclosedAt:metric?.observedDate??null,sourceIds:metric?.evidenceIds??[],label:definition.label,unit:definition.unit};
}
export function recordHypothesisObservations(store:HypothesisStore,data:DashboardData,now=new Date().toISOString()):HypothesisStore {
  const added:HypothesisObservation[]=[];
  for(const item of store.hypotheses.filter(h=>!h.archived&&h.effectiveDate<=data.date&&data.stocks.some(s=>s.code===h.code))) {
    const result=checkHypothesis(item,data);
    if(store.history.some(h=>h.hypothesisId===item.id&&h.date===data.date&&h.value===result.value&&h.periodEnd===result.periodEnd&&h.disclosedAt===result.disclosedAt))continue;
    added.push({id:crypto.randomUUID(),hypothesisId:item.id,date:data.date,recordedAt:now,value:result.value,threshold:item.threshold,comparison:item.comparison,status:result.status,periodEnd:result.periodEnd,disclosedAt:result.disclosedAt,text:item.text,metric:result.label,sourceIds:result.sourceIds});
  }
  if(store.history.length+added.length>5000)throw Error("本地核验记录达到上限，请导出记录后整理；已有记录未删除。");
  return added.length?{...store,history:[...store.history,...added]}:store;
}
