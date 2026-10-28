import { reportSchema } from "./schema";
import { ReportError } from "./errors";
import { SPECIALIST_SECTIONS, type AnalysisPacket, type Claim, type ReportClaim, type ReviewReport } from "./types";
import {deduplicateReport}from"./deduplicate";

import{prohibitedNarrative as forbidden,definiteForecast,uncertaintyMarker}from"./policy";
const causal = /因为|由于|导致|受益于|受.{0,20}(刺激|驱动|影响).{0,12}(上涨|下跌|涨停)|上涨原因|下跌原因|利好推动|涨停源于/;
function hasUnsupportedCause(narrative: string) {
  // Remove only tightly scoped denials of knowing/proving a price cause.
  // Any separate causal assertion remains subject to the original check.
  const remaining = narrative.replace(/(?:尚不能|无法|不能|未能|难以|不应|不足以)(?:直接)?(?:判断|确认|核验|断言|确定|证明|解释)(?:该股|个股|股价|市场)?(?:实际|真正)?(?:的)?(?:上涨|下跌)(?:的)?原因/g, "");
  return causal.test(remaining);
}
export function evidenceText(e: AnalysisPacket["evidence"][number]) {
  const labels: Record<string,string> = { close:"收盘",change:"日涨跌幅","limit-up-pool":"涨停家数","limit-down-pool":"跌停家数","sample-max-height":"样本最高板位","previous-sample-height":"前交易日样本最高板位","sample-height-change":"样本最高板位变化","board-height":"样本板位","supplier-topic":"题材","topic-sample-count":"涨停池题材样本数","relative-daily":"相对上证指数日涨跌差",margin:"净利率",growth:"营收同比","cash-profit":"经营现金/净利润" };
  if(/^(?:industry-)?(?:volume|turnover)-/.test(e.field)){
    const key=e.field.replace(/^industry-/,''),kind=key.startsWith('volume')?'成交量':'成交额';
    const names:Record<string,string>={current:`当日${kind}`,previous:`上日${kind}`,'five-day-average':`前五日平均${kind}`,'month-current':`本月至今${kind}`,'month-previous':`上月同期${kind}`};
    const part=key.replace(/^(volume|turnover)-/,'');
    if(part.endsWith('delta')&&typeof e.value==='number'){const comparison=part==='daily-delta'?'上日':part==='five-day-delta'?'前五日均值':'上月同期';return `${e.label} · ${kind}较${comparison}${e.value>0?'放量':e.value<0?'缩量':'持平'}${e.value===0?'':` ${Math.abs(e.value)} ${e.unit}`}`;}
    return `${e.label} · ${names[part]??part}：${e.value} ${e.unit}`;
  }
  const financial:Record<string,string>={revenue:"营业收入","net-profit":"合并净利润","revenue-yoy":"同报告期营收同比","profit-yoy":"同报告期净利润同比",margin:"净利率",assets:"总资产",liabilities:"负债合计","debt-ratio":"资产负债率","cash-assets":"货币资金/总资产","operating-cash":"经营现金净额","cash-profit":"经营现金/净利润"};
  const financialKey=e.field.replace(/^(annual|quarterly)-/,"");
  if(e.field.startsWith("qoq-")){const part=e.field.replace(/^qoq-/,""),label=part.startsWith("operating_income-")?"营业收入":"归母净利润",kind=part.replace(/^(operating_income|parent_holder_net_profit)-/,""),labels:Record<string,string>={"single-current":"本季度单季","single-previous":"上季度单季",delta:"单季变化额",rate:"季度环比变化率"};return `${e.label} · ${label} · ${labels[kind]??kind}：${e.value} ${e.unit}`;}
  if(/company-industry|company-business|industry-news-title|industry-news-excerpt/.test(e.field)){const labels:Record<string,string>={"company-industry":"所选日所属行业","company-business":"主营业务背景","industry-news-title":"返回的行业资讯标题","industry-news-excerpt":"返回的行业资讯片段（非全文）"};return `${e.label} · ${labels[e.field]}：${e.value} ${e.unit}`;}
  if(financialKey==="parent-profit")return `${e.label} · 归母净利润：${e.value} ${e.unit}`;
  if(financialKey==="parent-profit-yoy")return `${e.label} · 归母净利润同比：${e.value} ${e.unit}`;
  const field = e.field==="notice-title"?"公告题名":e.field==="notice-excerpt"?"公告检索片段（前120字，非全文）":e.field==="hypothesis-check"?"当前用户条件回看核验":/^(annual|quarterly)-/.test(e.field)?financial[financialKey]??financialKey:e.field.startsWith("historical-pe-ttm-")?`PE(TTM) · ${e.observedDate}`:e.field.startsWith("historical-pb-")?`PB · ${e.observedDate}`:labels[e.field] ?? e.field.replace("day-","日线 · ").replace("week-","周线 · ").replace("month-","月线 · ").replace("income-0-operating_income","最新可见年报营收").replace("income-1-operating_income","上一可见年报营收").replace("income-0-net_profit","最新可见年报净利润").replace("income-1-net_profit","上一可见年报净利润").replace("cash-0-act_cash_flow_net","同报告期经营现金净额").replace("change","周期涨跌幅").replace("position","相对位置");
  return `${e.label} · ${field}：${e.value}${e.unit ? ` ${e.unit}` : ""}`;
}
export function validateReport(raw: unknown, packet: AnalysisPacket, model: string, responseId: string): ReviewReport {
  const parsed = reportSchema(packet.style,packet.plan,packet.plan?.includeWatchlist===false?0:packet.symbols.length).safeParse(raw);
  if (!parsed.success) throw new ReportError("SCHEMA_INVALID", "AI 返回的报告结构不完整，未展示未验证内容。请重试。");
  const draft = parsed.data;
  if (draft.date !== packet.date || draft.style !== packet.style) throw new ReportError("CONTEXT_MISMATCH", "AI 报告日期或策略不匹配，结果已拦截。");
  const sectionKeys = packet.plan?.sections.map(s=>s.key)??Object.keys(SPECIALIST_SECTIONS[packet.style]);
  if (new Set(draft.specialist.map(s=>s.key)).size !== sectionKeys.length || !sectionKeys.every(key=>draft.specialist.some(s=>s.key===key))) throw new ReportError("STRUCTURE_INVALID", "AI 缺少当前投资风格的专项结构。");
  const expectedSymbols=packet.plan?.includeWatchlist===false?[]:packet.symbols;
  if (draft.watchlist.length !== expectedSymbols.length || new Set(draft.watchlist.map(s=>s.subject)).size !== expectedSymbols.length || draft.watchlist.some(s=>!expectedSymbols.includes(s.subject))) throw new ReportError("SUBJECT_MISMATCH", "AI 自选股范围不匹配，结果已拦截。");
  const byId = new Map(packet.evidence.map(e=>[e.id,e]));
  const verify = (item: Claim, requiredSubject?: string): ReportClaim => {
    if (!packet.subjects.includes(item.subject) || (requiredSubject && item.subject !== requiredSubject)) throw new ReportError("SUBJECT_MISMATCH", "AI 分析对象与当前证据不匹配。");
    if (forbidden.test(item.narrative) || definiteForecast.test(item.narrative)) throw new ReportError("COMPLIANCE_REJECTED", "AI 含有预测、收益承诺或交易建议，报告已拦截。");
    if (hasUnsupportedCause(item.narrative)) throw new ReportError("CAUSAL_REJECTED", "没有事件证据的涨跌归因已拦截。");
    const citedNotice=item.evidence_ids.some(id=>byId.get(id)?.field==="notice-excerpt");
    if(item.kind === "inference" && /政策|收购|并购|增持|减持|订单|合同/.test(item.narrative)) throw new ReportError("UNSUPPORTED_EVENT", "片段不能支持该类完整事件或行业归因，本项已拦截。");
    if(item.kind === "inference" && /行业轮动|行业景气|行业发展|产业变化|行业变化|经营影响/.test(item.narrative)&&!item.evidence_ids.some(id=>byId.get(id)?.field==="industry-news-excerpt"))throw new ReportError("UNSUPPORTED_EVENT","缺少同对象、已过滤日期的行业发展文本证据，不能从行业名称或价格推断发展。");
    if(item.kind === "inference" && /公告|新闻/.test(item.narrative) && !citedNotice)throw new ReportError("UNSUPPORTED_EVENT", "公告解读未引用同对象、已过滤日期的片段证据。");
    if(item.kind === "inference" && /题材|热点/.test(item.narrative) && !item.evidence_ids.some(id=>["supplier-topic","topic-sample-count"].includes(byId.get(id)?.field ?? ""))) throw new ReportError("UNSUPPORTED_TOPIC", "题材推断未引用同日题材样本，已拦截。");
    if (/[\d０-９]|[零〇一二三四五六七八九十百千万亿两]+(?:点|元|％|%|倍|家|板|成|股)/.test(item.narrative)) throw new ReportError("UNBOUND_VALUE", "AI 叙述包含未绑定的数字，报告已拦截。");
    if (new Set(item.evidence_ids).size !== item.evidence_ids.length || new Set(item.values.map(v=>v.evidence_id)).size !== item.values.length) throw new ReportError("CITATION_INVALID", "AI 存在重复或歧义引用。");
    const cited = item.evidence_ids.map(id => {
      const e=byId.get(id);
      if (!e) throw new ReportError("CITATION_INVALID", "AI 引用了不存在的证据，报告已拦截。");
      if (e.status !== "usable" || e.date !== packet.date || e.observedDate > packet.date || e.subject !== item.subject || !e.sources.length) throw new ReportError("EVIDENCE_CONTEXT", "AI 引用日期、对象或证据状态不匹配。");
      return e;
    });
    for (const v of item.values) {
      const e=byId.get(v.evidence_id);
      if (!item.evidence_ids.includes(v.evidence_id) || !e || typeof e.value !== typeof v.value || e.value !== v.value || e.unit !== v.unit) throw new ReportError("VALUE_MISMATCH", "AI 输出数值、题材或单位与原始证据不一致，报告已拦截。");
    }
    if (item.kind === "fact") {
      if(cited.length&&cited.every(e=>/^index-/.test(e.sources[0]?.endpoint??"")&&["close","change"].includes(e.field)))throw new ReportError("INDEX_RECAP","AI重复播报指数行情，未通过报告信息密度检查。");
      if(cited.length&&cited.every(e=>["close","change"].includes(e.field)&&/^\d{6}\.(SH|SZ)$/.test(e.subject)&&!packet.symbols.includes(e.subject)))throw new ReportError("INDEX_RECAP","报告不能只重复指数收盘或涨跌数字。");
      if (item.narrative !== "" || !cited.length || cited.length !== item.values.length) throw new ReportError("FACT_UNVERIFIED", "事实必须完全由已核对的证据字段生成，不接受模型自由叙述。");
      return { ...item, text: cited.map(evidenceText).join("；"), validation:"matched_data" };
    }
    if (!item.narrative || !uncertaintyMarker.test(item.narrative) || (item.kind === "inference" && !cited.length)) throw new ReportError("INFERENCE_UNGROUNDED", "AI 推断缺少证据或不确定性标识。");
    return { ...item, text:item.narrative.replace(/供应商题材/g,"题材"), validation:"unverified_interpretation" };
  };
  const report: ReviewReport={ id:packet.id, date:packet.date, style:packet.style, symbols:packet.symbols, generatedAt:new Date().toISOString(), model, responseId, partial:packet.partial, limitations:packet.limitations, summary:draft.summary.map(c=>verify(c)), observations:draft.observations.map(c=>verify(c)), specialist:draft.specialist.map(s=>({key:s.key,title:SPECIALIST_SECTIONS[packet.style][s.key as keyof typeof SPECIALIST_SECTIONS[typeof packet.style]] as string,items:s.items.map(c=>verify(c))})), watchlist:draft.watchlist.map(s=>({subject:s.subject,items:s.items.map(c=>verify(c,s.subject))})), risks:draft.risks.map(c=>verify(c)), evidence:packet.evidence };
  const claims=[...report.summary,...report.observations,...report.specialist.flatMap(s=>s.items),...report.watchlist.flatMap(s=>s.items),...report.risks];
  if (!claims.some(c=>c.kind === "fact"||(c.kind==="inference"&&c.values.length>0))) throw new ReportError("NO_FACTS", "AI 未返回任何可逐值核对的数据，报告未发布。");
  report.configurationKey=packet.configurationKey;report.configurationSnapshot=packet.configurationSnapshot;
  report.specialist=report.specialist.map(section=>({...section,title:packet.plan?.sections.find(s=>s.key===section.key)?.title??section.title}));
  // Omit generic trend disclaimers; concrete missing fields remain in limitations.
  const objective=(items:ReportClaim[])=>items.filter(c=>c.kind==='fact'||!/(?:现有证据|证据不足以|不足以确认.{0,12}(?:趋势|反转)|无法确认波段趋势|不能确认趋势)/.test(c.text));
  report.summary=objective(report.summary);report.observations=objective(report.observations);report.risks=objective(report.risks);
  report.specialist=report.specialist.map(s=>({...s,items:objective(s.items)}));report.watchlist=report.watchlist.map(s=>({...s,items:objective(s.items)}));
  if(![...report.summary,...report.observations,...report.specialist.flatMap(s=>s.items),...report.watchlist.flatMap(s=>s.items)].some(c=>c.kind==='fact'||c.values.length))throw new ReportError('NO_FACTS','本次模型只返回泛化说明，没有可展示的数据描述。');
  return deduplicateReport(report,ids=>ids.map(id=>evidenceText(byId.get(id)!)).join("；"));
}
