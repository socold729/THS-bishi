import { z } from "zod";

const envelope = z.object({ code: z.number(), message: z.string(), request_id: z.string().optional(), data: z.record(z.string(), z.unknown()).nullable().optional() });
export interface ProviderResult {
  ok: boolean; status: "ready" | "empty" | "unavailable" | "error";
  data: Record<string, unknown> | null; requestId: string | null; endpoint: string;
  fetchedAt: string; sourceTime: number | null; reason: string;
}
export function createFuyaoClient(options: { apiKey?: string; baseUrl?: string; timeoutMs?: number; fetcher?: typeof fetch }) {
  return async function request(path: string, params: Record<string, string | number> = {}, signal?: AbortSignal): Promise<ProviderResult> {
    const result: ProviderResult = { ok: false, status: "error", data: null, requestId: null, endpoint: path, fetchedAt: new Date().toISOString(), sourceTime: null, reason: "" };
    if (!options.apiKey?.trim()) return { ...result, status: "unavailable", reason: "尚未配置金融数据密钥，请联系部署者配置服务端环境。" };
    try {
      const url = new URL(path, options.baseUrl ?? "https://fuyao.aicubes.cn");
      if (url.protocol !== "https:" || url.hostname !== "fuyao.aicubes.cn" || !path.startsWith("/api/")) throw new Error("UNTRUSTED_PROVIDER");
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 12000);
      const response = await (options.fetcher ?? fetch)(url, { headers: { "X-api-key": options.apiKey }, cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: "error" });
      if (response.status === 429) return { ...result, reason: "数据服务限流，请稍后手动重试。" };
      if (!response.ok) return { ...result, reason: `数据服务返回 HTTP ${response.status}，本项未取得数据。` };
      const parsed = envelope.safeParse(await response.json());
      if (!parsed.success) return { ...result, reason: "数据服务响应结构异常，本项已停止分析。" };
      const body = parsed.data;
      result.requestId = body.request_id ?? null;
      // This endpoint explicitly reports a successful empty event history as 3002.
      // Do not reinterpret 3002 on other endpoints or for a mismatched security.
      if(body.code===3002&&path==="/api/a-share/corporate-actions/adjustment-factors"&&typeof params.thscode==='string'&&body.message===`No adjustment events for thscode=${params.thscode}`)return{...result,ok:true,status:'ready',data:{thscode:params.thscode,item:[],no_adjustment_events:true},reason:'接口明确返回该证券没有除权事件。'};
      if (body.code !== 0) return { ...result, reason: [2001, 2003].includes(body.code) ? "数据认证或权限校验失败，请联系部署者检查密钥与权限。" : body.code === 4001 ? "数据请求触发限流，请稍后重试。" : `数据服务业务错误 ${body.code}，本项未取得数据。` };
      if (!body.data) return { ...result, status: "empty", reason: "数据服务未返回数据。" };
      return { ...result, ok: true, status: "ready", data: body.data, sourceTime: typeof body.data.timestamp === "number" ? body.data.timestamp : null };
    } catch {
      return { ...result, reason: "金融数据请求超时或连接失败，未使用替代数据。" };
    }
  };
}
export function records(data: Record<string, unknown> | null, field = "item"): Record<string, unknown>[] {
  const items = data?.[field];
  return Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)) : [];
}
