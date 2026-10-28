import { expect,test,type BrowserContext } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fixture,mockDraft } from "../fixtures/report-fixture";
import { buildAnalysisPacket } from "../../src/lib/reports/packet";
import { validateReport } from "../../src/lib/reports/validate";
import type { Style } from "../../src/lib/domain";
import type { ReportTask } from "../../src/lib/reports/types";

// All financial data and report outputs in this file are explicit test mocks.
async function dashboardMocks(context:BrowserContext) {
  await context.addInitScript(()=>localStorage.setItem("panhou.preferences.v1",JSON.stringify({version:1,style:"short",period:"day",watchlist:[{code:"600519.SH",name:"测试公司"}],updatedAt:"2026-10-27T09:00:00Z"})));
  await context.route("**/api/dashboard?**",route=>{
    const params=new URL(route.request().url()).searchParams,style=(params.get("style") || "short") as Style;
    const data=fixture(style); data.date=params.get("date") || data.date;
    if(data.date==="2026-10-25") {data.status="blocked";data.messages=["测试模拟：非交易日"];}
    return route.fulfill({json:data});
  });
}
function completed(style:Style,date="2026-10-27",id:string=randomUUID()):ReportTask {
  const data=fixture(style);data.date=date;
  const p=buildAnalysisPacket(data),report=validateReport(mockDraft(p),p,"明确标注的模型Mock","mock-response");
  return {id,date,style,symbols:["600519.SH"],status:"completed",createdAt:report.generatedAt,updatedAt:report.generatedAt,report};
}
test("explicit UI mocks: three styles render distinct report sections and evidence, preserving notes",async({page,context})=>{
  await dashboardMocks(context);let posts=0;
  await context.route("**/api/reports**",async route=>{
    if(route.request().method()==="GET") return route.fulfill({status:404,json:{error:"Mock task not found"}});
    if(route.request().method()==="DELETE") return route.fulfill({json:{cancelled:true}});
    posts++;const input=route.request().postDataJSON();return route.fulfill({json:completed(input.style,input.date,route.request().headers()["x-review-task"])});
  });
  const pageErrors:string[]=[];page.on("pageerror",e=>pageErrors.push(e.message));
  await page.goto("/");await expect(page.getByRole("button",{name:"生成 AI 复盘",exact:true})).toBeEnabled();
  await page.getByRole("textbox",{name:"右侧复盘笔记",exact:true}).fill("测试：保留我的复盘笔记");
  for(const [style,title] of [["短线复盘","情绪与涨跌停分布"],["波段复盘","日周月趋势结构"],["价值投资复盘","经营与财务变化"]]) {
    await page.getByRole("button",{name:style,exact:true}).click();
    await page.getByRole("button",{name:"生成 AI 复盘",exact:true}).click();
    await expect(page.locator(".generated-report")).toBeVisible();await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
    await expect(page.locator(".generated-report").getByText("事实 · 字段已核对").first()).toBeVisible();
    await expect(page.getByRole("textbox",{name:"日历下方每日复盘笔记",exact:true})).toHaveValue("测试：保留我的复盘笔记");
  }
  expect(posts).toBe(3);
  await page.locator(".claim-citations button").first().click();await expect(page.getByRole("dialog",{name:"AI报告证据详情"})).toBeVisible();
  await expect(page.getByText("报告日期 / 数据日期",{exact:true})).toBeVisible();await page.getByRole("button",{name:"关闭报告证据",exact:true}).click();
  await mkdir(".cache/screenshots",{recursive:true});await page.locator(".ai-review-panel").screenshot({path:".cache/screenshots/mingri-ai-report-mock-desktop.png"});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator(".ai-review-panel").screenshot({path:".cache/screenshots/mingri-ai-report-mock-mobile.png"});
  expect(pageErrors).toEqual([]);
  await page.getByRole("button",{name:/选择2026-10-26复盘/}).click();await expect(page.locator(".generated-report")).toHaveCount(0);
});
test("rapid date/style switch discards a delayed result and prevents double clicks",async({page,context})=>{
  await dashboardMocks(context);let posts=0,cancels=0;let release!:()=>void;const wait=new Promise<void>(r=>release=r);
  await context.route("**/api/reports**",async route=>{
    if(route.request().method()==="DELETE") {cancels++;return route.fulfill({json:{cancelled:true}});}
    if(route.request().method()==="GET")return route.fulfill({status:404,json:{error:"Mock pending"}});
    posts++;const input=route.request().postDataJSON();await wait;await route.fulfill({json:completed(input.style,input.date)}).catch(()=>{});
  });
  await page.goto("/");const button=page.getByRole("button",{name:"生成 AI 复盘",exact:true});await expect(button).toBeEnabled();
  await button.evaluate((element:HTMLButtonElement)=>{element.click();element.click();});
  await expect(page.getByRole("button",{name:"生成中…",exact:true})).toBeDisabled();expect(posts).toBe(1);
  await page.getByRole("button",{name:/选择2026-10-26复盘/}).click();await page.getByRole("button",{name:"波段复盘",exact:true}).click();
  release();await expect.poll(()=>cancels).toBe(1);await expect(page.locator(".generated-report")).toHaveCount(0);await expect(page.locator(".report-context")).toContainText("2026-10-26 · 波段复盘");
});
test("model failure and mismatched report context show errors; non-trading date disables generation",async({page,context})=>{
  await dashboardMocks(context);let posts=0;
  await context.route("**/api/reports**",async route=>{
    if(route.request().method()!=="POST")return route.fulfill({status:404,json:{error:"Mock"}});
    posts++;const result=completed("short");if(posts===1){delete result.report;result.status="failed";result.error="测试模拟：OpenAI 请求超时";}else result.report!.date="2026-10-26";
    return route.fulfill({json:result});
  });
  await page.goto("/");await page.getByRole("button",{name:"生成 AI 复盘",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"测试模拟：OpenAI 请求超时"})).toBeVisible();
  await page.getByRole("button",{name:"生成 AI 复盘",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"报告正文与当前日期"})).toBeVisible();await expect(page.locator(".generated-report")).toHaveCount(0);
  await page.getByRole("button",{name:/选择2026-10-25复盘/}).click();await expect(page.getByRole("button",{name:"生成 AI 复盘",exact:true})).toBeDisabled();expect(posts).toBe(2);
});
test("real local report route rejects forged data, invalid session and unknown task",async({request})=>{
  const headers={"X-Review-Session":randomUUID(),"X-Review-Task":randomUUID()};
  expect((await request.post("/api/reports",{data:{date:"2026-10-27",style:"short",symbols:[]}})).status()).toBe(403);
  expect((await request.post("/api/reports",{headers,data:{date:"2026-10-27",style:"short",symbols:[],financialData:{price:999}}})).status()).toBe(400);
  expect((await request.get(`/api/reports?id=${randomUUID()}`,{headers})).status()).toBe(404);
  const foreign=await request.post("/api/reports",{headers:{...headers,Origin:"https://foreign.example"},data:{date:"2026-10-27",style:"short",symbols:[]}});
  expect(foreign.status()).toBe(403);expect((await foreign.json()).code).toBe("ORIGIN_MISMATCH");
});

