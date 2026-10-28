"use client";
import { Bar as RangedBar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps, type TooltipContentProps, type TooltipValueType } from "recharts";
import type { Bar, Period } from "@/lib/domain";
import { candleGeometry, candlePoints,visibleCandlePoints } from "@/lib/candles";
import { formatNumber } from "@/lib/utils";
import { MOVING_AVERAGES } from "@/lib/moving-averages";

type CandlePoint = ReturnType<typeof candlePoints>[number];
function Candle({ x, y, width, height, payload }: BarShapeProps) {
  const row = payload as CandlePoint;
  if (![x, y, width, height].every(Number.isFinite)) return <g />;
  const geometry = candleGeometry(row, y, height);
  const center = x + width / 2, bodyWidth = Math.max(1.5, Math.min(width * 0.76, 14));
  const color = geometry.rising ? "#d55454" : "#218678";
  return <g className="candlestick" data-direction={geometry.rising ? "up" : "down"}>
    <line x1={center} x2={center} y1={geometry.top} y2={geometry.bottom} stroke={color} strokeWidth={1} />
    <rect x={center - bodyWidth / 2} y={geometry.bodyY} width={bodyWidth} height={geometry.bodyHeight} fill={color} stroke={color} strokeWidth={0.6} />
  </g>;
}
function CandleTooltip({ active, payload }: TooltipContentProps<TooltipValueType, string | number>) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as CandlePoint;
  return <div className="candle-tooltip"><strong>{point.date}</strong><dl>{([
    ["开盘", point.open_price], ["最高", point.high_price], ["最低", point.low_price], ["收盘", point.close_price], ...MOVING_AVERAGES.map(average => [average.label, point[average.key]] as const),
  ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatNumber(value)}</dd></div>)}</dl><small>单位：点 · 对应周期 OHLC</small></div>;
}
export function PriceChart({ bars, period, indicatorsComplete, name }: { bars: Bar[]; period: Period; indicatorsComplete: boolean; name: string }) {
  const data = visibleCandlePoints(bars, period, indicatorsComplete);
  if (!data.length) return <div className="empty-state chart-empty"><h3>暂时没有可绘制的行情</h3><p>需要有效的开盘、最高、最低和收盘价。数据不足时保持留白。</p></div>;
  return <div className="price-chart candlestick-chart" role="img" aria-label={`${name}${period === "day" ? "日" : period === "week" ? "周" : "月"}K线图，${data.length}根K线`}>
    <ResponsiveContainer width="100%" height="100%" minHeight={260}>
      <ComposedChart data={data} margin={{ top: 18, right: 12, left: 0, bottom: 4 }} barCategoryGap="15%">
        <CartesianGrid stroke="#edf0f2" vertical={false} />
        <XAxis dataKey="date" tickFormatter={value => value.slice(5)} minTickGap={35} tick={{ fontSize: 11, fill: "#87909d" }} axisLine={false} tickLine={false} />
        <YAxis domain={["auto", "auto"]} width={58} tick={{ fontSize: 11, fill: "#87909d" }} tickFormatter={value => Number(value).toFixed(0)} axisLine={false} tickLine={false} />
        <Tooltip content={CandleTooltip} cursor={{ stroke: "#bec6cd", strokeDasharray: "3 3" }} />
        <RangedBar dataKey="range" name="OHLC" shape={Candle} isAnimationActive={false} maxBarSize={20} />
        {MOVING_AVERAGES.map(average => <Line key={average.key} pointerEvents="none" className={`moving-average-${average.key}`} type="linear" dataKey={average.key} name={average.label} stroke={average.color} strokeWidth={1.1} dot={false} isAnimationActive={false} connectNulls={false} />)}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}
