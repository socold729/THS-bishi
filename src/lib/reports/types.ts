import type { Style } from "../domain";
import type {ReviewPlan} from "./plan";
import type {HypothesisCondition} from "../investment-hypotheses";
export interface ReportConfiguration {style:Style;symbols:string[];customInstructions:string;hypotheses:HypothesisCondition[];plan:ReviewPlan}

export interface ReportEvidence {
  id: string; date: string; observedDate: string; subject: string; label: string;
  field: string; value: number | string; unit: string; scope: string;
  sources: { source: string; endpoint: string; requestId: string | null; fetchedAt: string; sourceTime: number | null }[];
  formula: string; status: "usable";
}
export interface AnalysisPacket {
  plan?:ReviewPlan;
  configurationSnapshot?:ReportConfiguration;
  configurationKey?: string;
  id: string; date: string; style: Style; symbols: string[]; subjects: string[];
  evidence: ReportEvidence[]; limitations: string[]; partial: boolean;
}
export const SPECIALIST_SECTIONS = {
  short: { sentiment: "情绪与涨跌停分布", ladder: "连板高度与梯队变化", candidates: "高位候选与题材样本" },
  swing: { structure: "日周月趋势结构", industry: "行业与板块分析" },
  value: { business: "经营与财务变化", valuation: "估值与历史信息", industry: "行业发展与证据边界", tracking: "基本面跟踪" },
} as const;
export interface Claim {
  kind: "fact" | "inference" | "uncertainty"; subject: string; narrative: string;
  evidence_ids: string[]; values: { evidence_id: string; value: number | string; unit: string }[];
}
export interface ReportDraft {
  date: string; style: Style; summary: Claim[]; observations: Claim[];
  specialist: { key: string; items: Claim[] }[];
  watchlist: { subject: string; items: Claim[] }[]; risks: Claim[];
}
export interface ReportClaim extends Claim { text: string; validation: "matched_data" | "unverified_interpretation" }
export interface ReviewReport {
  configurationSnapshot?:ReportConfiguration;
  deduplicatedCount?:number;
  configurationKey?: string;
  id: string; date: string; style: Style; symbols: string[]; generatedAt: string;
  model: string; responseId: string; partial: boolean; limitations: string[];
  summary: ReportClaim[]; observations: ReportClaim[];
  specialist: { key: string; title: string; items: ReportClaim[] }[];
  watchlist: { subject: string; items: ReportClaim[] }[]; risks: ReportClaim[];
  evidence: ReportEvidence[];
}
export type TaskPhase = "fetching" | "analyzing" | "validating" | "completed" | "failed" | "cancelled";
export interface ReportTask {
  configurationKey?: string;
  id: string; date: string; style: Style; symbols: string[]; status: TaskPhase;
  createdAt: string; updatedAt: string; report?: ReviewReport; error?: string; errorCode?: string;
}
