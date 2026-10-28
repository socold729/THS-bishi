import type{Bar,Evidence}from'./domain';
import{shanghaiDate}from'./dates';
export const ANOMALY_RULES={
  sse:'https://www.sse.com.cn/lawandrules/sselawsrules2025/trade/universal/c/c_20260424_10816492.shtml',
  szse:'https://docs.static.szse.cn/www/lawrules/rule/trade/W020260424690713155663.pdf',
};
export interface AnomalyAlert{code:string;name:string;benchmark:string;window:10|30;threshold:100|200;lookback:number;requiredRise:number;referencePrice:number;currentPrice:number;deviation:number;evidenceIds:string[];conditional:true}
export interface AnomalyData{date:string;status:'ready'|'partial'|'unavailable';alerts:AnomalyAlert[];candidateCount:number;checkedCount:number;scope:string;messages:string[];evidence:Evidence[]}
export function anomalyBenchmark(code:string){
  if(/^688\d{3}\.SH$/.test(code))return{code:'000688.SH',name:'科创50',limit:20};
  if(/^60\d{4}\.SH$/.test(code))return{code:'000002.SH',name:'上证A股指数',limit:10};
  if(/^30\d{4}\.SZ$/.test(code))return{code:'399102.SZ',name:'创业板综合指数',limit:20};
  if(/^00\d{4}\.SZ$/.test(code))return{code:'399107.SZ',name:'深证A股指数',limit:10};
  return null;
}
// 2026 rules use compounded interval returns, NOT the sum of daily deviations.
// These are explicit conditional scenarios: benchmark tomorrow=0%, no new reset/action.
export function conditionalAnomalies(code:string,name:string,date:string,stock:Bar[],benchmark:Bar[],calendar:string[],evidenceIds:string[]):AnomalyAlert[]{
  const definition=anomalyBenchmark(code);if(!definition||date<'2026-07-06'||/ST|退|^N|^C/i.test(name))return[];
  const days=[...new Set(calendar)].filter(d=>d<=date).sort().slice(-31);
  if(days.length<31||days.at(-1)!==date)return[];
  const stocks=new Map(stock.filter(b=>shanghaiDate(b.date_ms)<=date).map(b=>[shanghaiDate(b.date_ms),b]));
  const indices=new Map(benchmark.filter(b=>shanghaiDate(b.date_ms)<=date).map(b=>[shanghaiDate(b.date_ms),b]));
  if(days.some(d=>!stocks.has(d)||!indices.has(d)))return[];
  const current=stocks.get(date)!.close_price,index=indices.get(date)!.close_price,alerts:AnomalyAlert[]=[];
  for(const[window,threshold]of [[10,100],[30,200]]as const){
    let best:AnomalyAlert|null=null;
    // "Within N days": compare all ending intervals, tomorrow inclusive.
    for(let count=2;count<=window;count++){
      const base=days.at(-count)!;const stockBase=stocks.get(base)!.close_price,indexBase=indices.get(base)!.close_price;
      const gain=current/stockBase,benchmarkGain=index/indexBase;
      const required=(threshold/100+benchmarkGain)/gain-1;
      // Already beyond the threshold is not a new upward crossing tomorrow.
      if(required<=0||required*100>definition.limit+0.001)continue;
      const rawPrice=stockBase*(threshold/100+benchmarkGain);
      const price=Math.ceil((rawPrice-1e-9)*100)/100;
      const rise=(price/current-1)*100;
      const limitPrice=Math.round(current*(1+definition.limit/100)*100)/100;
      if(price>limitPrice||!Number.isFinite(rise))continue;
      const candidate:AnomalyAlert={code,name,benchmark:definition.code,window,threshold,lookback:count,requiredRise:rise,referencePrice:price,currentPrice:current,deviation:(gain-benchmarkGain)*100,evidenceIds,conditional:true};
      if(!best||candidate.requiredRise<best.requiredRise)best=candidate;
    }
    if(best)alerts.push(best);
  }
  return alerts;
}
