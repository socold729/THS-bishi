import assert from "node:assert/strict";
import { test } from "node:test";
import { getReviewSession, isSameOrigin } from "../src/lib/reports/request-security";

const request=(url:string,headers:Record<string,string>)=>new Request(url,{headers});
test("browser destination Host wins over the internal Next listening hostname",()=>{
  assert.equal(isSameOrigin(request("http://localhost:3000/api/reports",{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000"})),true);
  assert.equal(isSameOrigin(request("http://127.0.0.1:3000/api/reports",{host:"localhost:3000",origin:"http://localhost:3000"})),true);
});
test("other origins, ports, schemes and cross-site requests remain rejected",()=>{
  for(const origin of ["https://evil.example","http://127.0.0.1:3001","https://127.0.0.1:3000","http://localhost:3000","null","not-a-url","http://user@127.0.0.1:3000"]){
    assert.equal(isSameOrigin(request("http://127.0.0.1:3000/api/reports",{host:"127.0.0.1:3000",origin})),false);
  }
  assert.equal(isSameOrigin(request("http://127.0.0.1:3000/api/reports",{host:"127.0.0.1:3000","sec-fetch-site":"cross-site"})),false);
});
test("forwarded headers cannot grant a foreign Origin access",()=>{
  assert.equal(isSameOrigin(request("https://app.example/api/reports",{host:"app.example",origin:"https://evil.example","x-forwarded-host":"evil.example","x-forwarded-proto":"https"})),false);
});
test("malformed Host is rejected; missing Origin supports existing non-browser clients",()=>{
  assert.equal(isSameOrigin(request("http://localhost:3000/api/reports",{host:"localhost:3000/path",origin:"http://localhost:3000"})),false);
  assert.equal(isSameOrigin(request("http://localhost:3000/api/reports",{})),true);
  assert.equal(isSameOrigin(request("http://localhost:3000/api/reports",{origin:"http://localhost:3000"})),true);
});
test("invalid stored session automatically regenerates without touching personal data",()=>{
  const id="12345678-1234-4123-8123-123456789abc";
  for(const value of [null,"","invalid-old-session"]){const store=new Map<string,string>([["panhou.preferences.v1","keep"],["panhou.review-note.v1.2026-10-27","note"]]);if(value!==null)store.set("mingri.review-session",value);const storage={getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);}};
    assert.equal(getReviewSession(storage,()=>id),id);assert.equal(store.get("mingri.review-session"),id);assert.equal(store.get("panhou.preferences.v1"),"keep");assert.equal(store.get("panhou.review-note.v1.2026-10-27"),"note");}
});
test("valid session is reused so existing in-flight tasks retain ownership",()=>{
  const id="12345678-1234-4123-8123-123456789abc";let writes=0;
  assert.equal(getReviewSession({getItem:()=>id,setItem:()=>{writes++;}},()=>{throw Error("must not regenerate");}),id);assert.equal(writes,0);
});
