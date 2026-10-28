import "server-only";
import type { Coverage, Evidence, StockRow } from "../domain";
import { dateMs, shanghaiDate } from "../dates";
import { records, type ProviderResult } from "./transport";
import { financialPeriods, visibleFinancialRows, type FinancialDataset } from "./financials";
import { ifind } from "./ifind";
import { normalizeAnnouncements, normalizeValuations, valuationDates } from "./value-normalize";
import type { IfindResult } from "./ifind-transport";
import{wants,type ReviewPlan}from"../reports/plan";
import{quarterComparisons,quarterlyAmount,previousQuarterEnd,corroboratesYtd}from"./quarter-comparison";
import{normalizeIndustryIdentity}from"./industry-normalize";

type RequestData=(path:string,params?:Record<string,string|number>)=>Promise<ProviderResult>;
export async function loadValueCompanies(symbols:string[],date:string,latest:string,request:RequestData,deadline:number,signal?:AbortSignal,plan?:ReviewPlan) {
  const stocks:StockRow[]=[],evidence:Evidence[]=[],coverage:Coverage[]=[];
  const quarterInputs=new Map<string,Record<string,unknown>[]>();
  const source=(id:string,result:ProviderResult,scope:string,rows:Record<string,unknown>[])=>{
    if(!result.ok)return;
    evidence.push({id,source:"扶摇",endpoint:result.endpoint,requestId:result.requestId,fetchedAt:result.fetchedAt,sourceTime:result.sourceTime,scope,unit:"金额为原币元；日期为上海时区；数值未补零",fields:[...new Set(rows.flatMap(r=>Object.keys(r)))],count:rows.length,observations:rows.map(row=>Object.fromEntries(Object.entries(row).filter(([,v])=>v===null||typeof v==="string"||typeof v==="number"))) as Evidence["observations"]});
  };
  const mcp=async(service:"news"|"stock",tool:string,args:Record<string,unknown>):Promise<IfindResult>=>{
    const remaining=deadline-Date.now();
    if(remaining<1000)return {ok:false,data:null,reason:"本次数据等待预算已用尽，未继续请求iFinD。",fetchedAt:new Date().toISOString(),endpoint:`iFinD/${service}/${tool}`,requestId:null};
    const timeout=AbortSignal.timeout(remaining);
    return ifind(service,tool,args,signal?AbortSignal.any([signal,timeout]):timeout);
  };
  for(const code of symbols) {
    signal?.throwIfAborted();
    const meta=await request("/api/meta/tickers/search",{q:code,asset_type:"a-share",limit:3});
    const identity=records(meta.data).find(r=>r.thscode===code);
    const name=typeof identity?.name==="string"?identity.name:typeof identity?.ticker==="string"?identity.ticker:code;
    const stock:StockRow={code,name,metrics:[],value:{reports:[],valuations:[],announcements:[],warnings:[],rejectedAnnouncements:0}};
    const table=new Map<string,{result:ProviderResult;rows:Record<string,unknown>[]}>([]);
    const jobs=wants(plan,"financials")||wants(plan,"hypotheses")?[...(["annual","quarterly"] as const).flatMap(frequency=>(["income","balance","cash"] as const).map(kind=>({frequency,kind,path:kind==="income"?"income-statements":kind==="balance"?"balance-sheets":"cash-flow-statements"})))]:[];
    for(let offset=0;offset<jobs.length;offset+=2) {
      const batch=jobs.slice(offset,offset+2);
      const results=await Promise.all(batch.map(job=>request(`/api/a-share/financials/${job.path}`,{thscode:code,period:job.frequency,limit:16})));
      for(const [i,job]of batch.entries()) {
        const result=results[i],rows=visibleFinancialRows(records(result.data),date);
        const id=`${job.frequency==="quarterly"?"quarter-":""}${job.kind}-${code}`;
        source(id,result,`${name} ${code}；截至${date}已披露${job.frequency==="annual"?"年度":"季度"}${job.kind}表，期末和披露日均过滤；供应商历史修订版本不能还原`,rows);
        table.set(`${job.frequency}-${job.kind}`,{result,rows});
        coverage.push({label:`${name} ${job.frequency==="annual"?"年度":"季度"}${job.kind==="income"?"利润":job.kind==="balance"?"资产负债":"现金流"}表`,status:!result.ok?result.status:rows.length?"ready":"empty",reason:!result.ok?result.reason:rows.length?`${rows.length}期截至所选日已披露数据；不同报告期不混算`:"截至所选日未取得已披露记录，不用未来财报替代。"});
      }
    }
    for(const frequency of jobs.length?["annual","quarterly"] as const:[]) {
      const dataset:FinancialDataset={income:table.get(`${frequency}-income`)!.rows,balance:table.get(`${frequency}-balance`)!.rows,cash:table.get(`${frequency}-cash`)!.rows,ids:{income:`${frequency==="quarterly"?"quarter-":""}income-${code}`,balance:`${frequency==="quarterly"?"quarter-":""}balance-${code}`,cash:`${frequency==="quarterly"?"quarter-":""}cash-${code}`}};
      stock.value!.reports.push(...financialPeriods(dataset,frequency,date));
      if(frequency==="quarterly")quarterInputs.set(code,dataset.income);
    }
    const annual=stock.value!.reports.find(r=>r.frequency==="annual"),quarter=stock.value!.reports.find(r=>r.frequency==="quarterly");
    for(const [id,newId]of [["margin","margin"],["revenue-yoy","growth"],["cash-profit","cash-profit"],["debt-ratio","debt-ratio"]]) {const item=annual?.metrics.find(m=>m.id===id);if(item)stock.metrics.push({...item,id:newId});}
    if(quarter){const item=quarter.metrics.find(m=>m.id==="revenue-yoy");if(item)stock.metrics.push({...item,id:"quarter-growth",label:"最新季报营收同比"});}
    stock.value!.warnings.push("季度同比按相同报告期；环比仅在同季度累计值和iFinD单季字段交叉核对通过时启用，否则留空。财务过滤不保证供应商修订版本的历史还原。");
    stocks.push(stock);
  }
  // All companies' core financials are obtained before optional MCP enrichment.
  for(const stock of stocks) {
    const {code,name}=stock,value=stock.value!;
    if(wants(plan,"industry")){
      const identity=await mcp("stock","get_stock_info",{query:`${name} ${code}截至${date}的所属同花顺三级行业及主营业务，明确截止日期。`});
      const parsed=identity.ok?normalizeIndustryIdentity(identity.data,code,date):null;
      if(parsed){const id=`company-industry-${code}`;value.industry={...parsed,evidenceIds:[id]};evidence.push({id,source:"iFinD",endpoint:identity.endpoint,requestId:identity.requestId,fetchedAt:identity.fetchedAt,sourceTime:null,scope:`${code}；截止日期${parsed.asOf}的同花顺${parsed.level}与主营业务，已检查响应截止日期元数据`,unit:"资料文本",fields:["code","name","business","asOf","level"],count:1,observations:[{code,...parsed}]});}
      else value.warnings.push(identity.reason||"公司行业资料缺少匹配的证券代码/截止日期，未作为历史归属使用。");
    }
    const quarterly=quarterInputs.get(code)??[];
    if(quarterly.length){
      const currentEnd=shanghaiDate(Number(quarterly[0].period_end_ms)),previousEnd=previousQuarterEnd(currentEnd),checks:Record<string,{current:boolean;previous:boolean;sourceIds:string[]}>={};
      for(const field of["operating_income","parent_holder_net_profit"])checks[field]={current:false,previous:false,sourceIds:[]};
      for(const[which,end]of[["current",currentEnd],["previous",previousEnd]]as const){
        const row=quarterly.find(r=>shanghaiDate(Number(r.period_end_ms))===end);if(!row)continue;
        const result=await mcp("stock","get_stock_financials",{query:`${name} ${code}在${end.slice(0,4)}年第${Math.ceil(+end.slice(5,7)/3)}季度（期末${end}）的单季度营业收入、单季度归母净利润，明确实际季度和合并报表口径，同时返回对应累计值。`});
        if(!result.ok)continue;const id=`quarter-basis-${which}-${code}`;
        evidence.push({id,source:"iFinD",endpoint:result.endpoint,requestId:result.requestId,fetchedAt:result.fetchedAt,sourceTime:null,scope:`${code} ${end}单季度/累计字段交叉核验；单季度元数据必须与期末季度一致；表格量级舍入误差不超过5001元`,unit:"元；iFinD表格可能以万/亿缩写",fields:["answer","periodEnd"],count:1,observations:[{periodEnd:end,answer:typeof(result.data as any)?.answer==="string"?(result.data as any).answer:""}]});
        for(const field of Object.keys(checks)){checks[field][which]=corroboratesYtd(result.data,code,row,field,quarterlyAmount(quarterly,end,field,"ytd"));checks[field].sourceIds.push(id);}
      }
      value.quarterComparisons=quarterComparisons(quarterly,date,checks);
      coverage.push({label:`${name}财务环比`,status:value.quarterComparisons.some(q=>q.delta!==null)?"ready":"unavailable",reason:value.quarterComparisons.some(q=>q.delta!==null)?"已与iFinD匹配季度的单季/累计字段交叉核对，再从已披露累计报表推导单季；仅正分母算变化率。":"暂无可比环比数据：单季/累计口径、披露期或交叉核验未满足。"});
    }
    const start=shanghaiDate(dateMs(date)-365*86400000);
    if(wants(plan,"announcements")){
    const notice=await mcp("news","search_notice",{query:`${name} 已披露公告 年报 季报 重大事项`,time_start:start,time_end:date,size:3});
    if(notice.ok) {
      const id=`notice-${code}`,normalized=normalizeAnnouncements(notice.data,code,name,date,start,id);
      value.announcements=normalized.items;value.rejectedAnnouncements=normalized.rejected;value.warnings.push(...normalized.warnings);
      evidence.push({id,source:"iFinD",endpoint:notice.endpoint,requestId:notice.requestId,fetchedAt:notice.fetchedAt,sourceTime:null,scope:`${name} ${code}，${start}至${date}检索最多3条相关片段，逐条过滤日期与标题身份；非完整公告目录、非全文`,unit:"文本片段",fields:["title","date","excerpt","url","code"],count:normalized.items.length,observations:normalized.items.map(item=>({code,title:item.title,date:item.date,excerpt:item.excerpt,url:item.url}))});
      coverage.push({label:`${name} 公告片段`,status:normalized.items.length?"ready":"empty",reason:normalized.items.length?`${normalized.items.length}条通过日期/身份校验，${normalized.items.filter(i=>!i.url).length}条缺原文URL；不推断没有其他公告。`:"没有通过日期/身份校验的公告；不能据此断言没有新变化。"});
    }else coverage.push({label:`${name} 公告片段`,status:"unavailable",reason:notice.reason});
    }
    if(wants(plan,"valuations")){
    const dates=valuationDates(date);
    const valuation=await mcp("stock","get_stock_financials",{query:`${name}（${code}）在${dates.join("、")}各交易日期的市盈率PE(TTM)、市净率PB。请逐行列出证券代码、交易日期、PE(TTM)、PB及指标口径，不用最新值代替历史日期。`});
    if(valuation.ok) {
      const id=`historical-valuation-${code}`,normalized=normalizeValuations(valuation.data,code,date,dates,id);
      value.valuations=normalized.items;value.warnings.push(...normalized.warnings);
      evidence.push({id,source:"iFinD",endpoint:valuation.endpoint,requestId:valuation.requestId,fetchedAt:valuation.fetchedAt,sourceTime:null,scope:`${name} ${code}；仅接受明确证券代码、请求日期及指标口径的实际样本，非完整历史分布`,unit:"倍",fields:["date","pe_ttm","pb","pb_basis","thscode"],count:normalized.items.length,observations:normalized.items.map(item=>({thscode:code,date:item.date,pe_ttm:item.peTtm,pb:item.pb,pb_basis:item.pbBasis}))});
      coverage.push({label:`${name} 历史估值`,status:normalized.items.length?"ready":"empty",reason:normalized.items.length?`${normalized.items.length}个时点通过校验；不是完整历史分布，不计算估值分位。`:"未取得具有明确标的、时点和口径的估值，已留空。"});
    }else {value.warnings.push(valuation.reason);coverage.push({label:`${name} 历史估值`,status:"unavailable",reason:valuation.reason});}
    }
    if(date===latest&&wants(plan,"valuations")) {
      const snapshot=await request("/api/a-share/valuations/snapshot",{thscodes:code});const rows=records(snapshot.data).filter(r=>r.thscode===code);source(`valuation-${code}`,snapshot,"最新估值快照仅作单独参考，不属于所选日历史截面，不送入AI历史分析",rows);
      stock.metrics.push({id:"pe",label:"最新PE·TTM参考",value:typeof rows[0]?.pe_ttm==="number"?rows[0].pe_ttm:null,unit:"倍",note:"最新快照非所选日历史估值，AI不回填历史。",evidenceIds:snapshot.ok?[`valuation-${code}`]:[]});
    }
  }
  return {stocks,evidence,coverage};
}
