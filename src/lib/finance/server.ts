import "server-only";
import { createFuyaoClient } from "./transport";
export const fuyao = createFuyaoClient({ apiKey: process.env.FUYAO_API_KEY, baseUrl: process.env.FUYAO_BASE_URL, timeoutMs: Math.min(20000, Math.max(1000, Number(process.env.DATA_REQUEST_TIMEOUT_MS) || 12000)) });
