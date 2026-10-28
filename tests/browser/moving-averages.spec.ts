import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
test("index candles display MA5/10/20/30/60 and per-period tooltip values", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /保存并进入工作台/ }).click();
  await expect(page.locator(".index-card").first().locator(".metric-value")).toHaveText(/[\d,]+\.\d{2}点/, { timeout: 40000 });
  for (const period of [5, 10, 20, 30, 60]) {
    await expect(page.locator(".chart-meta").getByText(`MA${period}`, { exact: true })).toBeVisible();
    await expect(page.locator(`.moving-average-ma${period} .recharts-line-curve`)).toBeVisible();
  }
  const coverage=await page.evaluate(()=>{const path=document.querySelector('.moving-average-ma60 .recharts-line-curve') as SVGGraphicsElement,rects=[...document.querySelectorAll('.candlestick rect')];const centers=rects.map(r=>Number(r.getAttribute('x'))+Number(r.getAttribute('width'))/2);const box=path.getBBox();return{start:box.x,end:box.x+box.width,first:centers[0],last:centers.at(-1)!};});
  expect(Math.abs(coverage.start-coverage.first)).toBeLessThan(1);expect(Math.abs(coverage.end-coverage.last)).toBeLessThan(1);
  await page.locator(".candlestick rect").last().hover();
  for (const period of [10, 30, 60]) {
    const row = page.locator(".candle-tooltip dl>div").filter({ has: page.getByText(`MA${period}`, { exact: true }) });
    await expect(row.locator("dd")).toHaveText(/[\d,]+\.\d{2}/);
  }
  await page.getByRole("button", { name: "周", exact: true }).click();
  await expect(page.getByRole("img", { name: /上证指数周K线图/ })).toBeVisible();
  // Extra historical warmup now supplies at least 60 weekly closes.
  await expect.poll(async () => page.locator(".moving-average-ma60 .recharts-line-curve").evaluateAll(paths => paths.some(path => Boolean(path.getAttribute("d"))))).toBe(true);
  await page.locator(".candlestick rect").last().hover();
  await expect(page.locator(".candle-tooltip dl>div").filter({ has: page.getByText("MA60", { exact: true }) }).locator("dd")).toHaveText(/[\d,]+\.\d{2}/);
  await page.getByRole("button", { name: "日", exact: true }).click();
  await page.getByRole("button", { name: "更新数据", exact: true }).focus();
  await mkdir(".cache/screenshots", { recursive: true });
  await page.locator(".chart-card").screenshot({ path: ".cache/screenshots/mingri-youzi-five-ma-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".chart-card").screenshot({ path: ".cache/screenshots/mingri-youzi-five-ma-mobile.png" });
});
