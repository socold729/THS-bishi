import { normalizeDate, validDate } from "../dates";
import type { CompanyAnnouncement, DatedValuation } from "../value-types";

export function safeSourceUrl(value:unknown):string|null {
  if(typeof value!=="string")return null;
  try{const url=new URL(value);if(!["http:","https:"].includes(url.protocol)||url.username||url.password)return null;return url.href;}catch{return null;}
}
export function normalizeAnnouncements(input:unknown,code:string,name:string,date:string,start:string,evidenceId:string) {
  const warnings:string[]=[],items:CompanyAnnouncement[]=[];let rejected=0;
  if(!Array.isArray(input))return {items,rejected,warnings:["公告响应不是可解析的记录列表。"]};
  for(const value of input) {
    if(!value||typeof value!=="object")continue;const row=value as Record<string,unknown>;
    if("备注"in row)continue;
    const title=String(row["公告标题"]??""),rawDate=String(row["日期"]??row["公告日期"]??"").slice(0,10),day=normalizeDate(rawDate);
    const excerpt=String(row["公告片段内容"]??row["公告内容"]??"");
    if(!title||!excerpt||!validDate(day)||day>date||day<start||!(title.includes(name)||title.includes(code.slice(0,6)))){rejected++;continue;}
    const url=safeSourceUrl(row.URL??row.url??row["原文链接"]);
    const id=`${code}:${day}:${title}`;
    if(items.some(item=>item.id===id))continue;
    items.push({id,code,title,date:day,excerpt:excerpt.slice(0,1200),url,evidenceIds:[evidenceId]});
  }
  if(rejected)warnings.push(`${rejected}条公告因日期、公司身份或字段不完整被排除。`);
  if(items.some(i=>!i.url))warnings.push("部分公告仅有题名、日期和检索片段，无可核验原文链接；不能将片段当作全文。");
  return {items:items.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,3),rejected,warnings};
}
export function valuationDates(date:string):string[] {
  const year=Number(date.slice(0,4));
  return [...new Set([date,`${year}-06-30`,`${year-1}-12-31`,`${year-1}-06-30`].filter(d=>d<=date))];
}
export function markdownRows(answer:string):Record<string,string>[] {
  const lines=answer.split("\n").map(s=>s.trim()).filter(s=>s.startsWith("|")&&s.endsWith("|"));
  if(lines.length<3)return [];
  const parts=(s:string)=>s.slice(1,-1).split("|").map(v=>v.trim());const header=parts(lines[0]);
  return lines.slice(2).filter(s=>!/^\|[\s:|\-]+\|$/.test(s)).map(line=>Object.fromEntries(parts(line).map((value,i)=>[header[i]??String(i),value])));
}
export function normalizeValuations(input:unknown,code:string,date:string,requestedDates:string[],evidenceId:string) {
  const object=input&&typeof input==="object"?input as Record<string,unknown>:{};
  const rows=Array.isArray(input)?input:typeof object.answer==="string"?markdownRows(object.answer):[];
  const items:DatedValuation[]=[],warnings:string[]=[],conflicts=new Set<string>();let rejected=0;
  for(const value of rows) {
    if(!value||typeof value!=="object")continue;const row=value as Record<string,unknown>,fields=Object.keys(row);
    const symbol=String(row.thscode??row["证券代码"]??row["股票代码"]??"");
    const day=normalizeDate(String(row.date??row["交易日期"]??row["日期"]??row["时间"]??"").slice(0,10));
    if(symbol!==code||!validDate(day)||day>date||!requestedDates.includes(day)){rejected++;continue;}
    const number=(v:unknown)=>{if(typeof v==="number")return Number.isFinite(v)?v:null;if(typeof v!=="string"||!/^[-+]?\d+(\.\d+)?$/.test(v.trim()))return null;return Number(v);};
    const peKey=fields.find(k=>k==="pe_ttm"||(/市盈率|PE/i.test(k)&&/TTM/i.test(k)));
    const pbKey=fields.find(k=>k==="pb"||/市净率|\bPB\b/i.test(k));
    const peTtm=peKey?number(row[peKey]):null,pb=pbKey?number(row[pbKey]):null;
    if(peTtm===null&&pb===null){rejected++;continue;}
    if(conflicts.has(day)){rejected++;continue;}
    const previous=items.findIndex(i=>i.date===day);
    if(previous>=0){
      const prior=items[previous];
      if(prior.peTtm!==peTtm||prior.pb!==pb||prior.pbBasis!==(pbKey??"PB口径未返回")){
        items.splice(previous,1);conflicts.add(day);rejected+=2;warnings.push(`${day}估值存在冲突，已排除该时点全部记录。`);
      }else warnings.push(`${day}估值返回相同重复记录，未追加。`);
      continue;
    }
    items.push({date:day,peTtm,pb,pbBasis:pbKey??"PB口径未返回",evidenceIds:[evidenceId]});
  }
  if(rejected)warnings.push(`${rejected}条估值因标的、明确日期、指标口径或数值无法核验而排除。`);
  if(!items.some(i=>i.date===date))warnings.push("未取得可核验的所选日历史估值，未用最新快照回填。");
  warnings.push("历史估值只比较返回的少量实际时点，不计算历史分位或据此判断便宜/昂贵。");
  return {items:items.sort((a,b)=>b.date.localeCompare(a.date)),warnings,rejected};
}
