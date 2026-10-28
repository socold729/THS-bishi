import {request}from"node:https";
// Match the official Skill's Node HTTPS transport. Native fetch has its own
// connect timeout which can expire before the MCP request budget on port 8643.
export const ifindHttpsFetch:typeof fetch=async(input,init)=>new Promise<Response>((resolve,reject)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.protocol!=="https:"||url.hostname!=="api-mcp.51ifind.com"||url.port!=="8643"){reject(Error("Untrusted iFinD endpoint"));return;}
  const req=request(url,{method:init?.method??"POST",headers:Object.fromEntries(new Headers(init?.headers)),signal:init?.signal??undefined},response=>{
    const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(Buffer.from(chunk)));
    response.on("error",reject);response.on("end",()=>{
      const headers=new Headers();for(const[key,value]of Object.entries(response.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(", "):value);
      const status=response.statusCode??500;
      try{resolve(new Response([204,205,304].includes(status)?null:Buffer.concat(chunks),{status,headers}));}catch(error){reject(error);}
    });
  });
  req.on("error",reject);req.end(typeof init?.body==="string"?init.body:undefined);
});
