"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ChartNoAxesCombined, Landmark, Check, ArrowRight, Database, BookOpen } from "lucide-react";
import { STRATEGIES, type Style } from "@/lib/domain";
import { usePreferences } from "./providers";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
const icons = { short: Activity, swing: ChartNoAxesCombined, value: Landmark };
export function StrategyForm() {
  const { preferences, hydrated, save, error } = usePreferences();
  const [selected, setSelected] = useState<Style>("short");
  const [saved, setSaved] = useState(false);
  const [customText,setCustomText]=useState("");
  const router = useRouter();
  useEffect(() => { if (preferences) setSelected(preferences.style); }, [preferences]);
  useEffect(()=>{setCustomText(preferences?.reviewMethods?.[selected]??"");},[selected,preferences]);
  function persist(text=customText){const reviewMethods={short:"",swing:"",value:"",...preferences?.reviewMethods,[selected]:text.trim()};const ok=save({version:1,style:selected,period:preferences?.period??"day",watchlist:preferences?.watchlist??[],updatedAt:new Date().toISOString(),reviewMethods});if(ok)setSaved(true);return ok;}
  if (!hydrated) return <div className="loading-state">正在读取复盘配置…</div>;
  return <>
    <div className="page-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h1>{preferences ? "找到你的复盘节奏" : "先选一种，属于你的视角。"}</h1><p>投资风格决定我们看什么数据、怎么算指标，以及如何组织复盘。</p></div><Badge>01 / 复盘偏好</Badge></div>
    <div className="strategy-options" role="radiogroup" aria-label="投资风格">{(Object.entries(STRATEGIES) as [Style, typeof STRATEGIES[Style]][]).map(([style, definition]) => { const Icon = icons[style]; return <button type="button" key={style} role="radio" aria-checked={selected === style} onClick={() => { setSelected(style); setSaved(false); }} className={`strategy-option ${selected === style ? "selected" : ""}`}><span className="strategy-option-top"><span className="strategy-icon"><Icon size={24} /></span><span className="radio-mark">{selected === style && <Check size={13} />}</span></span><small>{definition.en}</small><h2>{definition.name}</h2><p>{definition.brief}</p><div className="strategy-tags">{definition.focus.map(item => <span key={item}>{item}</span>)}</div></button>; })}</div>
    <section className="card strategy-explanation"><div><Database size={21} /><span><h3>数据会随风格切换</h3><p>{STRATEGIES[selected].data}</p></span></div><div><BookOpen size={21} /><span><h3>分析有明确的侧重点</h3><p>{STRATEGIES[selected].analysis}</p></span></div></section>
    <section className="card custom-review-settings"><div className="card-header"><h2>{STRATEGIES[selected].name} · 自定义 AI 复盘方式</h2><Badge>{preferences?.reviewMethods?.[selected]?.trim()?"自定义复盘方式":"默认复盘方式"}</Badge></div><label htmlFor="custom-review-method">留空则使用当前投资风格的默认复盘方式</label><textarea id="custom-review-method" aria-label="自定义 AI 复盘方式" value={customText} maxLength={1200} rows={5} placeholder="输入你希望重点分析的内容、希望省略的内容及报告组织方式…" onChange={e=>{setCustomText(e.target.value);setSaved(false);}}/><p className="helper">三个风格独立保存。仅影响新报告；真实性、证据与合规规则始终适用。需要但无法取得的数据会明确提示。内容将随生成请求发送给模型，请勿填写密钥等私密信息。</p><div className="custom-review-actions"><Button onClick={()=>persist()}>保存修改</Button><Button variant="outline" onClick={()=>{if(persist(""))setCustomText("");}}>恢复默认</Button></div></section>
    {error&&<div role="alert" className="notice error-notice">{error}</div>}
    <div className="configuration-footer"><p>配置保存在当前浏览器，不接入证券账户。<br /><span>清理浏览器数据后会丢失，不跨设备同步。</span></p><Button onClick={() => {if(persist())router.push("/");}}>保存并进入工作台 <ArrowRight size={16} /></Button></div>{saved && <p role="status">配置已保存。</p>}
  </>;
}
