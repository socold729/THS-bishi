// Read-only audit of staged Git objects and all currently reachable local history.
// Credentials stay in memory; findings contain paths/rules, never matched text.
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';

const git=(args,input)=>{const r=spawnSync('git',args,{input,encoding:null,maxBuffer:64*1024*1024,windowsHide:true});if(r.status!==0)throw Error(`Git audit command failed: ${args[0]}`);return r.stdout;};
const root=git(['rev-parse','--show-toplevel']).toString('utf8').trim();process.chdir(root);
if(existsSync('.env.local')){
  if(process.loadEnvFile)process.loadEnvFile('.env.local');
  else for(const line of readFileSync('.env.local','utf8').split(/\r?\n/)){const m=/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);if(m)process.env[m[1]]??=m[2].replace(/^(['"])(.*)\1$/,'$2');}
}
const credentials=Object.entries(process.env).filter(([key,value])=>/(?:API_KEY|MCP_KEY|SECRET|TOKEN|PASSWORD)$/.test(key)&&value?.length>=15);
const staged=git(['ls-files','--stage','-z']).toString('utf8').split('\0').filter(Boolean).map(line=>{const tab=line.indexOf('\t'),[mode,oid,stage]=line.slice(0,tab).split(' ');return{oid,path:line.slice(tab+1),mode,stage};});
const findings=[];const excluded=/^(?:node_modules|\.next|\.cache|\.tools|test-results|playwright-report|coverage|\.vercel)(?:\/|$)|^docs\/evidence\/private(?:\/|$)|(?:^|\/)mcp_config[^/]*\.json$|(?:^|\/)\.npmrc$|\.(?:pem|key|p12|pfx|db|sqlite3?|tsbuildinfo|log)$/i;
for(const f of staged)if(excluded.test(f.path)||/(?:^|\/)\.env(?:\.|$)/.test(f.path)&&f.path!=='.env.example')findings.push({scope:'staged',path:f.path,rule:'sensitive-or-generated-path'});
const revisions=git(['rev-list','--all']).toString('utf8').trim().split('\n').filter(Boolean);
const historyLines=git(['rev-list','--objects','--all']).toString('utf8').trim().split('\n').filter(Boolean);
const history=historyLines.map(line=>({oid:line.slice(0,40),path:line.slice(41)||'(commit/tree)'}));
const objects=new Map();for(const f of staged)objects.set(f.oid,{...f,scope:'staged'});for(const f of history)if(!objects.has(f.oid))objects.set(f.oid,{...f,scope:'history'});
const ids=[...objects.keys()];const check=ids.length?git(['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],ids.join('\n')+'\n').toString('utf8').trim().split('\n'):[];
const selected=check.map(line=>{const[oid,type,size]=line.split(' ');return{...objects.get(oid),oid,type,size:Number(size)};}).filter(o=>['blob','commit','tag'].includes(o.type));
const body=selected.length?git(['cat-file','--batch'],selected.map(o=>o.oid).join('\n')+'\n'):Buffer.alloc(0);let offset=0,textObjects=0,binaryObjects=0;
const patterns=[
 ['openai-style-key',/\bsk-(?:proj-|svcacct-|fuyao-)?[A-Za-z0-9_-]{20,}\b/g],
 ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
 ['encrypted-or-signed-token',/\beyJ[A-Za-z0-9_-]{15,}(?:\.[A-Za-z0-9_-]{8,}){2,4}\b/g],
 ['aws-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
 ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
 ['credential-in-url',/https?:\/\/[^\s/:@]+:[^\s/@]{12,}@/g],
];
const mock=/^(?:explicit|test|mock|dummy|not[-_]|placeholder|your[-_]|<|\$|process\.env|env:)/i;
const financial=/^(?:last_price|open_price|high_price|low_price|close_price|prev_price|price_change|price_change_ratio_pct|volume|turnover|operating_income|net_profit|parent_holder_net_profit|pe_ttm|pb)$/;
function checkPublicEvidence(value,current,depth=0){if(depth>25)return;if(Array.isArray(value)){for(const v of value)checkPublicEvidence(v,current,depth+1);return;}if(value&&typeof value==='object'){for(const[k,v]of Object.entries(value)){if(financial.test(k)&&typeof v==='number')findings.push({...current,rule:'raw-financial-data-in-public-evidence',field:k});if(/^(access_token|refresh_token|session_id|mcp-session-id)$/i.test(k)&&typeof v==='string')findings.push({...current,rule:'authentication-material-in-evidence',field:k});if(/^(资讯内容|公告内容|excerpt|answer|article_body|report_body)$/.test(k)&&typeof v==='string'&&v.length>50)findings.push({...current,rule:'raw-text-response-in-public-evidence',field:k});checkPublicEvidence(v,current,depth+1);}}else if(typeof value==='string'&&/^[{[]/.test(value)){try{checkPublicEvidence(JSON.parse(value),current,depth+1);}catch{}}}
for(const object of selected){const newline=body.indexOf(10,offset);if(newline<0)throw Error('Invalid batch output');offset=newline+1;const bytes=body.subarray(offset,offset+object.size);offset+=object.size+1;const current={scope:object.scope,path:object.path,object:object.oid};
  for(const[key,value]of credentials)if(bytes.includes(Buffer.from(value)))findings.push({...current,rule:'exact-configured-credential',credentialName:key});
  if(bytes.includes(0)){binaryObjects++;continue;}textObjects++;const text=bytes.toString('utf8');
  for(const[rule,pattern]of patterns){pattern.lastIndex=0;if(pattern.test(text))findings.push({...current,rule});}
  const literal=/(?:api[_-]?key|password|access_token|client_secret|_authToken)\s*[:=]\s*["']([^"'\r\n]{16,})["']/gi;for(const m of text.matchAll(literal))if(!mock.test(m[1])&&!/^\s*$/.test(m[1]))findings.push({...current,rule:'hardcoded-credential-candidate'});
  if(/^docs\/evidence\/.+\.json$/.test(object.path)){try{checkPublicEvidence(JSON.parse(text.replace(/^\uFEFF/,'')),current);}catch{findings.push({...current,rule:'unparseable-public-evidence'});}}
}
const report={recordedAt:new Date().toISOString(),repository:root,stagedFiles:staged.length,reachableCommits:revisions.length,uniqueObjectsScanned:selected.length,textObjects,binaryObjects,configuredCredentialNames:credentials.map(([k])=>k),findings,passed:findings.length===0,notes:['Images require separate visual review; exact configured values are scanned in binary files too.','Only reachable local Git history is covered; excluded private working files are not uploaded.','No credential value is printed or written.']};
mkdirSync('.cache',{recursive:true});const output=path.join('.cache',`github-upload-audit-${report.recordedAt.replace(/[:.]/g,'-')}.json`);writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,repository:'.',report:output},null,2));if(findings.length)process.exitCode=1;
