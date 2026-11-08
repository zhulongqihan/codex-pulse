import { createTauriCapabilities } from '@wdio/tauri-service';
import { browser } from '@wdio/globals';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createPulseHome } from './e2e/fixtures/pulse-home';

const output = resolve('.local/native-parity');
mkdirSync(output, { recursive: true });
const fixtureRoot = process.env.PULSE_TEST_FIXTURE_ROOT || join(output, `run-${Date.now()}`);
process.env.PULSE_TEST_FIXTURE_ROOT = fixtureRoot;
const fixture = createPulseHome(fixtureRoot);
process.env.PULSE_CODEX_HOME = fixture.home;
process.env.PULSE_DATA_DIR = fixture.data;
process.env.PULSE_OFFLINE = '1';
process.env.CODEX_HOME = fixture.home;
process.env.PULSE_TEST_OUTPUT = output;
const appBinaryPath = resolve(process.env.CARGO_TARGET_DIR || 'src-tauri/target', 'debug/codex-pulse.exe');
process.env.PULSE_TITLEBAR_EXPECTED_APP_BINARY = appBinaryPath;
if (!process.env.PULSE_TITLEBAR_CONTROL_DIR) {
  const powershell = join(process.env.WINDIR || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    resolve('e2e/fixtures/titlebar-host.ps1'), '-OutputDirectory', join(fixtureRoot, 'titlebar-host'), '-Start'],
  { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
  if (result.status !== 0) throw new Error(`Cannot start the owned synthetic host: ${result.stderr}`);
  const host = JSON.parse(result.stdout.trim());
  process.env.PULSE_TITLEBAR_TEST_PID = String(host.processId);
  process.env.PULSE_TITLEBAR_CONTROL_DIR = host.controlDirectory;
}

export const config: WebdriverIO.Config = {
  runner: 'local', specs: [['./e2e/pulse.spec.ts', './e2e/titlebar.spec.ts']], maxInstances: 1,
  capabilities: [createTauriCapabilities(appBinaryPath)],
  services: [['@wdio/tauri-service', { appBinaryPath, driverProvider: 'embedded', logLevel: 'error', captureBackendLogs: true, captureFrontendLogs: true }]],
  framework: 'mocha', reporters: ['spec'], logLevel: 'error', outputDir: output,
  tsConfigPath: './tsconfig.e2e.json', waitforTimeout: 20000, connectionRetryTimeout: 30000, connectionRetryCount: 0,
  mochaOpts: { ui: 'bdd', timeout: 120000 },
  async before() {
    await browser.switchToWindow('main');
    // Screenshot and accessible-name fixtures must not depend on the runner's OS locale.
    await browser.execute(() => localStorage.setItem('language', 'zh'));
    await browser.refresh();
  },
  onComplete() {
    // Only this owned fixture reads this directory; no global process termination.
    writeFileSync(join(process.env.PULSE_TITLEBAR_CONTROL_DIR!, 'command.json'), JSON.stringify({ id: randomUUID(), action: 'stop' }));
  },
};
