const shanghaiDateFormatter=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"});
const shanghaiHourFormatter=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",hour:"2-digit",hourCycle:"h23"});
export function shanghaiDate(value: number | Date = new Date()): string {return shanghaiDateFormatter.format(value);}
export function dateMs(date: string) { return Date.parse(`${date}T00:00:00+08:00`); }
export function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const ms = dateMs(date);
  return Number.isFinite(ms) && shanghaiDate(ms) === date;
}
export function normalizeDate(date: string) { return /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` : date; }
export function latestClosedDate(dates: string[], now = new Date()): string | null {
  const today = shanghaiDate(now);
  const hour = Number(shanghaiHourFormatter.format(now));
  return dates.map(normalizeDate).filter(d => validDate(d) && (d < today || (d === today && hour >= 15))).sort().at(-1) ?? null;
}
