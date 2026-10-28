import{markdownRows,safeSourceUrl}from"./value-normalize";
import{normalizeDate,validDate}from"../dates";
export function normalizeIndustryIdentity(input:unknown,code:string,date:string){
  const data=input as any;if(!data||typeof data!=="object")return null;const row=markdownRows(data.answer??"").find(r=>r["证券代码"]===code);if(!row)return null;
  const params=data.indicators_params??{},meta=params["所属同花顺行业"],asOf=normalizeDate(String(meta?.["截止日期"]??""));
  const businessDate=normalizeDate(String(params["主营业务"]?.["截止日期"]??""));
  if(asOf!==date||!validDate(asOf)||typeof row["所属同花顺行业"]!=="string")return null;
  return{name:row["所属同花顺行业"].replace(/[ⅠⅡⅢⅣ]+$/g,"").trim(),business:businessDate===date?(row["主营业务"]??"").slice(0,150):"",asOf,level:typeof meta?.["行业级别"]==="string"?meta["行业级别"]:"行业级别未返回"};
}
export function normalizeIndustryNews(input:unknown,name:string,date:string,start:string,evidenceId:string){
  if(!Array.isArray(input))return[];
  return input.flatMap(value=>{if(!value||typeof value!=="object"||"备注"in value)return[];const row=value as any,title=String(row["资讯标题"]??""),excerpt=String(row["资讯内容"]??"").slice(0,120),day=normalizeDate(String(row["日期"]??"").slice(0,10)),url=safeSourceUrl(row.URL??row.url);
    if(!validDate(day)||day>date||day<start||!url||!title||!excerpt||!(title+excerpt).includes(name))return[];
    return[{title,excerpt,date:day,url,evidenceIds:[evidenceId]}];}).slice(0,3);
}
