// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { syntheticPaceSnapshot } from '@/lib/pulse-pace';
import type { TrayPopoverData } from '@/lib/tray-popover';
import { PaperWidgetSummary } from './paper-widget-summary';

const now=new Date();
function snapshot(date=now.toISOString().slice(0,10),tokens:number|null=0,cost:number|null=0):TrayPopoverData {
  return {account:null,membership:null,workspace:null,quotas:[],tokens:null,cost:null,labels:{remaining:'Remaining',today:'Today',cost:'API estimate',unavailable:'Unknown',showMain:'Open',quit:'Quit'},integration:{schemaVersion:1,quotas:[],quotaUpdatedAt:now.toISOString(),quotaStale:false,today:{date,timezone:'UTC',totalTokens:tokens,costUSD:cost,updatedAt:now.toISOString(),stale:false}}};
}
describe('paper widget live data scopes',()=>{
  it('keeps known zero values and article details separate from contextual help',async()=>{
    const user=userEvent.setup();
    const onDetails=vi.fn();
    const data=syntheticPaceSnapshot('forecast',now);
    render(<PaperWidgetSummary data={data} snapshot={snapshot()} failed={false} language="en" onDetails={onDetails}/>);
    const today=screen.getByTestId('paper-widget-today');
    expect(within(today).getByText('0')).toBeVisible();
    expect(within(today).getByText('$0.00')).toBeVisible();
    const official=screen.getByRole('button',{name:/^Observed today in this cycle/});
    expect(official).toHaveTextContent('Not provided');
    expect(screen.getByTestId('paper-widget-quotas').querySelectorAll('[data-reading-state=ready]')).toHaveLength(2);
    expect(screen.queryByText(/Official quota history can include other cycles/)).not.toBeInTheDocument();
    await user.hover(screen.getByRole('button',{name:'Observed window'}));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Official quota history can include other cycles on the same day.');
    expect(onDetails).not.toHaveBeenCalled();
    await user.click(official);
    expect(onDetails).toHaveBeenCalledOnce();
  });
  it('does not present yesterday’s local values as today after midnight',()=>{
    const data=syntheticPaceSnapshot('forecast',now);data.localUsage=null;
    const yesterday=new Date(now.getTime()-86400_000).toISOString().slice(0,10);
    render(<PaperWidgetSummary data={data} snapshot={snapshot(yesterday,123456,12.34)} failed={false} language="en" onDetails={()=>{}}/>);
    const today=screen.getByTestId('paper-widget-today');
    expect(today).not.toHaveTextContent('123,456');expect(today).not.toHaveTextContent('$12.34');
    expect(within(today).getAllByText('—')).toHaveLength(2);
  });
  it('keeps a local snapshot failure separate from fresh official quota readings',()=>{
    render(<PaperWidgetSummary data={syntheticPaceSnapshot('forecast',now)} snapshot={snapshot()} failed={false} localFailed language="en" onDetails={()=>{}}/>);
    expect(screen.getByTestId('paper-widget-today')).toHaveTextContent('refresh needed');
    expect(screen.getByTestId('paper-widget-quotas').querySelectorAll('[data-reading-state=ready]')).toHaveLength(2);
  });
  it('uses the workspace short-cost precision while retaining the raw snapshot cost',()=>{
    const value=snapshot(undefined,13600,.03645);
    render(<PaperWidgetSummary data={syntheticPaceSnapshot('forecast',now)} snapshot={value} failed={false} language="en" onDetails={()=>{}}/>);
    expect(screen.getByTestId('paper-widget-today')).toHaveTextContent('$0.04');
    expect(value.integration?.today.costUSD).toBe(.03645);
  });
  it.each([null,new Date(now.getTime()-900_000).toISOString()])('marks fallback tokens stale from their own timestamp %s while a newer cost stays current',updatedAt=>{
    const data=syntheticPaceSnapshot('forecast',now);
    Object.assign(data.localUsage!,{date:now.toISOString().slice(0,10),timezone:'UTC',totalTokens:123456,updatedAt,stale:false});
    render(<PaperWidgetSummary data={data} snapshot={snapshot(undefined,null,.04)} failed={false} language="en" onDetails={()=>{}}/>);
    const today=screen.getByTestId('paper-widget-today');
    const tokenRow=within(today).getByText('Tokens').closest('div')!;
    const costRow=within(today).getByText('API estimate').closest('div')!;
    expect(tokenRow).toHaveTextContent('123,456');
    expect(tokenRow).toHaveTextContent('refresh needed');
    expect(costRow).toHaveTextContent('$0.04');
    expect(costRow).not.toHaveTextContent('refresh needed');
  });
  it('does not apply an older cost snapshot freshness to current fallback tokens',()=>{
    const data=syntheticPaceSnapshot('forecast',now);
    Object.assign(data.localUsage!,{date:now.toISOString().slice(0,10),timezone:'UTC',totalTokens:123456,updatedAt:now.toISOString(),stale:false});
    const value=snapshot(undefined,null,.04);value.integration!.today.updatedAt=new Date(now.getTime()-900_000).toISOString();
    render(<PaperWidgetSummary data={data} snapshot={value} failed={false} language="en" onDetails={()=>{}}/>);
    const today=screen.getByTestId('paper-widget-today');
    const tokenRow=within(today).getByText('Tokens').closest('div')!;
    const costRow=within(today).getByText('API estimate').closest('div')!;
    expect(tokenRow).toHaveTextContent('123,456');
    expect(tokenRow).not.toHaveTextContent('refresh needed');
    expect(costRow).toHaveTextContent('refresh needed');
  });
});
