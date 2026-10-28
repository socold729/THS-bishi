// Actual production acceptance, isolated browser. No financial/model mocks.
// Run with --with-ai to authorize six actual report generations (may incur cost).
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';

const base=(process.argv.find(a=>a.startsWith('--base-url='))?.slice(11)??'https://ths-bishi-83sj.vercel.app').replace(/\/$/,'');
if(new URL(base).protocol!=='https:')throw Error('Production acceptance requires HTTPS');
const withAI=process.argv.includes('--with-ai'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const directory=`.cache/production-acceptance-${stamp}`;await mkdir(directory,{recursive:true});
const result={recordedAt:new Date().toISOString(),base,kind:'actual-production-browser-no-mocks',withAI,privateDirectory:directory,checks:[],marketResponses:[],reports:[],runtimeErrors:[],reportPosts:0,poll404:0};
const hash=s=>createHash('sha256').update(s).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const fingerprint=value=>hash(JSON.stringify(canonical(value)));
const persist=async()=>writeFile(`${directory}/summary.json`,JSON.stringify(result,null,2));
const assert=(value,message)=>{if(!value)throw Error(message);};
async function check(id,fn){const start=Date.now();try{const detail=await fn();result.checks.push({id,status:'passed',elapsedMs:Date.now()-start,...(detail?{detail}:{})});console.log(JSON.stringify({check:id,status:'passed',elapsedMs:Date.now()-start}));}catch(e){result.checks.push({id,status:'failed',elapsedMs:Date.now()-start,error:e.message});console.log(JSON.stringify({check:id,status:'failed',privateDetails:true}));}await persist();}
const labels={short:'短线复盘',swing:'波段复盘',value:'价值投资复盘'};
const methods={short:'只客观描述连板梯队、高位候选及对应题材，不分析普通指数行情或其它短线指标；没有事件信息时不作归因。',swing:'只分析自选股的周K、月K与均线结构，以及真实成交量、成交额较前五日及上月同期的差额，不做普通指数行情播报。',value:'重点客观列出自选股已披露的营业收入、归母净利润和可比较变化；不讨论短期技术指标，不强制估值或行业发展栏目。'};
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1080}}),page=await context.newPage();page.setDefaultTimeout(20000);
page.on('pageerror',e=>result.runtimeErrors.push(e.message));
page.on('response',async response=>{try{if(new URL(response.url()).origin!==base)return;const path=new URL(response.url()).pathname,request=response.request();if(path==='/api/reports'&&request.method()==='GET'&&response.status()===404)result.poll404++;if(path==='/api/reports'&&request.method()==='POST')result.reportPosts++;if(path==='/api/dashboard'&&response.status()===200){const d=await response.json();result.marketResponses.push({date:d.date,style:d.style,status:d.status,indices:d.indices?.map(i=>({code:i.code,available:i.close!==null,bars:i.bars.length})),limitCounts:d.limitCounts?.map(m=>({id:m.id,available:m.value!==null})),financialReportGroups:d.stocks?.reduce((s,r)=>s+(r.value?.reports.length??0),0),warnings:d.coverage?.filter(c=>c.status!=='ready').map(c=>({label:c.label,status:c.status,reason:c.reason}))});}}catch{}});
let selectedDate='',previousDate='',symbols=['600519.SH'];
const preferences=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('panhou.preferences.v1')??'null'));
const archived=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mingri.report-archive.v1')??'{"version":1,"entries":[]}'));
async function settings(style,text){await page.goto(`${base}/settings`);await page.getByRole('radio',{name:new RegExp(labels[style])}).click();const input=page.getByRole('textbox',{name:'自定义 AI 复盘方式',exact:true});await input.fill(text);await page.getByRole('button',{name:'保存修改',exact:true}).click();await page.getByRole('status').filter({hasText:'配置已保存'}).waitFor();}
async function home(style){
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dashboard'&&new URL(r.url()).searchParams.get('style')===style,{timeout:85000});
  await page.goto(base+'/');const r=await response;assert(r.status()===200,'Dashboard HTTP failed');const data=await r.json();
  assert(data.style===style&&data.date===selectedDate,'Dashboard context mismatch');assert(data.status!=='blocked','Dashboard blocked');
  await page.getByRole('button',{name:'生成 AI 复盘',exact:true}).waitFor();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent==='生成 AI 复盘');return b&&!b.disabled;},{timeout:20000});
  return data;
}
async function generate(style,mode){
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/reports'&&r.request().method()==='POST',{timeout:180000});
  const before=await archived(),posts=result.reportPosts;
  const button=page.getByRole('button',{name:'生成 AI 复盘',exact:true});await button.evaluate(el=>{el.click();el.click();});
  const r=await response,task=await r.json();await writeFile(`${directory}/${style}-${mode}-task.json`,JSON.stringify(task,null,2));
  const report=task.report,record={style,mode,http:r.status(),status:task.status,errorCode:task.errorCode,error:task.error,date:task.date,model:report?.model,evidenceCount:report?.evidence.length,partial:report?.partial,plan:report?.configurationSnapshot?.plan,configurationMatches:report?.configurationSnapshot?.customInstructions===(mode==='custom'?methods[style]:''),saved:false};result.reports.push(record);await persist();
  assert(r.status()===200&&task.status==='completed'&&report,'AI task did not complete');
  assert(report.date===selectedDate&&report.style===style,'Report context mismatch');assert(record.configurationMatches,'Report configuration snapshot mismatch');
  await page.locator('.generated-report').waitFor({timeout:15000});assert(result.reportPosts===posts+1,'Double click produced duplicate model requests');
  const current=await archived();assert(current.entries.length===before.entries.length,'Generation was automatically saved');
  const byId=new Map(report.evidence.map(e=>[e.id,e]));let citations=0;
  const claims=[...report.summary,...report.observations,...report.specialist.flatMap(s=>s.items),...report.watchlist.flatMap(s=>s.items),...report.risks];
  for(const c of claims){for(const id of c.evidence_ids){const e=byId.get(id);assert(e&&e.date===selectedDate&&e.observedDate<=selectedDate&&e.subject===c.subject,'Citation identity/date/subject mismatch');citations++;}for(const v of c.values){const e=byId.get(v.evidence_id);assert(e&&e.value===v.value&&e.unit===v.unit,'Citation value mismatch');}}
  record.citationChecks=citations;assert(citations>0,'No cited real evidence');
  await page.locator('.claim-citations button').first().click();await page.getByRole('dialog',{name:'AI报告证据详情'}).waitFor();await page.getByRole('button',{name:'关闭报告证据'}).click();
  await page.getByRole('button',{name:'保存到复盘档案',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='已保存'&&b.disabled));
  const store=await archived(),entry=store.entries.find(e=>e.report.id===report.id);assert(entry,'Saved report missing');assert(JSON.stringify(entry.report)===JSON.stringify(report),'Saved report content changed');
  record.saved=true;record.archiveVersion=entry.version;record.reportId=report.id;record.savedContentHash=fingerprint(entry.report);
  await page.locator('.ai-review-panel').screenshot({path:`${directory}/${style}-${mode}.png`});
  await writeFile(`${directory}/${style}-${mode}-report.md`,`# ${labels[style]} · ${mode}\n\n日期${report.date}，模型${report.model}，真实Production调用。\n\n`+claims.map(c=>`- [${c.kind}] ${c.text}\n  引用：${c.evidence_ids.join('、')}`).join('\n\n'));
  await persist();return record;
}
try{
  await check('fresh-onboarding-and-real-watchlist',async()=>{
    await page.goto(base+'/');await page.getByRole('heading',{name:'先选一种，属于你的视角。'}).waitFor();await page.getByRole('radio',{name:/短线复盘/}).click();
    await page.getByRole('button',{name:/保存并进入工作台/}).click();await page.goto(`${base}/watchlist`);
    const input=page.getByRole('textbox',{name:'股票名称或完整代码',exact:true});await input.fill('600519');await page.getByRole('button',{name:'搜索标的',exact:true}).click();await page.locator('.search-results').getByRole('button',{name:'加入自选',exact:true}).first().click({timeout:30000});
    await page.reload();assert((await preferences()).watchlist.some(s=>s.code==='600519.SH'),'Real watchlist not persisted');
  });
  // Continue in an isolated test profile if onboarding selector fails; never seed financial data.
  if(!(await preferences())?.watchlist?.length)await page.evaluate(()=>localStorage.setItem('panhou.preferences.v1',JSON.stringify({version:1,style:'short',period:'day',watchlist:[{code:'600519.SH',name:'验收自选'}],updatedAt:new Date().toISOString()})));
  await check('three-custom-methods-independent-persistence-and-reset',async()=>{
    for(const style of ['short','swing','value'])await settings(style,methods[style]);
    for(const style of ['short','swing','value']){await page.goto(`${base}/settings`);await page.getByRole('radio',{name:new RegExp(labels[style])}).click();assert(await page.getByRole('textbox',{name:'自定义 AI 复盘方式',exact:true}).inputValue()===methods[style],'Saved method mixed with another style');}
    for(const style of ['short','swing','value']){await page.getByRole('radio',{name:new RegExp(labels[style])}).click();await page.getByRole('button',{name:'恢复默认',exact:true}).click();assert(await page.getByRole('textbox',{name:'自定义 AI 复盘方式',exact:true}).inputValue()==='','Reset did not clear method');}
    await page.reload();const p=await preferences();assert(Object.values(p.reviewMethods).every(v=>v===''),'Default restoration did not persist');
  });
  await settings('short','');
  await check('real-market-and-source-evidence',async()=>{
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dashboard'&&new URL(r.url()).searchParams.get('style')==='short',{timeout:65000});await page.goto(base+'/');const data=await(await response).json();selectedDate=data.date;
    assert(data.status!=='blocked'&&data.indices.length===4&&data.indices.every(i=>i.close!==null),'Real index overview incomplete');assert(data.limitCounts.length===2&&data.limitCounts.every(m=>m.value!==null),'Real limit counts missing');
    const d=new Date(`${selectedDate}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1);previousDate=d.toISOString().slice(0,10);
    for(const i of data.indices){const last=i.bars.at(-1);assert(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(last.date_ms)===selectedDate,'Future/stale index row');assert(i.close===last.close_price,'Index close differs from raw source');}
    await page.locator('.index-card').first().getByRole('button',{name:/查看原始证据/}).click();await page.getByRole('dialog',{name:'这项数据从哪里来？'}).waitFor();await page.getByRole('button',{name:'关闭证据详情'}).click();
    return{date:selectedDate,indices:4,limitCounts:2,sourceIds:data.evidence.map(e=>e.id)};
  });
  if(!selectedDate)selectedDate=result.marketResponses.at(-1)?.date??'2026-10-28';
  if(!previousDate)previousDate='2026-10-27';
  await check('calendar-and-two-notes-sync-reload-by-date',async()=>{
    const note='Production验收构造笔记：只验证同步和持久化';await page.getByRole('textbox',{name:'右侧复盘笔记',exact:true}).fill(note);assert(await page.getByRole('textbox',{name:'日历下方每日复盘笔记',exact:true}).inputValue()===note,'Note editors not synchronized');
    await page.reload();await page.waitForFunction(expected=>document.querySelector('textarea[aria-label="右侧复盘笔记"]')?.value===expected,note,{timeout:65000});assert(await page.getByRole('textbox',{name:'右侧复盘笔记',exact:true}).inputValue()===note,'Note did not survive reload');
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dashboard'&&new URL(r.url()).searchParams.get('date')===previousDate,{timeout:65000});await page.getByRole('button',{name:`选择${previousDate}复盘`,exact:true}).click();const data=await(await response).json();assert(data.date===previousDate&&data.status!=='blocked','Selected historical market unavailable');assert(await page.getByRole('textbox',{name:'右侧复盘笔记',exact:true}).inputValue()==='','Notes leaked across dates');await page.getByRole('textbox',{name:'右侧复盘笔记',exact:true}).fill('Production验收：前日独立构造笔记');await page.getByRole('button',{name:new RegExp(`选择${selectedDate}复盘`)}).click();assert(await page.getByRole('textbox',{name:'右侧复盘笔记',exact:true}).inputValue()===note,'Original dated note lost');
  });
  if(withAI)for(const style of ['short','swing','value']){
    await settings(style,'');
    await check(`${style}-default-real-ai-and-manual-save`,async()=>{const data=await home(style);if(style==='value'){assert(data.indices.every(i=>i.close!==null)&&data.limitCounts.every(m=>m.value!==null),'Value overview lost public market');assert(data.stocks.some(s=>s.value?.reports.length),'No real disclosed financial reports');}return generate(style,'default');});
    await check(`${style}-custom-real-ai-and-snapshot`,async()=>{const before=(await archived()).entries.map(e=>({id:e.id,hash:fingerprint(e.report)}));await settings(style,methods[style]);await home(style);const record=await generate(style,'custom');assert(record.plan?.mode==='custom','Custom mode did not produce a custom plan');if(style==='short')assert(!record.plan.scopes.some(s=>['indices','trends'].includes(s)),'Excluded index scope still requested');if(style==='value')assert(!record.plan.scopes.some(s=>['trends','valuations'].includes(s)),'Excluded technical/valuation scope forced');const after=await archived();assert(before.every(e=>fingerprint(after.entries.find(a=>a.id===e.id)?.report)===e.hash),'Historical report mutated when settings changed');return record;});
  }
  if(withAI)await check('archive-real-reports-reload-versions-filter-and-evidence',async()=>{
    const store=await archived(),completed=result.reports.filter(r=>r.status==='completed'&&r.saved);assert(completed.length>0,'No real saved reports available');await page.goto(`${base}/reports`);await page.reload();assert(await page.locator('.archive-entry').count()===store.entries.length,'Archive entries missing after reload');
    await page.getByLabel('档案复盘日期').fill(selectedDate);for(const style of ['short','swing','value']){await page.getByLabel('档案投资风格').selectOption(style);const expected=store.entries.filter(e=>e.report.date===selectedDate&&e.report.style===style);assert(await page.locator('.archive-entry').count()===expected.length,'Archive filter mismatch');if(expected.length){await page.locator('.archive-entry').first().click();await page.locator('.generated-report').waitFor();await page.locator('.claim-citations button').first().click();await page.getByRole('dialog',{name:'AI报告证据详情'}).waitFor();await page.getByRole('button',{name:'关闭报告证据'}).click();}}
    assert(fingerprint((await archived()).entries)===fingerprint(store.entries),'Reading archive changed stored original reports');
    await page.screenshot({path:`${directory}/archive-desktop.png`,fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile archive overflow');await page.screenshot({path:`${directory}/archive-mobile.png`,fullPage:true});await page.setViewportSize({width:1440,height:1080});return{savedReports:store.entries.length,versions:store.entries.map(e=>({style:e.report.style,version:e.version}))};
  });
  await check('restore-defaults-and-clear-current-report-on-context-switch',async()=>{
    for(const style of ['short','swing','value'])await settings(style,'');await settings('short','');await home('short');assert(await page.locator('.generated-report').count()===0,'An old report is presented as current');
    const weekend='2026-10-25';const wait=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/dashboard'&&new URL(r.url()).searchParams.get('date')===weekend,{timeout:65000});await page.getByRole('button',{name:new RegExp(`选择${weekend}复盘`)}).click();const d=await(await wait).json();assert(d.status==='blocked','Non-trading date did not block analysis');assert(await page.getByRole('button',{name:'生成 AI 复盘',exact:true}).isDisabled(),'Non-trading date enabled model generation');
  });
  await check('no-client-runtime-exceptions',async()=>assert(result.runtimeErrors.length===0,'Browser runtime errors observed'));
  await writeFile(`${directory}/isolated-browser-storage.json`,JSON.stringify(await context.storageState(),null,2));
}finally{result.finishedAt=new Date().toISOString();result.totals={passed:result.checks.filter(c=>c.status==='passed').length,failed:result.checks.filter(c=>c.status==='failed').length,realReportRequests:result.reportPosts,completedReports:result.reports.filter(r=>r.status==='completed').length,savedReports:result.reports.filter(r=>r.saved).length};await persist();await browser.close();console.log(JSON.stringify({directory,totals:result.totals}));if(result.totals.failed)process.exitCode=1;}