test("real browser Origins work on both local addresses and invalid stored sessions recover",async({page,context})=>{
  await dashboardMocks(context);
  // Keep the real API origin/session checks, but force an invalid body so no
  // financial or model request can be made by this regression test.
  await context.route("**/api/reports",route=>route.request().method()==="POST" ? route.continue({postData:"{}"}) : route.continue());
  for(const host of ["127.0.0.1","localhost"]){
    await page.goto(`http://${host}:3100/`);
    const button=page.getByRole("button",{name:"生成 AI 复盘",exact:true});await expect(button).toBeEnabled();
    await page.getByRole("textbox",{name:"右侧复盘笔记",exact:true}).fill(`测试：${host}会话修复不影响笔记`);
    await page.evaluate(()=>sessionStorage.setItem("mingri.review-session","invalid-old-session"));
    const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname==="/api/reports" && r.request().method()==="POST");
    await button.click();const response=await responsePromise;
    expect(response.status()).toBe(400);expect((await response.json()).error).toContain("参数无效");
    expect(await page.evaluate(()=>sessionStorage.getItem("mingri.review-session"))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    await expect(page.getByRole("alert").filter({hasText:"参数无效"})).toBeVisible();
    await expect(page.getByRole("textbox",{name:"日历下方每日复盘笔记",exact:true})).toHaveValue(`测试：${host}会话修复不影响笔记`);
    await expect(page.getByRole("button",{name:"生成 AI 复盘",exact:true})).toBeEnabled();
  }
});
