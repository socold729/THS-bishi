import assert from "node:assert/strict";
import { test } from "node:test";
import { createFuyaoClient } from "../src/lib/finance/transport";

function clientWith(response: Response) { return createFuyaoClient({ apiKey: "test-only-not-a-real-credential", fetcher: (async () => response) as typeof fetch }); }
test("missing credentials do not send a request", async () => {
  let called = false;
  const client = createFuyaoClient({ fetcher: (async () => { called = true; throw new Error(); }) as typeof fetch });
  assert.equal((await client("/api/test")).status, "unavailable"); assert.equal(called, false);
});
test("HTTP 200 with a business authentication error is failure", async () => {
  const result = await clientWith(Response.json({ code: 2003, message: "Invalid key", data: null, request_id: "test-auth" }))("/api/test");
  assert.equal(result.ok, false); assert.equal(result.requestId, "test-auth"); assert.equal(result.data, null);
});
test("rate limiting without a standard envelope is explicit failure", async () => assert.equal((await clientWith(new Response("rate limit", { status: 429 }))("/api/test")).ok, false));
test("schema mismatch cannot create an apparently normal dataset", async () => assert.equal((await clientWith(Response.json({ prices: [1, 2] }))("/api/test")).ok, false));
test("empty response stays empty", async () => assert.equal((await clientWith(Response.json({ code: 0, message: "success", data: null }))("/api/test")).status, "empty"));
test("source time and request identifier survive normalization", async () => {
  const result = await clientWith(Response.json({ code: 0, message: "success", request_id: "test-id", data: { timestamp: 123, item: [] } }))("/api/test");
  assert.equal(result.sourceTime, 123); assert.equal(result.requestId, "test-id"); assert.equal(result.ok, true);
});
test("connection failures do not leak secrets or raw errors", async () => {
  const client = createFuyaoClient({ apiKey: "test-only-secret", fetcher: (async () => { throw new Error("test-only-secret"); }) as typeof fetch });
  const result = await client("/api/test"); assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes("test-only-secret"), false);
});
test("untrusted host cannot receive provider credentials", async () => {
  let called = false;
  const client = createFuyaoClient({ apiKey: "test-only-secret", baseUrl: "https://untrusted.example", fetcher: (async () => { called = true; return Response.json({}); }) as typeof fetch });
  assert.equal((await client("/api/test")).ok, false); assert.equal(called, false);
});
