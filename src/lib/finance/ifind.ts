import "server-only";
import { createIfindClient, type IfindResult } from "./ifind-transport";
import { ifindHttpsFetch } from "./ifind-https";
const client=createIfindClient({apiKey:process.env.IFIND_MCP_KEY,fetcher:ifindHttpsFetch,timeoutMs:Math.min(20000,Math.max(1000,Number(process.env.IFIND_TIMEOUT_MS)||20000))});
export async function ifind(service:"stock"|"news",tool:string,args:Record<string,unknown>,signal?:AbortSignal):Promise<IfindResult> {
  if(process.env.IFIND_ENABLED!=="true")return {ok:false,data:null,reason:"iFinD尚未启用，本项不进入分析。",fetchedAt:new Date().toISOString(),endpoint:`iFinD/${service}/${tool}`,requestId:null};
  return client(service,tool,args,signal);
}
