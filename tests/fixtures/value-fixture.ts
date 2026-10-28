// Constructed financial/announcement data for tests only. Never imported by app.
import {fixture}from"./report-fixture";
import {financialPeriods,type FinancialDataset}from"../../src/lib/finance/financials";
import{dateMs}from"../../src/lib/dates";
export function valueFixture(date="2026-10-27") {
  const data=fixture("value");data.date=date;const stock=data.stocks[0],base=data.evidence[0];
  const annualIncome=data.evidence.find(e=>e.id==="income-600519.SH")!.observations.map(r=>({...r,currency:"CNY"}));
  const annualCash=data.evidence.find(e=>e.id==="cash-600519.SH")!.observations.map(r=>({...r,currency:"CNY"}));
  const annualBalance=annualIncome.map(r=>({...r,assets_total:2000,total_debt:800,cash:500}));
  const q=(year:number,period:string,end:string,revenue:number,profit:number)=>({fiscal_year:year,fiscal_period:period,period_end_ms:dateMs(end),report_date_ms:dateMs(year===2026?"2026-08-14":"2025-08-14"),currency:"CNY",operating_income:revenue,net_profit:profit});
  const quarterly:FinancialDataset={income:[q(2026,"Q2","2026-06-30",500,50),q(2026,"Q1","2026-03-31",200,20),q(2025,"Q2","2025-06-30",400,40)],balance:[{...q(2026,"Q2","2026-06-30",0,0),assets_total:1000,total_debt:400,cash:250}],cash:[{...q(2026,"Q2","2026-06-30",0,0),act_cash_flow_net:70}],ids:{income:"quarter-income-600519.SH",balance:"quarter-balance-600519.SH",cash:"quarter-cash-600519.SH"}};
  const annual:FinancialDataset={income:annualIncome,balance:annualBalance,cash:annualCash,ids:{income:"income-600519.SH",balance:"balance-600519.SH",cash:"cash-600519.SH"}};
  for(const ds of [annual,quarterly])for(const kind of ["income","balance","cash"]as const){data.evidence=data.evidence.filter(e=>e.id!==ds.ids[kind]);data.evidence.push({...base,id:ds.ids[kind],count:ds[kind].length,observations:ds[kind] as any});}
  const notice={id:"test-notice",code:stock.code,title:"测试公司年度报告",date:"2026-04-17",excerpt:"明确构造的测试公告片段，不是真实公告。",url:null,evidenceIds:["notice-600519.SH"]};
  const valuations=[{date,peTtm:20,pb:5,pbBasis:"PB（测试口径）",evidenceIds:["historical-valuation-600519.SH"]},{date:"2025-12-31",peTtm:18,pb:4,pbBasis:"PB（测试口径）",evidenceIds:["historical-valuation-600519.SH"]}];
  data.evidence.push({...base,id:"notice-600519.SH",source:"iFinD",observations:[{code:notice.code,title:notice.title,date:notice.date,excerpt:notice.excerpt,url:null}],count:1},{...base,id:"historical-valuation-600519.SH",source:"iFinD",observations:valuations.map(v=>({thscode:stock.code,date:v.date,pe_ttm:v.peTtm,pb:v.pb})),count:2});
  stock.value={reports:[...financialPeriods(annual,"annual",date),...financialPeriods(quarterly,"quarterly",date)],valuations,announcements:[notice],warnings:["明确构造数据，仅验证产品行为。"],rejectedAnnouncements:0};
  return data;
}
