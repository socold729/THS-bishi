export interface IfindResult { ok:boolean; data:unknown; reason:string; fetchedAt:string; endpoint:string; requestId:string|null }
const BASE="https://api-mcp.51ifind.com:8643/ds-mcp-servers";
export function decodeIfindData(input:unknown):unknown {
  let value=input;
  for(let i=0;i<5;i++) {
    if(typeof value === "string") {try{value=JSON.parse(value);}catch{return value;}}
    else if(value && typeof value === "object" && !Array.isArray(value) && "data" in value) value=(value as {data:unknown}).data;
    else break;
  }
  return value;
}
export function createIfindClient(options:{apiKey?:string;timeoutMs?:number;fetcher?:typeof fetch}) {
  const sessions=new Map<string,{id:string;expires:number;tools:Set<string>}>();
  let queue:Promise<unknown>=Promise.resolve(),sequence=0;
  const call=async(service:"stock"|"news",tool:string,args:Record<string,unknown>,signal?:AbortSignal):Promise<IfindResult>=>{
    const endpoint=`${BASE}/hexin-ifind-ds-${service}-mcp`, fetchedAt=new Date().toISOString();
    const failed=(reason:string):IfindResult=>({ok:false,data:null,reason,fetchedAt,endpoint:`${endpoint}#${tool}`,requestId:null});
    if(!options.apiKey?.trim())return failed("iFinD密钥未配置，本项没有取数。");
    try {
      const rpc=async(method:string,params?:unknown,sessionId?:string)=>{
        signal?.throwIfAborted();const timeout=AbortSignal.timeout(method==="notifications/initialized"?5000:options.timeoutMs??12000);
        const response=await(options.fetcher??fetch)(endpoint,{method:"POST",cache:"no-store",redirect:"error",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream",Authorization:options.apiKey!,"User-Agent":"mingri-youzi",...(sessionId?{"Mcp-Session-Id":sessionId}:{})},body:JSON.stringify({jsonrpc:"2.0",...(method==="notifications/initialized"?{}:{id:++sequence}),method,...(params?{params}:{})}),signal:signal?AbortSignal.any([signal,timeout]):timeout});
        if(!response.ok)throw Error(response.status===401||response.status===403?"iFinD认证或权限校验失败。":response.status===429?"iFinD限流，请稍后手动重试。":`iFinD返回HTTP${response.status}。`);
        const text=await response.text();let body:any=null;
        if(text.trim()) {try{body=JSON.parse(text);}catch{for(const line of text.split("\n").filter(s=>s.startsWith("data:"))){try{const parsed=JSON.parse(line.slice(5));if(parsed.id===sequence)body=parsed;}catch{}}if(!body)throw Error("iFinD响应无法解析。");}}
        if(body?.error)throw Error("iFinD协议或工具请求失败。");
        return {body,sessionId:response.headers.get("mcp-session-id")};
      };
      let session=sessions.get(service);
      if(!session || session.expires<Date.now()) {
        const init=await rpc("initialize",{protocolVersion:"2025-03-26",capabilities:{},clientInfo:{name:"mingri-youzi",version:"1.0"}});
        if(!init.body?.result || !init.sessionId)throw Error("iFinD初始化未取得有效会话。");
        await rpc("notifications/initialized",undefined,init.sessionId);
        const catalog=await rpc("tools/list",{},init.sessionId);
        if(!Array.isArray(catalog.body?.result?.tools))throw Error("iFinD工具目录异常。");
        session={id:init.sessionId,expires:Date.now()+240000,tools:new Set(catalog.body.result.tools.map((t:{name:string})=>t.name))};sessions.set(service,session);
      }
      if(!session.tools.has(tool))return failed("当前iFinD目录没有列出该工具，本项不可用。");
      const result=await rpc("tools/call",{name:tool,arguments:args},session.id);
      if(result.body?.result?.isError)throw Error("iFinD工具返回失败。");
      const text=result.body?.result?.content?.find((c:{type:string})=>c.type==="text")?.text;
      let business:any;try{business=JSON.parse(text);}catch{throw Error("iFinD业务响应结构异常。");}
      if(business.code!==1 || business.msg!=="success")throw Error("iFinD业务未成功，本项不进入分析。");
      return {ok:true,data:decodeIfindData(business.data),reason:"",fetchedAt,endpoint:`${endpoint}#${tool}`,requestId:typeof business.request_id==="string"?business.request_id:null};
    } catch(error) {
      sessions.delete(service);
      return failed(error instanceof Error && /^iFinD/.test(error.message)?error.message:"iFinD连接超时、中断或本次等待已取消，未使用替代数据。");
    }
  };
  return (service:"stock"|"news",tool:string,args:Record<string,unknown>,signal?:AbortSignal)=>{
    const pending=queue.then(()=>call(service,tool,args,signal));queue=pending.catch(()=>{});return pending;
  };
}
