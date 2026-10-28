import { z } from "zod";
import { styleSchema } from "../domain";
import { validDate } from "../dates";
import { symbolSchema } from "../domain";
import { SPECIALIST_SECTIONS } from "./types";
import type { Style } from "../domain";
import { hypothesisConditionSchema } from "../investment-hypotheses";
import type {ReviewPlan} from "./plan";
import{uncertaintyMarker}from"./policy";

export const reportRequestSchema = z.strictObject({ date: z.string().refine(validDate), style: styleSchema, symbols: z.array(symbolSchema).max(3).refine(s => new Set(s).size === s.length),customInstructions:z.string().trim().max(1200).optional(),hypotheses:z.array(hypothesisConditionSchema).max(10).optional() }).refine(input=>!input.hypotheses?.length || (input.style==="value"&&input.hypotheses.every(h=>input.symbols.includes(h.code))&&new Set(input.hypotheses.map(h=>h.id)).size===input.hypotheses.length));
export function reportSchema(style: Style,plan?:ReviewPlan,watchlistCount?:number,subjects?:string[],watchlistSubjects?:string[],forModel=false,evidenceIds?:string[]) {
  const sectionKeys=plan?.sections.map(s=>s.key)??Object.keys(SPECIALIST_SECTIONS[style]);
  const escaped=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const prefix=evidenceIds?.[0]?.split(':E')[0],sharedPrefix=prefix&&evidenceIds?.every(id=>id.startsWith(prefix+':E')&&/^\d+$/.test(id.slice(prefix.length+2)));
  const pattern=evidenceIds?.length?sharedPrefix?`^${escaped(prefix!)}:E(?:${evidenceIds.map(id=>id.slice(prefix!.length+2)).join('|')})$`:`^(?:${evidenceIds.map(escaped).join('|')})$`:null;
  const evidenceId=forModel&&pattern?z.string().regex(new RegExp(pattern)):z.string();
  const looseClaim = z.strictObject({
    kind: z.enum(["fact", "inference", "uncertainty"]), subject: subjects?.length?z.enum(subjects as[string,...string[]]):z.string().min(1).max(80),
    narrative: z.string().max(240), evidence_ids: z.array(evidenceId).max(5),
    values: z.array(z.strictObject({ evidence_id: evidenceId, value: z.union([z.number(), z.string().max(160)]), unit: z.string().max(60) })).max(5),
  });
  const base=looseClaim.omit({kind:true,narrative:true}).shape;
  const claim=forModel?z.union([
    z.strictObject({...base,kind:z.literal("fact"),narrative:z.literal(""),evidence_ids:base.evidence_ids.min(1),values:base.values.min(1)}),
    z.strictObject({...base,kind:z.literal("inference"),narrative:z.string().min(1).max(240).regex(uncertaintyMarker),evidence_ids:base.evidence_ids.min(1),values:base.values.min(1)}),
    z.strictObject({...base,kind:z.literal("uncertainty"),narrative:z.string().min(1).max(240).regex(uncertaintyMarker)}),
  ]):looseClaim;
  const items = z.array(claim).max(4);
  const watchlist=z.array(z.strictObject({subject:watchlistSubjects?.length?z.enum(watchlistSubjects as[string,...string[]]):z.string(),items})).max(3);
  return z.strictObject({
    date: z.string(), style: z.literal(style), summary: z.array(claim).min(1).max(2), observations: z.array(claim).max(3),
    specialist: z.array(z.strictObject({ key: z.enum(sectionKeys as [string, ...string[]]), items })).length(sectionKeys.length),
    watchlist: watchlistCount===undefined?watchlist:watchlist.length(watchlistCount), risks: z.array(claim).max(4),
  });
}
