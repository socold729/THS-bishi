import type { LadderRow } from "./domain";
const levels = [
  ["seven_over", "7板及以上", 7], ["six_board", "6板", 6], ["five_board", "5板", 5],
  ["four_board", "4板", 4], ["three_board", "3板", 3], ["two_board", "2板", 2],
] as const;

export function ladderRows(boards: Record<string, unknown> | undefined, sameDayLimitUpRows: Record<string, unknown>[]): LadderRow[] {
  const topics = new Map<string, string>();
  for (const row of sameDayLimitUpRows) {
    if (typeof row.thscode === "string" && typeof row.limit_up_reason === "string" && row.limit_up_reason.trim()) topics.set(row.thscode, row.limit_up_reason.trim());
  }
  return levels.map(([key, label, height]) => {
    const rows = Array.isArray(boards?.[key]) ? (boards[key] as unknown[]).filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null) : [];
    const stocks = rows.filter(row => typeof row.name === "string" && row.name.trim()).sort((a, b) => Number(b.board_num ?? height) - Number(a.board_num ?? height)).map(row => {
      const topic = typeof row.thscode === "string" ? topics.get(row.thscode) ?? null : null;
      return { name: String(row.name), topic, evidenceIds: topic ? ["ladder", "limit-up-pool"] : ["ladder"] };
    });
    return { label, height, stocks };
  }).filter(row => row.stocks.length > 0);
}
