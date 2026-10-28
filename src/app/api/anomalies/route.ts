import {NextRequest,NextResponse} from 'next/server';
import {symbolSchema}from '@/lib/domain';import{validDate}from '@/lib/dates';
import {loadAnomalies}from '@/lib/finance/anomalies';
export const runtime='nodejs';export const maxDuration=65;
const pending=new Map<string,{at:number;promise:ReturnType<typeof loadAnomalies>}>();
export async function GET(request:NextRequest){
  const date=request.nextUrl.searchParams.get('date')??'',symbols=[...new Set((request.nextUrl.searchParams.get('symbols')??'').split(',').filter(Boolean))];
  if(!validDate(date)||symbols.length>3||symbols.some(s=>!symbolSchema.safeParse(s).success))return NextResponse.json({error:'日期或自选参数无效。'},{status:400});
  const key=JSON.stringify([date,[...symbols].sort()]);for(const[k,v]of pending)if(Date.now()-v.at>60000)pending.delete(k);
  try{let cached=pending.get(key);if(!cached){cached={at:Date.now(),promise:loadAnomalies(date,symbols)};pending.set(key,cached);}return NextResponse.json(await cached.promise,{headers:{'Cache-Control':'private, no-store'}});}catch{pending.delete(key);return NextResponse.json({error:'异动条件测算失败，请稍后重试。'},{status:502});}
}
