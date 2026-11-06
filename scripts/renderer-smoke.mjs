import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { getDemoSnapshot, defaultSettings } from '../src/renderer/demo-data.js';
import { rangeFrom } from '../src/renderer/analytics.js';
const root = process.cwd(),
  dist = path.resolve('dist'),
  out = path.resolve('.local/renderer-smoke');
fs.mkdirSync(out, { recursive: true });
process.env.TEMP = path.resolve('.local/temp');
process.env.TMP = process.env.TEMP;
const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  try {
    const target = path.resolve(
      dist,
      '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
    );
    if (target !== dist && !target.startsWith(dist + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const file = target === dist ? path.join(dist, 'index.html') : target;
    if (!fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      'Content-Type',
      contentTypes[path.extname(file)] || 'application/octet-stream',
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(400).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const checks = [],
  errors = [],
  check = (name, value) => {
    assert(value, name);
    checks.push(name);
  };
try {
  const all = getDemoSnapshot(),
    samples = { all };
  for (const preset of [
    '1',
    '2',
    '7',
    '14',
    '30',
    '60',
    '90',
    '180',
    '365',
    'all',
  ]) {
    const range = rangeFrom(preset, '2026-11-06', all.daily[0].date);
    samples[range.from + '|' + range.to] = getDemoSnapshot(range);
  }
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ({ samples, defaults }) => {
      let settings = { ...defaults, skinId: 'meter', compactMode: false },
        onSettings = () => {};
      window.__pulseSmoke = { fail: false, exports: [], reads: 0 };
      window.pulse = {
        getSettings: async () => settings,
        saveSettings: async (patch) => {
          settings = { ...settings, ...patch };
          onSettings(settings);
          return settings;
        },
        onSettings: (fn) => {
          onSettings = fn;
          return () => {
            onSettings = () => {};
          };
        },
        onSnapshot: () => () => {},
        refresh: async () => {},
        action: async () => true,
        exportData: async (format, range) => {
          window.__pulseSmoke.exports.push({ format, range });
          return true;
        },
        getSnapshot: async (range) => {
          window.__pulseSmoke.reads++;
          if (!range) return samples.all;
          await new Promise((r) => setTimeout(r, 50));
          if (window.__pulseSmoke.fail)
            throw Error('Synthetic unavailable source');
          return samples[range.from + '|' + range.to];
        },
      };
    },
    { samples, defaults: defaultSettings },
  );
  await page.goto(url + '/#/overview');
  await page.locator('.summary-strip').filter({ hasText: '141.9M' }).waitFor();
  const oldRange = await page.locator('.range-left>strong').innerText();
  await page.evaluate(() => {
    window.__pulseSmoke.fail = true;
  });
  await page
    .getByRole('combobox', { name: '日期范围', exact: true })
    .selectOption('2');
  await page
    .locator('.range-loading')
    .filter({ hasText: '上次成功' })
    .waitFor();
  check(
    '范围请求失败不重新标记旧数据',
    (await page.locator('.range-left>strong').innerText()) === oldRange &&
      (await page
        .locator('.summary-strip')
        .innerText()
        .then((t) => t.includes('141.9M'))),
  );
  check(
    '范围请求失败禁用导出',
    await page.getByRole('button', { name: '导出', exact: true }).isDisabled(),
  );
  await page.evaluate(() => {
    window.__pulseSmoke.fail = false;
  });
  await page
    .getByRole('combobox', { name: '日期范围', exact: true })
    .selectOption('1');
  await page
    .locator('.range-left>strong')
    .filter({ hasText: '2026-11-06 — 2026-11-06' })
    .waitFor();
  check(
    '成功查询提交新范围及统计',
    (await page
      .locator('.summary-strip')
      .innerText()
      .then((t) => t.includes('24.8M'))) &&
      !(await page
        .getByRole('button', { name: '导出', exact: true })
        .isDisabled()),
  );
  await page.getByRole('button', { name: '导出', exact: true }).click();
  await page
    .getByRole('button', { name: '导出 Markdown', exact: true })
    .click();
  check(
    '导出范围与显示范围一致',
    await page.evaluate(
      () =>
        window.__pulseSmoke.exports.length === 1 &&
        window.__pulseSmoke.exports[0].range.from === '2026-11-06' &&
        window.__pulseSmoke.exports[0].range.to === '2026-11-06',
    ),
  );
  await page.getByRole('button', { name: '会话', exact: true }).click();
  await page
    .getByRole('textbox', { name: '搜索会话', exact: true })
    .fill('代码实验');
  await page
    .getByRole('combobox', { name: '界面风格', exact: true })
    .selectOption('clear');
  check(
    '正式renderer换肤保留会话搜索',
    (await page
      .getByRole('textbox', { name: '搜索会话', exact: true })
      .inputValue()) === '代码实验',
  );
  await page.getByRole('button', { name: '按月', exact: true }).click();
  check(
    '正式按月页面有自然月数据',
    await page
      .locator('tbody')
      .innerText()
      .then((t) => t.includes('2026-11')),
  );
  await page
    .getByRole('combobox', { name: '界面风格', exact: true })
    .selectOption('meter');
  await page.locator('button[data-route="overview"]').click();
  await page.setViewportSize({ width: 1000, height: 900 });
  check(
    '1000窄窗不横向溢出',
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.getByRole('button', { name: '账户额度', exact: true }).click();
  check('窄窗额度入口可达', await page.locator('#account-panel').isVisible());
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  check(
    '390窗口不横向溢出',
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  check(
    '小屏六入口可见',
    await page
      .locator('nav button')
      .evaluateAll(
        (els) =>
          els.length === 6 &&
          els.every((e) => e.getBoundingClientRect().right <= innerWidth),
      ),
  );
  await page.screenshot({
    path: path.join(out, 'meter-mobile.png'),
    fullPage: true,
  });
  await page.locator('button[data-route="settings"]').click();
  await page
    .getByRole('combobox', { name: '界面语言', exact: true })
    .selectOption('en');
  await page.locator('button[data-route="overview"]').click();
  check(
    '英文界面可达',
    await page
      .getByRole('heading', { name: 'Usage overview', exact: true })
      .isVisible(),
  );
  check('renderer无运行错误', errors.length === 0);
  fs.writeFileSync(
    path.join(out, 'report.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        scope:
          'Production renderer with synthetic controlled IPC, including failed range requests',
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Renderer smoke passed: ' +
      checks.length +
      ' checks, including failed range loading and matching exports.',
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
