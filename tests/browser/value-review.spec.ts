import{test,expect,type BrowserContext}from"@playwright/test";import{mkdir}from"node:fs/promises";
import{valueFixture}from"../fixtures/value-fixture";import{fixture,mockDraft}from"../fixtures/report-fixture";
import{buildAnalysisPacket}from"../../src/lib/reports/packet";import{validateReport}from"../../src/lib/reports/validate";import{hypothesisKey}from"../../src/lib/investment-hypotheses";
async function setup(context:BrowserContext) {
  await context.addInitScript(()=>localStorage.setItem("panhou.preferences.v1",JSON.stringify({version:1,style:"value",period:"day",watchlist:[{code:"600519.SH",name:"测试公司"}],updatedAt:"2026-10-27T09:00:00Z"})));
  await context.route("**/api/dashboard?**",route=>{const p=new URL(route.request().url()).searchParams,date=p.get("date")||"2026-10-27",style=p.get("style")||"value";return route.fulfill({json:style==="value"?valueFixture(date):{...fixture(style as "short"|"swing"),date}});});
}
async function fillCondition(page:import("@playwright/test").Page,threshold="20") {
  await page.getByRole("textbox",{name:"投资假设内容"}).fill("测试：持续核验经营增长");
  await page.getByLabel("假设核验指标",{exact:true}).selectOption("quarterly-revenue-yoy");
  await page.getByLabel("假设阈值",{exact:true}).fill(threshold);await page.getByRole("button",{name:"保存投资假设",exact:true}).click();
}
test("explicit mocks: three statements, dated evidence and versioned hypotheses feed current AI context",async({page,context})=>{
  await setup(context);let submitted:any;
  await context.route("**/api/reports**",route=>{
    if(route.request().method()!=="POST")return route.fulfill({status:404,json:{error:"Test mock"}});
    submitted=route.request().postDataJSON();const p=buildAnalysisPacket(valueFixture(submitted.date),submitted.hypotheses);const report=validateReport(mockDraft(p),p,"EXPLICIT_MODEL_MOCK","MOCK_RESPONSE");
    return route.fulfill({json:{id:route.request().headers()["x-review-task"],date:p.date,style:"value",symbols:p.symbols,configurationKey:hypothesisKey(submitted.hypotheses),status:"completed",createdAt:report.generatedAt,updatedAt:report.generatedAt,report}});
  });
  await page.goto("/");await expect(page.getByRole("heading",{name:"财务三表与经营变化"})).toBeVisible();
  await page.getByRole("textbox",{name:"右侧复盘笔记",exact:true}).fill("测试：笔记保持不变");
  await page.getByRole("button",{name:"季度财务",exact:true}).click();await expect(page.locator(".financial-dates")).toContainText("2026-06-30");
  await expect(page.locator(".value-metrics>div").filter({has:page.getByText("资产负债率",{exact:true})}).locator("button")).toContainText("40.00");
  await page.locator(".value-metrics>div").filter({has:page.getByText("资产负债率",{exact:true})}).locator("button").click();await expect(page.locator(".evidence-source-section")).toHaveCount(2);await page.getByRole("button",{name:"关闭证据详情"}).click();
  await expect(page.getByText("测试公司年度报告",{exact:true})).toBeVisible();await expect(page.locator(".company-announcements")).toContainText("仅检索片段，原文链接缺失");
  await fillCondition(page);await expect(page.locator(".hypothesis-outcome")).toContainText("指标符合条件");
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem("mingri.value-hypotheses.v1")!).history.length)).toBe(1);
  await page.getByRole("button",{name:"生成 AI 复盘",exact:true}).click();await expect(page.locator(".generated-report")).toBeVisible();expect(submitted.hypotheses).toHaveLength(1);expect(submitted.hypotheses[0].text).toBeUndefined();
  await page.getByRole("button",{name:"修改条件",exact:true}).click();await page.getByLabel("假设阈值",{exact:true}).fill("30");await page.getByRole("button",{name:"保存新版本",exact:true}).click();
  await expect(page.locator(".generated-report")).toHaveCount(0);await expect(page.locator(".hypothesis-outcome")).toContainText("触发复核");
  await page.reload();await expect(page.locator(".hypothesis-outcome")).toContainText("触发复核");
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem("mingri.value-hypotheses.v1")!));expect(stored.hypotheses).toHaveLength(2);expect(stored.hypotheses[0].archived).toBe(true);expect(stored.history).toHaveLength(2);
  await expect(page.getByRole("textbox",{name:"日历下方每日复盘笔记",exact:true})).toHaveValue("测试：笔记保持不变");
  await page.getByRole("button",{name:/选择2026-10-26复盘/}).click();await expect(page.locator(".report-context")).toContainText("2026-10-26");
  await page.getByRole("button",{name:/选择2026-10-27复盘/}).click();await page.getByRole("button",{name:"季度财务",exact:true}).click();
  await mkdir(".cache/screenshots",{recursive:true});await page.locator(".value-review").screenshot({path:".cache/screenshots/value-review-mock-desktop.png"});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator(".value-review").screenshot({path:".cache/screenshots/value-review-mock-mobile.png"});
});
test("corrupt hypothesis storage is not overwritten and persistence failure is explicit",async({page,context})=>{
  await setup(context);await page.addInitScript(()=>localStorage.setItem("mingri.value-hypotheses.v1",'{"broken":true}'));
  await page.goto("/");await expect(page.getByRole("alert").filter({hasText:"投资假设记录损坏"})).toBeVisible();await fillCondition(page);expect(await page.evaluate(()=>localStorage.getItem("mingri.value-hypotheses.v1"))).toBe('{"broken":true}');
  const another=await context.newPage();await another.addInitScript(()=>{localStorage.removeItem("mingri.value-hypotheses.v1");const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==="mingri.value-hypotheses.v1")throw new DOMException("Test quota","QuotaExceededError");return original.call(this,key,value);};});
  await another.goto("/");await fillCondition(another);await expect(another.getByRole("alert").filter({hasText:"投资假设未能保存"})).toBeVisible();await expect(another.getByRole("textbox",{name:"投资假设内容"})).toHaveValue("测试：持续核验经营增长");
});
