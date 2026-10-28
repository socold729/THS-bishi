import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function simulatedUnavailableData(context: BrowserContext) {
  await context.route("**/api/dashboard?**", route => {
    const date = new URL(route.request().url()).searchParams.get("date") ?? "2026-10-27";
    return route.fulfill({ json: { style: "short", date, status: "blocked", fetchedAt: "2026-10-27T09:00:00Z", indices: [], limitCounts: [], metrics: [], bars: [], ladder: [], evidence: [], coverage: [], messages: ["测试模拟：无行情，仅验证日历和笔记。"], ai: { status: "not_implemented", message: "未生成分析。" } } });
  });
}
async function setup(page: Page) {
  await page.goto("/");
  await expect(page.locator(".strategy-options").or(page.locator(".review-calendar"))).toBeVisible();
  if (await page.getByRole("button", { name: /保存并进入工作台/ }).isVisible()) await page.getByRole("button", { name: /保存并进入工作台/ }).click();
  await expect(page.getByRole("button", { name: /选择2026-10-27复盘/ })).toHaveAttribute("aria-pressed", "true");
}
test("monthly calendar and both date-keyed note editors synchronize and persist", async ({ page, context }) => {
  await simulatedUnavailableData(context); await setup(page);
  const calendarNote = page.getByRole("textbox", { name: "日历下方每日复盘笔记", exact: true });
  const sideNote = page.getByRole("textbox", { name: "右侧复盘笔记", exact: true });
  await calendarNote.fill("测试：27日复盘想法");
  await expect(sideNote).toHaveValue("测试：27日复盘想法");
  await expect(page.getByRole("button", { name: "选择2026-10-27复盘，有笔记", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "选择2026-10-26复盘", exact: true }).click();
  await expect(calendarNote).toHaveValue(""); await expect(sideNote).toHaveValue("");
  await sideNote.fill("测试：26日另一条笔记"); await expect(calendarNote).toHaveValue("测试：26日另一条笔记");
  await page.getByRole("button", { name: /选择2026-10-27复盘/ }).click(); await expect(sideNote).toHaveValue("测试：27日复盘想法");
  await page.reload(); await expect(sideNote).toHaveValue("测试：27日复盘想法");
  await page.getByRole("button", { name: /选择2026-10-26复盘/ }).click(); await expect(sideNote).toHaveValue("测试：26日另一条笔记");
  await sideNote.fill(""); await expect(calendarNote).toHaveValue("");
  await expect(page.getByRole("button", { name: "选择2026-10-26复盘", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "上个月", exact: true }).click();
  await expect(page.getByText("2026年 9月", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "选择2026-09-30复盘", exact: true }).click();
  await expect(calendarNote).toHaveValue("");
  await page.getByRole("button", { name: "下个月", exact: true }).click();
  await expect(page.getByRole("button", { name: /选择2026-10-27复盘/ })).toBeVisible();
  await page.getByRole("button", { name: /选择2026-10-27复盘/ }).click();
  await expect(calendarNote).toHaveValue("测试：27日复盘想法");
  await page.getByRole("button", { name: "波段复盘", exact: true }).click();
  await expect(sideNote).toHaveValue("测试：27日复盘想法");
  await mkdir(".cache/screenshots", { recursive: true });
  await page.screenshot({ path: ".cache/screenshots/panhou-notes-interaction-test.png", fullPage: true });
});
test("notes also synchronize between browser tabs", async ({ page, context }) => {
  await simulatedUnavailableData(context); await setup(page);
  const other = await context.newPage(); await setup(other);
  await page.getByRole("textbox", { name: "右侧复盘笔记", exact: true }).fill("测试：跨标签同步");
  await expect(other.getByRole("textbox", { name: "日历下方每日复盘笔记", exact: true })).toHaveValue("测试：跨标签同步");
  await other.getByRole("textbox", { name: "右侧复盘笔记", exact: true }).fill("");
  await expect(page.getByRole("textbox", { name: "右侧复盘笔记", exact: true })).toHaveValue("");
});
test("failed persistence keeps the draft and explicitly reports the failure", async ({ page, context }) => {
  await simulatedUnavailableData(context);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.startsWith("panhou.review-note.v1.")) throw new DOMException("Test quota", "QuotaExceededError"); return original.call(this, key, value); };
  });
  await setup(page);
  await page.getByRole("textbox", { name: "右侧复盘笔记", exact: true }).fill("测试：尚未保存的草稿");
  await expect(page.getByRole("alert").filter({ hasText: "笔记未能保存" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "日历下方每日复盘笔记", exact: true })).toHaveValue("测试：尚未保存的草稿");
  await page.getByRole("button", { name: "选择2026-10-26复盘", exact: true }).click();
  await page.getByRole("button", { name: /选择2026-10-27复盘/ }).click();
  await expect(page.getByRole("textbox", { name: "右侧复盘笔记", exact: true })).toHaveValue("测试：尚未保存的草稿");
});
