import { createTauriCapabilities } from '@wdio/tauri-service';
import { browser } from '@wdio/globals';
import { mkdirSync } from 'node:fs';
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

export const config: WebdriverIO.Config = {
  runner: 'local', specs: ['./e2e/pulse.spec.ts'], maxInstances: 1,
  capabilities: [createTauriCapabilities(appBinaryPath)],
  services: [['@wdio/tauri-service', { appBinaryPath, driverProvider: 'embedded', logLevel: 'error', captureBackendLogs: true, captureFrontendLogs: true }]],
  framework: 'mocha', reporters: ['spec'], logLevel: 'error', outputDir: output,
  tsConfigPath: './tsconfig.e2e.json', waitforTimeout: 20000, connectionRetryTimeout: 30000, connectionRetryCount: 0,
  mochaOpts: { ui: 'bdd', timeout: 120000 },
  async before() { await browser.switchToWindow('main'); },
};
