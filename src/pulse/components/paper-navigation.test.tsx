// @vitest-environment jsdom
import {fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {AppSidebar} from './app-sidebar';
import type {DashboardView} from './dashboard-header';

function Navigation({logs=false}:{logs?:boolean}) {
  const [view,setView]=useState<DashboardView>('dashboard');
  return <AppSidebar presentation="paper-tabs" view={view} onViewChange={setView} collapsed={true} onToggleCollapsed={vi.fn()} width={184} onWidthChange={vi.fn()} showLogsTab={logs} limits={null}/>;
}
describe('paper navigation preserves access to the actual views',()=>{
  it('keeps settings and seven business views reachable despite a saved collapsed sidebar',()=>{
    render(<Navigation/>);
    const tabs=screen.getByRole('tablist');
    expect(tabs).toHaveAttribute('aria-orientation','horizontal');
    expect(screen.getAllByRole('tab')).toHaveLength(8);
    expect(screen.getByTestId('settings-nav-tab')).toBeVisible();
    expect(screen.queryByTestId('logs-nav-tab')).not.toBeInTheDocument();
  });
  it('lets keyboard users switch tabs and wrap back from settings to dashboard',()=>{
    render(<Navigation logs/>);
    fireEvent.keyDown(screen.getByTestId('dashboard-nav-tab'),{key:'ArrowRight'});
    expect(screen.getByTestId('analysis-nav-tab')).toHaveAttribute('aria-selected','true');
    expect(screen.getByTestId('analysis-nav-tab')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('analysis-nav-tab'),{key:'End'});
    expect(screen.getByTestId('settings-nav-tab')).toHaveAttribute('aria-selected','true');
    fireEvent.keyDown(screen.getByTestId('settings-nav-tab'),{key:'ArrowRight'});
    expect(screen.getByTestId('dashboard-nav-tab')).toHaveAttribute('aria-selected','true');
  });
});
