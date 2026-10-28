import { NextRequest, NextResponse } from "next/server";
import { styleSchema, symbolSchema } from "@/lib/domain";
import { validDate } from "@/lib/dates";
import { loadDashboard } from "@/lib/finance/dashboard";
export const runtime = "nodejs";
export const maxDuration = 75;
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const style = styleSchema.safeParse(query.get("style") ?? "short");
  const date = query.get("date") || undefined;
  const symbols = [...new Set((query.get("symbols") ?? "").split(",").filter(Boolean))];
  if (!style.success || (date && !validDate(date)) || symbols.length > 3 || symbols.some(s => !symbolSchema.safeParse(s).success)) return NextResponse.json({ error: "日期、策略或自选股参数无效（最多3只完整 A 股代码）。" }, { status: 400 });
  try {
    return NextResponse.json(await loadDashboard(style.data, date, symbols), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "数据处理失败，当前没有可展示的复盘结果。请稍后重试。" }, { status: 500 });
  }
}
