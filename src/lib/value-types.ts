import type { Metric } from "./domain";
import type{QuarterComparison}from"./finance/quarter-comparison";
export type FinancialFrequency = "annual" | "quarterly";
export interface FinancialPeriod {
  frequency: FinancialFrequency; periodEnd: string; label: string;
  disclosures: { income: string | null; balance: string | null; cash: string | null };
  metrics: Metric[]; newOnDate: boolean;
}
export interface DatedValuation {
  date: string; peTtm: number | null; pb: number | null; pbBasis: string;
  evidenceIds: string[];
}
export interface CompanyAnnouncement {
  id: string; code: string; title: string; date: string; excerpt: string;
  url: string | null; evidenceIds: string[];
}
export interface ValueCompanyData {
  quarterComparisons?:QuarterComparison[];
  industry?:{name:string;business:string;asOf:string;level?:string;evidenceIds:string[]};
  reports: FinancialPeriod[]; valuations: DatedValuation[];
  announcements: CompanyAnnouncement[]; warnings: string[];
  rejectedAnnouncements: number;
}
