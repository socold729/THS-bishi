import type {Bar,Metric,Style} from './domain';
import {shanghaiDate} from './dates';

export function scaleQuantity(value:number,kind:'volume'|'turnover') {
  const magnitude=Math.abs(value),suffix=kind==='volume'?'股':'元';
  const [scale,prefix]=magnitude>=1e12?[1e12,'万亿']:magnitude>=1e8?[1e8,'亿']:magnitude>=1e4?[1e4,'万']:[1,''];
  return {value:Math.round(value/Number(scale)*10000)/10000,unit:`${prefix}${suffix}`};
}
// Compare amounts, never substitute money for shares or fabricate missing rows.
export function liquidityMetrics(bars:Bar[],date:string,style:Style,ids:string[],complete=true):Metric[]{
  const rows=bars.filter(b=>shanghaiDate(b.date_ms)<=date),last=rows.at(-1);
  if(!complete||!last||shanghaiDate(last.date_ms)!==date)return[];
  const metrics:Metric[]=[];
  const add=(id:string,label:string,value:number|null,kind:'volume'|'turnover',note:string)=>{
    if(value===null)return;const scaled=scaleQuantity(value,kind);
    metrics.push({id,label,...scaled,note,evidenceIds:ids,observedDate:date});
  };
  const month=date.slice(0,7),thisMonth=rows.filter(b=>shanghaiDate(b.date_ms).startsWith(month));
  const monthDate=new Date(`${month}-01T00:00:00Z`);monthDate.setUTCMonth(monthDate.getUTCMonth()-1);
  const previousMonth=rows.filter(b=>shanghaiDate(b.date_ms).startsWith(monthDate.toISOString().slice(0,7)));
  for(const kind of ['volume','turnover'] as const){
    const title=kind==='volume'?'成交量':'成交额',today=last[kind];
    add(`${kind}-current`,`当日${title}`,today,kind,`${date}实际日线；${kind==='volume'?'股':'人民币元'}换算显示`);
    if(style==='short'){
      const previous=rows.at(-2)?.[kind]??null;
      add(`${kind}-previous`,`上日${title}`,previous,kind,'相邻交易日实际值');
      add(`${kind}-daily-delta`,`较上日${title}变化`,today!==null&&previous!==null?today-previous:null,kind,'当日实际值−上个交易日实际值；正值放量、负值缩量');
    }
    if(style==='swing'){
      const previous=rows.slice(-6,-1).map(b=>b[kind]);
      const average=previous.length===5&&previous.every(v=>v!==null)?previous.reduce<number>((s,v)=>s+v!,0)/5:null;
      add(`${kind}-five-day-average`,`前五日平均${title}`,average,kind,'不含当日的前五个交易日实际值算术平均');
      add(`${kind}-five-day-delta`,`较前五日均值${title}变化`,today!==null&&average!==null?today-average:null,kind,'当日实际值−前五日平均；不是倍数');
      const total=(items:Bar[])=>items.length&&items.every(b=>b[kind]!==null)?items.reduce((s,b)=>s+b[kind]!,0):null;
      const current=total(thisMonth),prior=previousMonth.length>=thisMonth.length?total(previousMonth.slice(0,thisMonth.length)):null;
      const basis=`本月截至${date}共${thisMonth.length}个交易日；对比上月前${thisMonth.length}个交易日，非上月全月`;
      add(`${kind}-month-current`,`本月至今${title}`,current,kind,basis);
      add(`${kind}-month-previous`,`上月同期${title}`,prior,kind,basis);
      add(`${kind}-month-delta`,`较上月同期${title}变化`,current!==null&&prior!==null?current-prior:null,kind,`${basis}；本月累计−上月同期累计`);
    }
  }
  return metrics;
}
