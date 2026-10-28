import {liquidityMetrics} from '../liquidity';
import type{DashboardData,Evidence,Coverage}from"../domain";import{records,type ProviderResult}from"./transport";import{ifind}from"./ifind";import{markdownRows,safeSourceUrl}from"./value-normalize";import{normalizeDate,validDate,dateMs,shanghaiDate}from"../dates";import{normalizeBars,percentChange}from"../metrics";
import{normalizeIndustryNews}from"./industry-normalize";
type RequestData=(path:string,params?:Record<string,string|number>)=>Promise<ProviderResult>;
export async function loadIndustries(names:string[],date:string,request:RequestData,deadline:number,signal?:AbortSignal,calendar:string[]=[]){
  const industries:NonNullable<DashboardData["industries"]>=[],evidence:Evidence[]=[],coverage:Coverage[]=[];
  if(!names.length){coverage.push({label:"行业发展",status:"unavailable",reason:"没有可核验的历史公司行业归属或明确指定行业，不能自行猜测。"});return{industries,evidence,coverage};}
  const catalog=await request("/api/a-share-index/catalog/ths-index-list",{tag:"industry"});
  for(const name of[...new Set(names)].slice(0,3)){
    const item=records(catalog.data).find(r=>r.name===name&&typeof r.thscode==="string"),code=item?String(item.thscode):null,metrics:NonNullable<DashboardData["industries"]>[number]["metrics"]=[],warnings:string[]=[];
    if(code){const raw=await request("/api/a-share-index/prices/historical",{thscode:code,interval:"1d",start:Math.max(dateMs(date)-5*365*86400000,dateMs(shanghaiDate(Date.now()))-(5*365-7)*86400000),end:dateMs(date)});const bars=normalizeBars(records(raw.data),dateMs(date)),id=`industry-${code}`,last=bars.at(-1),days=new Set(bars.map(b=>shanghaiDate(b.date_ms))),complete=!!last&&shanghaiDate(last.date_ms)===date&&calendar.filter(d=>d>=shanghaiDate(bars[0].date_ms)&&d<=date).every(d=>days.has(d));
      if(raw.ok)evidence.push({id,source:"扶摇",endpoint:raw.endpoint,requestId:raw.requestId,fetchedAt:raw.fetchedAt,sourceTime:raw.sourceTime,scope:`${name} ${code}，截至所选日真实行业指数日线；反映市场价格，不等于产业景气或经营事实`,unit:"点；成交量股；成交额人民币元",fields:["date_ms","close_price","volume","turnover"],count:bars.length,observations:bars.map(b=>({date_ms:b.date_ms,close_price:b.close_price,volume:b.volume,turnover:b.turnover}))});
      if(complete)for(const[n,label]of[[5,"近5个交易记录行业指数变化"],[20,"近20个交易记录行业指数变化"]]as const){const prior=bars.at(-n-1);metrics.push({id:`industry-change-${n}`,label,value:prior?percentChange(last!.close_price,prior.close_price):null,unit:"%",note:"实际返回交易记录间收盘变化；仅反映市场价格，不证明行业发展或政策影响",evidenceIds:[id]});}
      // Trend evidence is computed from real rows and carries all original dates.
      if(raw.ok&&complete){const{chartPoints,aggregateBars}=await import("../metrics");for(const period of["week","month"]as const){const rows=aggregateBars(bars,period),point=chartPoints(bars,period).at(-1),previous=rows.at(-2),current=rows.at(-1)!;for(const n of[5,10,20,30,60]as const)metrics.push({id:`industry-${period}-ma${n}`,label:`${name} ${period==="week"?"周":"月"}MA${n}`,value:point?.[`ma${n}`]??null,unit:"点",note:"截至所选日可见日线聚合；边界周期未完成；样本不足留空；早于近一年日历的预热仅按供应商返回序列",evidenceIds:[id]});metrics.push({id:`industry-${period}-change`,label:`${name}${period==="week"?"周":"月"}周期变化`,value:previous?percentChange(current.close_price,previous.close_price):null,unit:"%",note:"本期可见收盘与前周期收盘；当前周期可能未完成",evidenceIds:[id]});}metrics.push(...liquidityMetrics(bars,date,"swing",[id],complete).map(m=>({...m,id:`industry-${m.id}`,label:`${name} · ${m.label}` })));}
      if(!complete)warnings.push("所选日行业行情缺失或已知交易日有缺口，行业趋势与量能指标停算。");
      coverage.push({label:`${name}行业行情`,status:complete?"ready":"unavailable",reason:complete?"取得行业指数，仅作价格趋势证据，不能替代产业发展事实。":raw.reason||"所选日缺失或已知交易日有缺口"});
    }else warnings.push("行业目录没有精确对应指数，不用相似行业替代。");
    let news:NonNullable<DashboardData["industries"]>[number]["news"]=[];const start=shanghaiDate(dateMs(date)-30*86400000),remaining=deadline-Date.now();
    if(remaining>1000){const result=await ifind("news","search_news",{query:`${name}行业发展 产业政策 经营变化`,time_start:start,time_end:date,size:3},signal?AbortSignal.any([signal,AbortSignal.timeout(remaining)]):AbortSignal.timeout(remaining));
      const id=`industry-news-${name}`;if(result.ok){news=normalizeIndustryNews(result.data,name,date,start,id);evidence.push({id,source:"iFinD",endpoint:result.endpoint,requestId:result.requestId,fetchedAt:result.fetchedAt,sourceTime:null,scope:`${name} ${start}至${date}相关资讯片段；日期/行业词/URL过滤，非全文，不证明行业全貌`,unit:"新闻片段",fields:["title","excerpt","date","url"],count:news.length,observations:news.map(n=>({title:n.title,excerpt:n.excerpt,date:n.date,url:n.url}))});}else warnings.push(result.reason);
    }
    warnings.push("当前目录仅用于定位行业指数代码，不还原历史成分；新闻检索片段不等于已核实政策全文。没有可用新闻和行业指标时，无法可靠判断行业发展、景气度或公司经营影响。");coverage.push({label:`${name}行业发展事实`,status:news.length?"ready":"unavailable",reason:news.length?`${news.length}条通过截止日期/行业词/URL校验的片段，事实与潜在影响分开。`:"暂无通过校验的行业发展资讯；不能从行业名称或价格上涨编造发展趋势。"});industries.push({name,code,metrics,news,warnings});
  }
  return{industries,evidence,coverage};
}
