import { NextRequest, NextResponse } from "next/server";
import { fuyao } from "@/lib/finance/server";
import { records } from "@/lib/finance/transport";
import { symbolSchema } from "@/lib/domain";
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 40) return NextResponse.json({ error: "请输入不超过40字的名称或完整代码。" }, { status: 400 });
  const result = await fuyao("/api/meta/tickers/search", { q, asset_type: "a-share", limit: 5 });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 503 });
  const items = records(result.data).filter(row => symbolSchema.safeParse(row.thscode).success && typeof row.name === "string").map(row => ({ code: String(row.thscode), name: String(row.name) }));
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
