// @vitest-environment jsdom
import {fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {AppSidebar} from './app-sidebar';
import type {DashboardView} from './dashboard-header';

function Navigation({logs=false,presentation='paper-tabs'}:{logs?:boolean;presentation?:'paper-tabs'|'sidebar'}) {
  const [view,setView]=useState<DashboardView>('dashboard');
  return <AppSidebar presentation={presentation} view={view} onViewChange={setView} collapsed={true} onToggleCollapsed={vi.fn()} width={184} onWidthChange={vi.fn()} showLogsTab={logs} limits={null}/>;
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

describe('sidebar navigation follows the vertical tab order',()=>{
  it('moves focus and selection with the arrow keys and respects the optional logs tab',()=>{
    render(<Navigation presentation="sidebar" logs/>);
    const tabs=screen.getByRole('tablist');
    const dashboard=screen.getByTestId('dashboard-nav-tab');
    const projects=screen.getByTestId('projects-nav-tab');
    const logs=screen.getByTestId('logs-nav-tab');
    expect(tabs).toHaveAttribute('aria-orientation','vertical');
    expect(dashboard.tabIndex).toBe(0);
    expect(projects.tabIndex).toBe(0);
    fireEvent.keyDown(dashboard,{key:'End'});
    expect(logs).toHaveAttribute('aria-selected','true');
    expect(logs).toHaveFocus();
    fireEvent.keyDown(logs,{key:'ArrowUp'});
    expect(projects).toHaveAttribute('aria-selected','true');
    expect(projects).toHaveFocus();
    fireEvent.keyDown(projects,{key:'Home'});
    expect(dashboard).toHaveAttribute('aria-selected','true');
    expect(dashboard).toHaveFocus();
  });
});
