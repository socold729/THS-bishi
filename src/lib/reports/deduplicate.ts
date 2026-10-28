import type{ReviewReport,ReportClaim}from"./types";
export function deduplicateReport(report:ReviewReport,renderFact:(ids:string[])=>string):ReviewReport {
  const facts=new Set<string>(),narratives:{subject:string;text:string;ids:string}[]=[];let removed=0;
  const grams=(s:string)=>new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));
  const normalize=(s:string)=>s.replace(/[\s，。；：、！？,.!?:;]/g,"");
  function filter(items:ReportClaim[]) {return items.flatMap(item=>{
    if(item.kind==="fact"){
      const keep=item.evidence_ids.filter(id=>!facts.has(id));removed+=item.evidence_ids.length-keep.length;
      if(!keep.length)return[];keep.forEach(id=>facts.add(id));
      return[{...item,evidence_ids:keep,values:item.values.filter(v=>keep.includes(v.evidence_id)),text:renderFact(keep)}];
    }
    const text=normalize(item.text),ids=[...item.evidence_ids].sort().join(","),a=grams(text);
    const duplicate=narratives.some(old=>{if(old.subject!==item.subject||old.ids!==ids)return false;if(old.text===text)return true;const b=grams(old.text);const common=[...a].filter(g=>b.has(g)).length;return a.size>8&&b.size>8&&common/Math.max(a.size,b.size)>.86;});
    if(duplicate){removed++;return[];}narratives.push({subject:item.subject,text,ids});return[item];
  });}
  // Keep detailed facts in their responsible module before considering summary repeats.
  const specialist=report.specialist.map(s=>({...s,items:filter(s.items)})),watchlist=report.watchlist.map(s=>({...s,items:filter(s.items)}));
  const summary=filter(report.summary),observations=filter(report.observations),risks=filter(report.risks);
  return{...report,specialist,watchlist,summary,observations,risks,deduplicatedCount:removed};
}
