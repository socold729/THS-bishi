"use client";
import {useEffect,useState}from"react";
import {decodeHypotheses,emptyHypotheses,HYPOTHESIS_KEY,hypothesisStoreSchema,recordHypothesisObservations,type HypothesisStore,type InvestmentHypothesis}from"@/lib/investment-hypotheses";
import type{DashboardData}from"@/lib/domain";
export function useInvestmentHypotheses(data:DashboardData|null) {
  const[store,setStore]=useState<HypothesisStore>(emptyHypotheses),[ready,setReady]=useState(false),[error,setError]=useState(""),[blocked,setBlocked]=useState(false);
  useEffect(()=>{
    try{const loaded=decodeHypotheses(localStorage.getItem(HYPOTHESIS_KEY));if(loaded)setStore(loaded);else{setError("投资假设记录损坏，原始数据未覆盖。");setBlocked(true);}}catch{setError("无法读取本地投资假设。");setBlocked(true);}setReady(true);
    const listener=(event:StorageEvent)=>{if(event.key!==HYPOTHESIS_KEY&&event.key!==null)return;const loaded=decodeHypotheses(event.newValue);if(loaded){setStore(loaded);setBlocked(false);}else{setError("另一页面的假设记录无法读取。");setBlocked(true);}};
    window.addEventListener("storage",listener);return()=>window.removeEventListener("storage",listener);
  },[]);
  function commit(next:HypothesisStore) {if(blocked)return false;try{hypothesisStoreSchema.parse(next);localStorage.setItem(HYPOTHESIS_KEY,JSON.stringify(next));setStore(next);setError("");return true;}catch(cause){setError(cause instanceof Error&&cause.message.includes("上限")?cause.message:"投资假设未能保存，已有记录未删除，请保留输入后重试。");return false;}}
  useEffect(()=>{if(!ready||!data||data.style!=="value"||data.status==="blocked")return;try{const next=recordHypothesisObservations(store,data);if(next!==store)commit(next);}catch(cause){setError(cause instanceof Error?cause.message:"核验记录保存失败。");}},[ready,data,store]);
  function save(item:InvestmentHypothesis,replaces?:string) {
    if(store.hypotheses.filter(h=>!h.archived&&h.id!==replaces).length>=10){setError("最多保留10条当前投资假设，请先归档。");return false;}
    return commit({...store,hypotheses:[...store.hypotheses.map(h=>h.id===replaces?{...h,archived:true}:h),item]});
  }
  return{store,ready,error,save,archive:(id:string)=>commit({...store,hypotheses:store.hypotheses.map(h=>h.id===id?{...h,archived:true}:h)})};
}
