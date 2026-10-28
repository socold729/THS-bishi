import 'server-only';
import {fuyao} from './server';
import {records,type ProviderResult} from './transport';
import {dateMs,normalizeDate,shanghaiDate,latestClosedDate} from '../dates';
import {normalizeBars} from '../metrics';
import {anomalyBenchmark,conditionalAnomalies,type AnomalyData} from '../anomalies';

export async function loadAnomalies(date:string,symbols:string[],signal?:AbortSignal):Promise<AnomalyData>{
  const output:AnomalyData={date,status:'unavailable',alerts:[],candidateCount:0,checkedCount:0,scope:'自选股优先＋当日涨停池按连板排序，共最多30只，非全市场扫描',messages:[],evidence:[]};
  if(date<'2026-07-06'){output.messages.push('当前测算规则自2026-07-06起适用，较早日期暂不测算。');return output;}
  const deadline=Date.now()+55_000;
  const request=async(p:string,params:Record<string,string|number>={})=>{
    if(Date.now()>deadline||signal?.aborted)return {ok:false,data:null,reason:'本次测算时间已用完',endpoint:p,fetchedAt:new Date().toISOString(),requestId:null,sourceTime:null,status:'error'} as ProviderResult;
    return fuyao(p,params,signal?AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]):AbortSignal.timeout(Math.max(1,deadline-Date.now())));
  };
  const source=(id:string,r:ProviderResult,scope:string,items=records(r.data))=>{if(r.ok)output.evidence.push({id,source:'扶摇',endpoint:r.endpoint,requestId:r.requestId,fetchedAt:r.fetchedAt,sourceTime:r.sourceTime,scope,unit:'收盘元/点，日期毫秒',fields:[...new Set(items.flatMap(r=>Object.keys(r)))],count:items.length,observations:items.map(r=>Object.fromEntries(Object.entries(r).filter(([,v])=>v===null||typeof v==='string'||typeof v==='number'))) as AnomalyData['evidence'][number]['observations']});};
  const calendar=await request('/api/a-share/calendar/trading-days');
  const days=records(calendar.data).map(r=>typeof r.date==='string'?normalizeDate(r.date):typeof r.date_ms==='number'?shanghaiDate(r.date_ms):'').filter(Boolean).sort();
  const latest=latestClosedDate(days);
  if(!calendar.ok||!days.includes(date)||!latest||date>latest){output.messages.push('所选日不是已确认收盘的交易日，未测算次日条件。');return output;}
  const pool=await request('/api/a-share/special-data/limit-up-pool',{date_ms:dateMs(date),page:1,size:200,sort_field:'continue_day_cnt',sort_dir:'desc'});
  const candidates=new Map(symbols.map(code=>[code,{code,name:code}]));
  for(const row of records(pool.data)){if(typeof row.thscode==='string'&&typeof row.name==='string'&&anomalyBenchmark(row.thscode)&&!candidates.has(row.thscode))candidates.set(row.thscode,{code:row.thscode,name:row.name});else if(typeof row.thscode==='string'&&candidates.has(row.thscode)&&typeof row.name==='string')candidates.get(row.thscode)!.name=row.name;}
  if(!pool.ok)output.messages.push('涨停池未取得，本次仅检查自选股。');
  const selected=[...candidates.values()].filter(c=>anomalyBenchmark(c.code)&&!/ST|退|^N|^C/i.test(c.name)).slice(0,30);output.candidateCount=selected.length;
  if(candidates.size>30)output.messages.push('本次最多检查30只，未覆盖的股票不作判断。');
  const start=dateMs(date)-75*86400000,indices=new Map<string,ReturnType<typeof normalizeBars>>();
  for(const code of [...new Set(selected.map(s=>anomalyBenchmark(s.code)!.code))]){const r=await request('/api/a-share-index/prices/historical',{thscode:code,interval:'1d',start,end:dateMs(date)});indices.set(code,normalizeBars(records(r.data),dateMs(date)));source(`deviation-index-${code}`,r,`${code}；偏离值专用基准，不是Dashboard显示指数`);}
  for(const candidate of selected){
    if(Date.now()>=deadline)break;
    const [history,actions]=await Promise.all([request('/api/a-share/prices/historical',{thscode:candidate.code,interval:'1d',start,end:dateMs(date),adjust:'none'}),request('/api/a-share/corporate-actions/adjustment-factors',{thscode:candidate.code,from:shanghaiDate(start),to:date})]);
    if(!history.ok||!actions.ok){output.messages.push(`${candidate.name}行情或除权记录未取得，已跳过。`);continue;}
    // Raw intervals containing corporate actions cannot be used as adjusted returns.
    if(records(actions.data).some(r=>typeof r.ex_date_ms==='number'&&r.ex_date_ms>=dateMs(days.filter(d=>d<=date).at(-31)??date)&&r.ex_date_ms<=dateMs(date))){output.messages.push(`${candidate.name}窗口内有除权除息，暂不测算。`);continue;}
    const bars=normalizeBars(records(history.data),dateMs(date)),benchmark=anomalyBenchmark(candidate.code)!;
    const ids=[`deviation-stock-${candidate.code}`,`deviation-index-${benchmark.code}`,`deviation-actions-${candidate.code}`];
    source(ids[0],history,`${candidate.code}不复权日线；无已返回除权事件的窗口`);source(ids[2],actions,`${candidate.code}窗口内除权事件检查`);
    const indexBars=indices.get(benchmark.code)??[],requiredDays=days.filter(d=>d<=date).slice(-31),stockDays=new Set(bars.map(b=>shanghaiDate(b.date_ms))),indexDays=new Set(indexBars.map(b=>shanghaiDate(b.date_ms)));
    if(requiredDays.length<31||requiredDays.some(d=>!stockDays.has(d)||!indexDays.has(d))){output.messages.push(`${candidate.name}个股或基准可比历史不足，已跳过。`);continue;}
    output.checkedCount++;output.alerts.push(...conditionalAnomalies(candidate.code,candidate.name,date,bars,indexBars,days,ids));
  }
  output.alerts.sort((a,b)=>a.requiredRise-b.requiredRise);
  output.messages.push('条件假设：次日基准指数涨跌为0%，无新除权或规则重置；未核验完整交易所重置公告，因此是潜在触线测算，不是已确认异动名单。');
  if(output.checkedCount<selected.length)output.messages.push(`已检查${output.checkedCount}/${selected.length}只，未完成部分不作“没有异动”判断。`);
  output.status=output.checkedCount?output.checkedCount===selected.length?'ready':'partial':'unavailable';return output;
}
