import{markdownRows}from"./value-normalize";import{normalizeDate,shanghaiDate,dateMs}from"../dates";import{finite,percentChange}from"../metrics";import{visibleFinancialRows,type FinancialRow}from"./financials";
export interface QuarterComparison{field:string;label:string;periodEnd:string;previousPeriodEnd:string|null;disclosedAt:string|null;current:number|null;previous:number|null;delta:number|null;rate:number|null;basis:"verified-ytd"|"verified-single"|"unknown";evidenceIds:string[];formula:string;reason:string}
export function reportedNumber(value:unknown):number|null{if(typeof value==="number")return Number.isFinite(value)?value:null;if(typeof value!=="string")return null;const m=value.trim().match(/^([-+]?\d+(?:\.\d+)?)\s*(亿|万)?(?:元)?$/);return m?Number(m[1])*(m[2]==="亿"?1e8:m[2]==="万"?1e4:1):null;}
function displayTolerance(value:unknown){if(typeof value==="number")return .005;const match=String(value).trim().match(/^[-+]?\d+(?:\.(\d+))?\s*(亿|万)?(?:元)?$/);if(!match)return null;return .5*(match[2]==="亿"?1e8:match[2]==="万"?1e4:1)*10**-(match[1]?.length??0)+.005;}
export function previousQuarterEnd(day:string){const year=+day.slice(0,4),month=+day.slice(5,7);return month===3?`${year-1}-12-31`:month===6?`${year}-03-31`:month===9?`${year}-06-30`:`${year}-09-30`;}
export function quarterlyAmount(rows:FinancialRow[],end:string,field:string,basis:"ytd"|"single"){
  const row=rows.find(r=>shanghaiDate(Number(r.period_end_ms))===end);if(!row)return null;const amount=finite(row[field]);if(amount===null)return null;
  if(basis==="single"||end.slice(5,7)==="03")return amount;
  const prior=rows.find(r=>shanghaiDate(Number(r.period_end_ms))===previousQuarterEnd(end));if(!prior||typeof row.currency!=="string"||row.currency!==prior.currency)return null;
  const base=finite(prior[field]);return base===null?null:amount-base;
}
// A separate, matching MCP single-quarter result corroborates both the source
// cumulative figure and the derived amount. Inconsistent quarter metadata fails.
export function corroboratesYtd(input:unknown,code:string,row:FinancialRow,field:string,derived:number|null){
  if(!input||typeof input!=="object"||derived===null||row.currency!=="CNY")return false;const data=input as any;
  const end=shanghaiDate(Number(row.period_end_ms)),quarter=Math.ceil(+end.slice(5,7)/3),quarterName=["第一季度","第二季度","第三季度","第四季度"][quarter-1];
  const record=markdownRows(data.answer??"").find(r=>r["证券代码"]===code&&normalizeDate(r["日期"]??"")===end);if(!record)return false;
  const label=field==="operating_income"?"营业收入":"归属于母公司所有者的净利润";
  const singleKey=Object.keys(record).find(k=>k.startsWith("单季度.")&&k.includes(label)&&!k.includes("同比")),totalKey=Object.keys(record).find(k=>!k.startsWith("单季度.")&&k.startsWith(label)&&!k.includes("同比"));
  const metadata=data.indicators_params?.[`单季度.${label}`];
  if(!singleKey||!totalKey||metadata?.["季度"]!==quarterName||metadata?.["报表类型"]!=="合并报表")return false;
  const single=reportedNumber(record[singleKey]),total=reportedNumber(record[totalKey]),amount=finite(row[field]);
  // Error bounds follow each cell's explicit scale and decimal precision. Coarse
  // displays are rejected; exact yuan cells never get a blanket 5,000-yuan pass.
  const singleTolerance=displayTolerance(record[singleKey]),totalTolerance=displayTolerance(record[totalKey]);
  return single!==null&&total!==null&&amount!==null&&singleTolerance!==null&&totalTolerance!==null&&singleTolerance<=5001&&totalTolerance<=5001&&Math.abs(single-derived)<=singleTolerance&&Math.abs(total-amount)<=totalTolerance;
}
export function quarterComparisons(input:FinancialRow[],date:string,verified:Partial<Record<string,{current:boolean;previous:boolean;sourceIds:string[]}>>={},explicitBasis?:"ytd"|"single"):QuarterComparison[]{
  const rows=visibleFinancialRows(input,date),row=rows[0];if(!row)return[];const end=shanghaiDate(Number(row.period_end_ms)),previous=previousQuarterEnd(end);
  return [["operating_income","营业收入"],["parent_holder_net_profit","归母净利润"]].map(([field,label])=>{
    const confirmed=verified[field],basis=explicitBasis??(confirmed?.current&&confirmed?.previous?"ytd":null);
    const previousRow=rows.find(r=>shanghaiDate(Number(r.period_end_ms))===previous),sameCurrency=typeof row.currency==="string"&&row.currency===previousRow?.currency;
    const current=basis&&sameCurrency?quarterlyAmount(rows,end,field,basis):null,prior=basis&&sameCurrency?quarterlyAmount(rows,previous,field,basis):null;
    const used=rows.filter(r=>[end,previous,previousQuarterEnd(previous)].includes(shanghaiDate(Number(r.period_end_ms))));
    return{field,label,periodEnd:end,previousPeriodEnd:previous,disclosedAt:used.map(r=>shanghaiDate(Number(r.report_date_ms))).sort().at(-1)??null,current,previous:prior,delta:current!==null&&prior!==null?current-prior:null,rate:percentChange(current,prior),basis:basis==="ytd"?"verified-ytd":basis==="single"?"verified-single":"unknown",evidenceIds:[...new Set(["quarter-income-"+String(row.thscode??""),...(confirmed?.sourceIds??[])])],formula:basis==="single"?"直接使用已明确口径的单季度值；变化额=本季−上季；变化率=(本季/上季−1)×100，仅上季>0":basis==="ytd"?"Q1=累计；Q2/Q3/Q4=同年本报告期累计−上一报告期累计；变化额=本季单季−上季单季；变化率=(本季单季/上季单季−1)×100，仅上季>0；iFinD单季度字段交叉核对":"单季/累计口径未取得同报告期交叉核验，不计算环比",reason:current===null||prior===null?"暂无可比环比数据":prior<=0?"上季度为零或负数，仅展示变化额，不计算变化率":"同币种、同季度口径、披露日已过滤"} as QuarterComparison;
  });
}
