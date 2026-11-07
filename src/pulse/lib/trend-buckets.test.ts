import { describe, expect, it } from "vitest";
import { buildTrendBuckets, currentDateInTimezone } from "./trend-buckets";
import type { OverviewResponse } from "./api";

const days = (count: number): OverviewResponse["daily"] => Array.from({length:count},(_,index)=>({date:new Date(Date.UTC(2023,0,index+1)).toISOString().slice(0,10),inputTokens:100,cachedInputTokens:30,outputTokens:20,totalTokens:120,costUSD:1,fiveHourPercent:10,weeklyPercent:2}));
describe("complete-period overview buckets",()=>{
  it.each([31,365,800])("keeps all %i natural days without truncating totals or boundaries",count=>{
    const source=days(count);const buckets=buildTrendBuckets(source);
    expect(buckets.length).toBeLessThanOrEqual(60);expect(buckets[0].startDate).toBe(source[0].date);expect(buckets.at(-1)!.endDate).toBe(source.at(-1)!.date);
    expect(buckets.reduce((sum,row)=>sum+row.count,0)).toBe(count);expect(buckets.reduce((sum,row)=>sum+row.totalTokens,0)).toBe(count*120);
    expect(buckets.reduce((sum,row)=>sum+row.inputTokens,0)).toBe(count*100);expect(buckets.reduce((sum,row)=>sum+row.costUSD!,0)).toBe(count);
    expect(buildTrendBuckets(source,count)).toHaveLength(count);
  });
  it("keeps a partially priced group unknown, explicit zero priced and quota peaks independent",()=>{
    const source=days(4);source[0]={...source[0],costUSD:null,fiveHourPercent:150};source[1]={...source[1],fiveHourPercent:50,weeklyPercent:null};source[2]={...source[2],costUSD:0};source[3]={...source[3],costUSD:0};
    const buckets=buildTrendBuckets(source,2);
    expect(buckets[0].costUSD).toBeNull();expect(buckets[1].costUSD).toBe(0);expect(buckets[0].fiveHourPercent).toBe(150);expect(buckets[0].weeklyPercent).toBeNull();
    expect(buckets[1].fiveHourPercent).toBe(10);expect(buckets[1].weeklyPercent).toBe(2);
  });
  it("uses the source timezone at midnight rather than the host's date",()=>{
    const now=new Date("2026-11-07T00:15:00Z");expect(currentDateInTimezone("America/Los_Angeles",now)).toBe("2026-11-06");expect(currentDateInTimezone("Asia/Shanghai",now)).toBe("2026-11-07");
  });
});
