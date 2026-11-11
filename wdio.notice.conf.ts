import { createTauriCapabilities } from '@wdio/tauri-service';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createPulseHome } from './e2e/fixtures/pulse-home';
import { writeNoticeFixture } from './e2e/fixtures/notice';

const output = resolve('.local/native-notice-sync');
mkdirSync(output, { recursive: true });
// WDIO evaluates this module in both launcher and worker processes. The worker
// must reuse the launched app's directory without reseeding its active files.
const inheritedRoot = process.env.PULSE_NOTICE_TEST_FIXTURE_ROOT;
const root = inheritedRoot || join(output, `run-${Date.now()}`);
process.env.PULSE_NOTICE_TEST_FIXTURE_ROOT = root;
const fixture = inheritedRoot ? { home: join(root, 'codex-home'), data: join(root, 'data') } : createPulseHome(root);
if (!inheritedRoot) writeNoticeFixture(fixture.data);
Object.assign(process.env, {
  PULSE_CODEX_HOME: fixture.home, CODEX_HOME: fixture.home,
  PULSE_DATA_DIR: fixture.data, PULSE_OFFLINE: '1',
  PULSE_NOTICE_TEST_DATA: fixture.data, PULSE_NOTICE_TEST_OUTPUT: output,
});
const appBinaryPath = resolve(process.env.CARGO_TARGET_DIR || 'src-tauri/target', 'debug/codex-pulse.exe');

export const config: WebdriverIO.Config = {
  runner: 'local', specs: ['./e2e/notice-sync.spec.ts'], maxInstances: 1,
  capabilities: [createTauriCapabilities(appBinaryPath)],
  services: [['@wdio/tauri-service', { appBinaryPath, driverProvider: 'embedded', logLevel: 'error', captureBackendLogs: true, captureFrontendLogs: true }]],
  framework: 'mocha', reporters: ['spec'], logLevel: 'error', outputDir: output,
  tsConfigPath: './tsconfig.e2e.json', waitforTimeout: 20_000,
  connectionRetryTimeout: 30_000, connectionRetryCount: 0,
  mochaOpts: { ui: 'bdd', timeout: 120_000 },
};
