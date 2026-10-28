import type { Metric } from "../domain";
import type { FinancialFrequency, FinancialPeriod } from "../value-types";
import { disclosedRows, finite, percentChange, ratio } from "../metrics";
import { shanghaiDate } from "../dates";

export type FinancialRow = Record<string, unknown>;
export interface FinancialDataset { income: FinancialRow[]; balance: FinancialRow[]; cash: FinancialRow[]; ids: {income:string;balance:string;cash:string} }
export function visibleFinancialRows(rows: FinancialRow[], date: string) {
  const seen = new Set<number>();
  return disclosedRows(rows,date).sort((a,b)=>Number(b.period_end_ms)-Number(a.period_end_ms)||Number(b.report_date_ms)-Number(a.report_date_ms)).filter(row=>{
    const end=Number(row.period_end_ms);
    if(seen.has(end)) return false;
    seen.add(end); return true;
  });
}
export function financialPeriods(input:FinancialDataset,frequency:FinancialFrequency,date:string):FinancialPeriod[] {
  const income=visibleFinancialRows(input.income,date), balances=visibleFinancialRows(input.balance,date), cash=visibleFinancialRows(input.cash,date);
  return income.slice(0,2).map(current=>{
    const periodEnd=shanghaiDate(Number(current.period_end_ms));
    const balance=balances.find(r=>r.period_end_ms===current.period_end_ms), flow=cash.find(r=>r.period_end_ms===current.period_end_ms);
    const prior=income.find(r=>Number(r.fiscal_year)===Number(current.fiscal_year)-1 && (frequency==="annual" || r.fiscal_period===current.fiscal_period) && typeof current.currency==="string" && r.currency===current.currency);
    const disclosures={income:shanghaiDate(Number(current.report_date_ms)),balance:balance?shanghaiDate(Number(balance.report_date_ms)):null,cash:flow?shanghaiDate(Number(flow.report_date_ms)):null};
    const metrics:Metric[]=[];
    const label=frequency==="annual"?`${current.fiscal_year??periodEnd.slice(0,4)} 年报`:`${current.fiscal_year??periodEnd.slice(0,4)} ${current.fiscal_period??periodEnd.slice(5,7)} 季报`;
    const base=`${label}；报告期末${periodEnd}；${frequency==="quarterly"?"供应商季度报告口径，未混作单季值，不计算环比":"已披露年度合并报表"}`;
    const add=(id:string,title:string,value:number|null,unit:string,formula:string,kinds:(keyof FinancialDataset["ids"])[],rows:FinancialRow[]=[])=>{
      const dateRows=rows.length?rows:kinds.map(k=>k==="income"?current:k==="balance"?balance:flow).filter((r):r is FinancialRow=>!!r);
      const dates=dateRows.map(r=>shanghaiDate(Number(r.report_date_ms))).sort();
      metrics.push({id,label:title,value,unit,note:`${base}；${formula}`,evidenceIds:kinds.map(k=>input.ids[k]),observedDate:dates.at(-1)??disclosures.income,reportPeriods:[...new Set(dateRows.map(r=>shanghaiDate(Number(r.period_end_ms))))]});
    };
    const currency=current.currency==="CNY"?"元":"原币元";
    add("revenue","营业收入",finite(current.operating_income),currency,"operating_income",["income"]);
    add("net-profit","净利润",finite(current.net_profit),currency,"合并net_profit，非归母口径",["income"]);
    add("parent-profit","归母净利润",finite(current.parent_holder_net_profit),currency,"parent_holder_net_profit，归属母公司股东口径",["income"]);
    add("parent-profit-yoy","归母净利润同比",prior?percentChange(current.parent_holder_net_profit,prior.parent_holder_net_profit):null,"%","相邻年度同报告期归母净利润比较；基数≤0不计算",["income"],prior?[current,prior]:[current]);
    add("revenue-yoy","营收同比",prior?percentChange(current.operating_income,prior.operating_income):null,"%","相邻年度同报告期营收比较；缺同期或基数≤0不计算",["income"],prior?[current,prior]:[current]);
    add("profit-yoy","净利润同比",prior?percentChange(current.net_profit,prior.net_profit):null,"%","相邻年度同报告期合并净利润比较；基数≤0不计算",["income"],prior?[current,prior]:[current]);
    add("margin","净利率",ratio(current.net_profit,current.operating_income,100),"%","净利润/营收×100",["income"]);
    const balanceCompatible=balance && typeof current.currency==="string" && current.currency===balance.currency;
    const cashCompatible=flow && typeof current.currency==="string" && current.currency===flow.currency;
    add("assets","总资产",balanceCompatible?finite(balance.assets_total):null,currency,"与利润表相同报告期、同币种",["income","balance"]);
    add("liabilities","负债合计",balanceCompatible?finite(balance.total_debt):null,currency,"total_debt为负债合计，不称有息债务",["income","balance"]);
    add("debt-ratio","资产负债率",balanceCompatible?ratio(balance.total_debt,balance.assets_total,100):null,"%","同期负债合计/资产总计×100",["income","balance"]);
    add("cash-assets","货币资金/总资产",balanceCompatible?ratio(balance.cash,balance.assets_total,100):null,"%","同期货币资金/资产总计×100",["income","balance"]);
    add("operating-cash","经营现金净额",cashCompatible?finite(flow.act_cash_flow_net):null,currency,"相同报告期、同币种经营现金流量净额",["income","cash"]);
    add("cash-profit","经营现金/净利润",cashCompatible?ratio(flow.act_cash_flow_net,current.net_profit):null,"倍","同期经营现金流/净利润；净利润≤0不计算",["income","cash"]);
    return {frequency,periodEnd,label,disclosures,metrics,newOnDate:Object.values(disclosures).some(d=>d===date)};
  });
}
