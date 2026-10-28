export const MOVING_AVERAGES = [
  { key: "ma5", period: 5, label: "MA5", color: "#b09a67" },
  { key: "ma10", period: 10, label: "MA10", color: "#9a78b0" },
  { key: "ma20", period: 20, label: "MA20", color: "#6377ad" },
  { key: "ma30", period: 30, label: "MA30", color: "#3b9ba7" },
  { key: "ma60", period: 60, label: "MA60", color: "#b77c8d" },
] as const;
export type MovingAverageKey = typeof MOVING_AVERAGES[number]["key"];
