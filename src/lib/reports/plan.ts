import {z} from "zod";
import type {Style} from "../domain";
import {SPECIALIST_SECTIONS} from "./types";
import {hypothesisKey,type HypothesisCondition} from "../investment-hypotheses";
import{unsafeLabel}from"./policy";

export const DATA_SCOPES=["indices","limits","ladder","topics","trends","watchlist","financials","valuations","announcements","industry","hypotheses"] as const;
export type DataScope=typeof DATA_SCOPES[number];
export const UNSUPPORTED_REQUESTS={"full-market-breadth":"全市场宽度全量分页与核验尚未完成","full-policy-text":"完整政策原文及全文核验尚未接入","industry-prosperity":"专门的行业景气统计指标尚未接入","trading-account":"当前不接入证券账户","trade-execution":"不支持自动交易","intraday":"当前盘后复盘未接入盘中分时和盘口分析","other-data":"自定义要求还包含白名单之外的数据，需要另行验证"}as const;
export const SCOPE_DESCRIPTIONS:Record<DataScope,string>={indices:"四个主要指数的真实历史日线；close/change仅作背景，不重复播报",limits:"所选日涨跌停股票池总数",ladder:"所选日及前交易日有限连板样本，可核对高度变化，不认定全市场龙头",topics:"同日涨停池原始题材标签；不证明涨跌原因",trends:"主要指数日线程序聚合日/周/月K，计算均线、真实成交量额及较前五日/上月同期差额；边界周期可能未结束",watchlist:"自选股按风格取得行情或财务数据",financials:"已披露年度/季度三表、归母净利润与同比；环比须交叉验证单季/累计口径，否则缺失",valuations:"仅实际返回且明确日期/标的/口径的历史估值；无数据时不回填快照",announcements:"iFinD公告相关片段，核对日期和公司身份；不是全文",industry:"已验证行业目录和历史日线，可程序聚合周/月K、均线、真实成交量额及较前五日/上月同期差额；产业发展资讯需另查iFinD并校验日期和来源，不能以价格替代产业事实",hypotheses:"用户自设财务条件的程序核验，不证明投资假设成立"};
export const ALLOWED_SCOPES:Record<Style,readonly DataScope[]>={short:["indices","limits","ladder","topics","watchlist","industry"],swing:["indices","trends","watchlist","industry"],value:["financials","valuations","announcements","industry","hypotheses","watchlist"]};
export const customPlanSchema=z.strictObject({scopes:z.array(z.enum(DATA_SCOPES)).min(1).max(11),industries:z.array(z.string().min(1).max(30)).max(3),sections:z.array(z.strictObject({key:z.string().regex(/^custom_[1-5]$/),title:z.string().min(1).max(40)})).min(1).max(5),includeWatchlist:z.boolean(),unavailable:z.array(z.enum(Object.keys(UNSUPPORTED_REQUESTS)as[keyof typeof UNSUPPORTED_REQUESTS,...(keyof typeof UNSUPPORTED_REQUESTS)[]])).max(5)});
export type ReviewPlan={mode:"default"|"custom";scopes:DataScope[];industries:string[];sections:{key:string;title:string}[];includeWatchlist:boolean;unavailable:string[]};
export function defaultPlan(style:Style):ReviewPlan{return{mode:"default",scopes:[...ALLOWED_SCOPES[style]],industries:[],sections:Object.entries(SPECIALIST_SECTIONS[style]).map(([key,title])=>({key,title})),includeWatchlist:true,unavailable:[]};}
export function validateCustomPlan(raw:unknown,style:Style):ReviewPlan {
  const parsed=customPlanSchema.parse(raw);
  if(new Set(parsed.sections.map(s=>s.key)).size!==parsed.sections.length||parsed.scopes.some(s=>!ALLOWED_SCOPES[style].includes(s)))throw Error("CUSTOM_PLAN_INVALID");
  const core:Record<Style,DataScope[]>={short:["limits","ladder","topics"],swing:["trends","industry"],value:["financials","valuations","industry"]};
  if(!parsed.scopes.some(s=>core[style].includes(s)))throw Error("CUSTOM_PLAN_INVALID");
  // Titles are labels, never an escape hatch for forecasts or secrets.
  if(parsed.sections.some(s=>unsafeLabel(s.title))||parsed.unavailable.some(s=>unsafeLabel(s)))throw Error("CUSTOM_PLAN_INVALID");
  return {...parsed,scopes:[...new Set(parsed.scopes)],mode:"custom"};
}
export function reviewConfigurationKey(conditions:HypothesisCondition[]=[],customInstructions=""){const base=hypothesisKey(conditions);return customInstructions.trim()?JSON.stringify({conditions:base,customInstructions:customInstructions.trim()}):base;}
export function wants(plan:ReviewPlan|undefined,scope:DataScope){return !plan||plan.scopes.includes(scope);}
