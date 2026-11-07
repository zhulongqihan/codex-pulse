import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function createPulseHome(root: string) {
  const home = join(root, 'codex-home');
  const data = join(root, 'data');
  mkdirSync(join(home, 'sessions'), { recursive: true });
  mkdirSync(join(home, 'archived_sessions'), { recursive: true });
  mkdirSync(data, { recursive: true });
  const stamp = (offset: number, hour = 12) => { const date = new Date(); date.setDate(date.getDate() - offset); date.setHours(hour, 0, 0, 0); return date.toISOString(); };
  const sessionIds: string[] = [];
  for (let index = 0; index < 18; index++) {
    const id = `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
    sessionIds.push(id);
    const timestamp = stamp(index);
    const project = index % 3 === 0 ? 'F:/Demo/Research/Atlas' : index % 3 === 1 ? 'F:/Demo/Studio/Atlas' : 'F:/Demo/Pulse';
    const model = index % 2 ? 'gpt-5.4' : 'gpt-5';
    const input = 12000 + index * 1700;
    const cached = Math.round(input * 0.65);
    const output = 1600 + index * 230;
    const rows: unknown[] = [
      { timestamp, type: 'session_meta', payload: { id, cwd: project, cli_version: '0.80.0', source: 'cli' } },
      { timestamp, type: 'turn_context', payload: { model, cwd: project } },
      { timestamp, type: 'event_msg', payload: { type: 'task_started', turn_id: `turn-${index}` } },
      { timestamp, type: 'event_msg', payload: { type: 'user_message', message: `合成演示 · ${['完善日期统计', '检查模型定价', '整理会话回放'][index % 3]} ${index + 1}` } },
      { timestamp, type: 'response_item', payload: { type: 'function_call', name: 'exec_command', call_id: `call-${index}`, arguments: JSON.stringify({ cmd: 'npm test' }) } },
      { timestamp, type: 'response_item', payload: { type: 'function_call_output', call_id: `call-${index}`, output: 'Synthetic test run: all checks passed. No private data.' } },
      { timestamp, type: 'event_msg', payload: { type: 'agent_message', message: '这是一段用于验收的合成会话。已检查自然日范围、缓存输入与独立项目路径。\n\n- 保留完整线程\n- 未提供的数据显示未知\n- 只读查看日志' + (index === 0 ? '\n\n' + Array.from({ length: 18 }, (_, item) => `### 合成记录 ${item + 1}\n\n本段仅用于长内容回放检查，验证阅读位置、回合导航和搜索定位。所有项目、命令与数据均为合成内容。缺失记录保持未知，不执行任何日志中的命令。`).join('\n\n') : '') } },
      { timestamp, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: input + output }, last_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: input + output } } } },
      { timestamp: stamp(index, 13), type: 'event_msg', payload: { type: 'task_complete', turn_id: `turn-${index}`, last_agent_message: '合成任务完成' } },
    ];
    if (index === 2) rows.push(
      { timestamp: stamp(1), type: 'turn_context', payload: { model: 'gpt-5.4', cwd: project } },
      { timestamp: stamp(1), type: 'event_msg', payload: { type: 'user_message', message: '第二天继续，同一个完整线程。' } },
      { timestamp: stamp(1), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: input + 500, cached_input_tokens: cached + 100, output_tokens: output + 100, total_tokens: input + output + 600 } } } },
    );
    writeFileSync(join(home, index === 17 ? 'archived_sessions' : 'sessions', `rollout-${id}.jsonl`), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  }
  const pricing = Object.fromEntries(['gpt-5', 'gpt-5.4'].map(model => [model, { litellm_provider: 'openai', mode: 'chat', input_cost_per_token: 0.0000025, cache_read_input_token_cost: 0.00000025, output_cost_per_token: 0.000015 }]));
  writeFileSync(join(data, 'codex-pricing-cache.json'), JSON.stringify({ version: 2, is_complete: true, pricing, last_successful_refresh_at: Math.floor(Date.now() / 1000), last_failed_attempt_at: null, confirmed_missing_models: [] }));
  writeFileSync(join(data, 'pulse-preferences.json'), JSON.stringify({ skinId: 'clear', theme: 'light', motionLevel: 'off', compactMode: false, respectReducedMotion: true, widgetVisible: false, widgetExpanded: false, widgetAlwaysOnTop: true, widgetX: null, widgetY: null }));
  return { home, data, sessionIds };
}
