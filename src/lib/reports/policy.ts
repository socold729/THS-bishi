// Shared by plan labels and report claims; user text cannot relax this policy.
export const prohibitedNarrative=/必涨|必跌|必然.{0,6}(上涨|下跌)|一定.{0,6}(涨|跌|赚)|保证.{0,6}(收益|盈利)|稳赚|保本|翻倍|涨定了|跌定了|(?:建议|应该|立即|务必|适合|可以|值得|推荐|择机|逢低|果断).{0,8}(买入|卖出|加仓|减仓|抄底|建仓|清仓|做多|做空)|买入|卖出|加仓|减仓|抄底|建仓|清仓|止盈|止损|目标价|收益率将|明日.{0,8}(将|会|必).{0,5}(涨|跌)|will\s+(rise|fall)|guaranteed\s+(return|profit)|\b(buy|sell|long|short)\s+(now|tomorrow)\b/i;
export const definiteForecast=/(?:明日|明天|下周|未来).{0,12}(?:肯定|确定|必然|将|会).{0,8}(?:反弹|走高|走低|突破|回升|上涨|下跌)/;
export const uncertaintyMarker=/可能|提示|尚|待|无法|需要|不能|不宜|不代表|不足|未能/;
export function unsafeLabel(text:string){return prohibitedNarrative.test(text)||definiteForecast.test(text)||/密钥|API.?KEY|system.?prompt/i.test(text);}
