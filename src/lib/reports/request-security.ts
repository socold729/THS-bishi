import { z } from "zod";

export const reviewSessionSchema = z.uuid();

// Next may reconstruct request.url from its listening hostname. The browser's
// destination is the HTTP Host header, so compare Origin to that authority.
// Do not accept arbitrary forwarded-host headers or allow every localhost alias.
export function isSameOrigin(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients still need a valid session token.
  try {
    const target = new URL(request.url), supplied = new URL(origin);
    if (!["http:", "https:"].includes(supplied.protocol) || supplied.origin !== origin) return false;
    const host = request.headers.get("host");
    if (host && /[\s/@?#\\]/.test(host)) return false;
    const expected = host ? new URL(`${target.protocol}//${host}`) : target;
    return supplied.origin === expected.origin;
  } catch { return false; }
}

export function getReviewSession(storage: Pick<Storage, "getItem" | "setItem">, createId: () => string = () => crypto.randomUUID()): string {
  const stored = reviewSessionSchema.safeParse(storage.getItem("mingri.review-session"));
  if (stored.success) return stored.data;
  const fresh = reviewSessionSchema.parse(createId());
  storage.setItem("mingri.review-session", fresh);
  return fresh;
}
