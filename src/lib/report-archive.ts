import{z}from"zod";
import{styleSchema,preferencesSchema,type Preferences}from"./domain";
import type{ReviewReport,ReportConfiguration}from"./reports/types";
import{defaultPlan}from"./reports/plan";
export const ARCHIVE_KEY="mingri.report-archive.v1";
const archivedClaim=z.object({kind:z.enum(["fact","inference","uncertainty"]),subject:z.string(),text:z.string(),narrative:z.string(),evidence_ids:z.array(z.string()),values:z.array(z.object({evidence_id:z.string(),value:z.union([z.number(),z.string()]),unit:z.string()})),validation:z.enum(["matched_data","unverified_interpretation"])});
const archivedReport=z.object({id:z.string(),date:z.string(),style:styleSchema,symbols:z.array(z.string()),generatedAt:z.string(),model:z.string(),responseId:z.string(),partial:z.boolean(),limitations:z.array(z.string()),summary:z.array(archivedClaim),observations:z.array(archivedClaim),specialist:z.array(z.object({key:z.string(),title:z.string(),items:z.array(archivedClaim)})),watchlist:z.array(z.object({subject:z.string(),items:z.array(archivedClaim)})),risks:z.array(archivedClaim),evidence:z.array(z.object({id:z.string(),date:z.string(),subject:z.string(),field:z.string(),value:z.union([z.number(),z.string()]),unit:z.string(),observedDate:z.string(),label:z.string(),scope:z.string(),formula:z.string(),sources:z.array(z.object({source:z.string(),endpoint:z.string(),fetchedAt:z.string(),requestId:z.string().nullable(),sourceTime:z.number().nullable()})),status:z.literal("usable")}))}).passthrough();
export interface ArchivedReport {id:string;version:number;savedAt:string;configuration:ReportConfiguration;preferences:Preferences|null;report:ReviewReport}
export interface ArchiveStore{version:1;entries:ArchivedReport[]}
const configuration=z.object({style:styleSchema,symbols:z.array(z.string()),customInstructions:z.string(),hypotheses:z.array(z.unknown()),plan:z.object({mode:z.enum(["default","custom"]),sections:z.array(z.object({key:z.string(),title:z.string()}))}).passthrough()}).passthrough();
const storeSchema=z.object({version:z.literal(1),entries:z.array(z.object({id:z.uuid(),version:z.number().int().positive(),savedAt:z.iso.datetime(),configuration,preferences:preferencesSchema.nullable(),report:archivedReport})).max(100)});
export function readArchive(storage:Pick<Storage,"getItem">):ArchiveStore {
  const raw=storage.getItem(ARCHIVE_KEY);if(!raw)return{version:1,entries:[]};
  const result=storeSchema.safeParse(JSON.parse(raw));if(!result.success)throw Error("复盘档案数据损坏，原始记录未覆盖。");
  return result.data as unknown as ArchiveStore;
}
export function saveArchive(storage:Pick<Storage,"getItem"|"setItem">,report:ReviewReport,preferences:Preferences|null=null,configuration?:ReportConfiguration) {
  const store=readArchive(storage),existing=store.entries.find(e=>e.report.id===report.id&&e.report.responseId===report.responseId&&e.report.generatedAt===report.generatedAt);
  if(existing)return existing;
  if(store.entries.length>=100)throw Error("复盘档案已达100份上限，已有报告未删除。");
  const snapshot=report.configurationSnapshot??configuration??{style:report.style,symbols:report.symbols,customInstructions:"",hypotheses:[],plan:defaultPlan(report.style)};
  const entry:ArchivedReport=structuredClone({id:crypto.randomUUID(),version:Math.max(0,...store.entries.filter(e=>e.report.date===report.date&&e.report.style===report.style).map(e=>e.version))+1,savedAt:new Date().toISOString(),configuration:snapshot,preferences,report});
  const next={version:1 as const,entries:[...store.entries,entry]};storeSchema.parse(next);
  storage.setItem(ARCHIVE_KEY,JSON.stringify(next));return entry;
}
export async function saveBrowserArchive(report:ReviewReport,preferences:Preferences|null,configuration?:ReportConfiguration){
  const commit=()=>saveArchive(localStorage,report,preferences,configuration);
  // Serialize writes from different tabs where Web Locks is available.
  return navigator.locks? navigator.locks.request(ARCHIVE_KEY,commit):commit();
}
