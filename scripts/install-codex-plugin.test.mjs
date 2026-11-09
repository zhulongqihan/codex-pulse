import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const helper = join(root, 'scripts/install-codex-plugin.ps1');
const templates = join(root, 'integrations/codex');
const windows = process.platform === 'win32';
const powershell = windows ? join(process.env.WINDIR || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') : '';
const nativeCandidates = [
  process.env.CODEX_PULSE_TEST_EXE,
  ...(existsSync(join(root, 'release')) ? readdirSync(join(root, 'release')).filter(name => /^CodexPulse-\d+\.\d+\.\d+-windows-x64\.exe$/.test(name)).sort().reverse().map(name => join(root, 'release', name)) : []),
  process.env.CARGO_TARGET_DIR && join(process.env.CARGO_TARGET_DIR, 'release/codex-pulse.exe'),
].filter(Boolean);
const native = nativeCandidates.find(file => existsSync(file));
const nativeVersion = native && windows ? spawnSync(powershell, ['-NoProfile','-NonInteractive','-Command', `[Diagnostics.FileVersionInfo]::GetVersionInfo([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(native).toString('base64')}'))).ProductVersion`], { encoding:'utf8',windowsHide:true,timeout:15000 }).stdout?.trim() : '';
const versionParts = (nativeVersion || '').split('.').map(Number);
const supportsEmbedded = /^\d+\.\d+\.\d+$/.test(nativeVersion || '') && (versionParts[0] > 0 || versionParts[1] > 7 || versionParts[1] === 7 && versionParts[2] >= 1);
const cli = windows ? spawnSync(powershell, ['-NoProfile','-NonInteractive','-Command','(Get-Command codex -ErrorAction SilentlyContinue | Select-Object -First 1).Source'], { encoding:'utf8', windowsHide:true }).stdout?.trim() : '';

function json(path) { return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')); }
function fixture(t) {
  const cache = join(root, '.local/codex-plugin-installer-tests');
  mkdirSync(cache, { recursive:true });
  const directory = mkdtempSync(join(cache, 'fixture-'));
  t.after(() => {
    const child = relative(cache, directory);
    assert(!isAbsolute(child) && !child.startsWith('..') && !child.includes('/') && !child.includes('\\'));
    assert(basename(directory).startsWith('fixture-'));
    rmSync(directory, { recursive:true, force:true });
  });
  const app = join(directory, "Pulse 中文 [portable] 'folder");
  mkdirSync(app, { recursive:true });
  const executable = join(app, 'CodexPulse.exe');
  if (native) { try { linkSync(native, executable); } catch { copyFileSync(native, executable); } }
  return { directory, app, executable };
}
function run(parameters, extra = {}) {
  return spawnSync(powershell, ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',helper,...parameters], { cwd:root, encoding:'utf8', windowsHide:true, timeout:30000, ...extra });
}
function success(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test('portable Codex templates use the native server and a plugin-relative local marketplace', () => {
  const marketplace = json(join(templates, '.agents/plugins/marketplace.json'));
  const plugin = json(join(templates, 'plugins/codex-pulse/plugin.json'));
  const mcp = json(join(templates, 'plugins/codex-pulse/mcp.json'));
  assert.equal(marketplace.name, 'codex-pulse-local');
  assert.equal(marketplace.plugins[0].source.path, './plugins/codex-pulse');
  assert.equal(plugin.name, 'codex-pulse');
  assert.equal(mcp.mcpServers['codex-pulse'].type, 'stdio');
  assert.equal(mcp.mcpServers['codex-pulse'].command, '__PULSE_EXECUTABLE_NAME__');
  assert.equal(mcp.mcpServers['codex-pulse'].env.PATH, '__PULSE_PATH__');
  assert.deepEqual(mcp.mcpServers['codex-pulse'].args, ['--mcp']);
  assert.equal(mcp.mcpServers['codex-pulse'].cwd, '${PLUGIN_ROOT}');
  assert.ok(existsSync(join(templates, 'plugins/codex-pulse/assets/icon.png')));
});

test('PrepareOnly handles Unicode and quoted paths without touching a Codex profile or app data', { skip:!windows || !native }, t => {
  const { directory, app, executable } = fixture(t);
  const codexHome = join(directory, 'profile must stay absent');
  mkdirSync(join(app, 'data'));
  const marker = join(app, 'data/user-data-marker.txt');
  writeFileSync(marker, 'preserve this user data');
  const args = ['-AppDirectory',app,'-CodexHome',codexHome,'-CodexExecutable',join(directory,'missing-cli.exe'),'-PrepareOnly','-Json'];
  const result = success(run(args));
  assert.equal(result.executable, executable);
  assert.equal(result.prepared, true);
  assert.equal(result.registered, false);
  assert.equal(result.opened, false);
  assert.equal(existsSync(codexHome), false);
  assert.equal(readFileSync(marker,'utf8'),'preserve this user data');
  assert.equal(result.marketplaceRoot, join(app, 'integrations/codex'));
  assert.equal(new URL(result.deepLink).searchParams.get('marketplacePath'), result.marketplacePath);
  const manifest = json(join(result.pluginRoot, 'mcp.json'));
  assert.equal(manifest.mcpServers['codex-pulse'].command, basename(executable));
  assert.equal(manifest.mcpServers['codex-pulse'].env.PULSE_DATA_DIR, process.env.PULSE_DATA_DIR || join(app, 'data'));
  assert.equal(manifest.mcpServers['codex-pulse'].env.PATH, app + (process.env.PATH ? ';' + process.env.PATH : ''));
  assert.deepEqual(manifest.mcpServers['codex-pulse'].args, ['--mcp']);
  assert.equal(json(join(result.pluginRoot, 'plugin.json')).version, result.version);
  const before = readFileSync(join(result.pluginRoot, 'mcp.json'));
  success(run(args));
  assert.deepEqual(readFileSync(join(result.pluginRoot, 'mcp.json')), before);
});

test('manual preparation binds the selected Pulse data folder without creating it, independent of the client environment', { skip:!windows || !native }, t => {
  const { directory, app } = fixture(t);
  const explicit = join(directory, 'custom data 中文');
  const environment = join(directory, 'environment data');
  const args = ['-AppDirectory',app,'-PrepareOnly','-Json'];
  const manifest = result => json(join(result.pluginRoot, 'mcp.json')).mcpServers['codex-pulse'];
  const explicitResult = success(run([...args,'-DataDirectory',explicit], { env:{...process.env,PULSE_DATA_DIR:environment} }));
  assert.equal(explicitResult.dataDirectory, explicit);
  assert.equal(manifest(explicitResult).env.PULSE_DATA_DIR, explicit);
  assert.equal(existsSync(explicit), false);
  const environmentResult = success(run(args, { env:{...process.env,PULSE_DATA_DIR:environment} }));
  assert.equal(environmentResult.dataDirectory, environment);
  assert.equal(manifest(environmentResult).env.PULSE_DATA_DIR, environment);
  assert.equal(existsSync(environment), false);
  const defaultResult = success(run(args, { env:{...process.env,PULSE_DATA_DIR:''} }));
  assert.equal(manifest(defaultResult).env.PULSE_DATA_DIR, join(app, 'data'));
  const trailing = join(directory,"data with spaces and 'quote") + '\\';
  const trailingResult = success(run([...args,'-DataDirectory',trailing]));
  assert.equal(manifest(trailingResult).env.PULSE_DATA_DIR,trailing,'Windows native invocation must preserve a quoted trailing backslash');
  assert.equal(existsSync(trailing),false);
  const before = readFileSync(join(trailingResult.pluginRoot, 'mcp.json'));
  for (const invalid of ['relative-data', 'F:drive-relative-data']) {
    assert.notEqual(run([...args,'-DataDirectory',invalid]).status, 0);
    assert.deepEqual(readFileSync(join(defaultResult.pluginRoot, 'mcp.json')), before);
  }
});

test('registration uses only the selected Codex home and preserves unrelated plugin settings', { skip:!windows || !native || !cli }, t => {
  const { directory, app } = fixture(t);
  const isolated = join(directory, 'isolated profile');
  const untouched = join(directory, 'outside profile');
  mkdirSync(isolated); mkdirSync(untouched);
  const other = '[plugins."other-plugin@example"]\nenabled = false\n';
  writeFileSync(join(isolated, 'config.toml'), other);
  writeFileSync(join(untouched, 'config.toml'), 'outside_marker = "unchanged"\n');
  const result = success(run(['-AppDirectory',app,'-CodexHome',isolated,'-CodexExecutable',cli,'-NoOpen','-Json'], { env:{...process.env,CODEX_HOME:untouched} }));
  assert.equal(result.registered,true);
  assert.equal(result.opened,false);
  assert.equal(readFileSync(join(untouched,'config.toml'),'utf8'),'outside_marker = "unchanged"\n');
  const config = readFileSync(join(isolated,'config.toml'),'utf8');
  assert.match(config, /other-plugin@example/);
  assert.match(config, /enabled = false/);
  const listing = spawnSync(powershell, ['-NoProfile','-NonInteractive','-Command','codex plugin marketplace list --json'], { encoding:'utf8',windowsHide:true,env:{...process.env,CODEX_HOME:isolated},timeout:30000 });
  assert.equal(listing.status,0,listing.stderr);
  assert.ok(listing.stdout.includes('codex-pulse-local'));
  assert.equal(existsSync(join(isolated,'plugins/cache/codex-pulse-local/codex-pulse')),false, 'Registration must not silently install the plugin');
});

test('the shipped helper works beside the executable and its templates without a source checkout', { skip:!windows || !native }, t => {
  const { app, executable } = fixture(t);
  const shippedHelper = join(app, 'install-codex-plugin.ps1');
  copyFileSync(helper, shippedHelper);
  cpSync(templates, join(app,'integrations/codex'), { recursive:true });
  const result = success(spawnSync(powershell, ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',shippedHelper,'-PrepareOnly','-Json'], { cwd:root,encoding:'utf8',windowsHide:true,timeout:30000 }));
  assert.equal(result.executable, executable);
  assert.equal(result.registered,false);
  assert.equal(result.opened,false);
  assert.equal(json(join(result.pluginRoot,'mcp.json')).mcpServers['codex-pulse'].command,basename(executable));
  assert.equal(json(join(result.pluginRoot,'mcp.json')).mcpServers['codex-pulse'].env.PATH,app + (process.env.PATH ? ';' + process.env.PATH : ''));
});

test('preparation repairs copied source placeholders and refreshes version/data binding without changing user data', { skip:!windows || !native }, t => {
  const { directory, app } = fixture(t);
  const args = ['-AppDirectory',app,'-PrepareOnly','-Json'];
  const first = success(run(args));
  const marker = join(first.pluginRoot,'keep-user-file.txt');
  writeFileSync(marker,'unknown files stay');
  const selected = join(directory,'selected data'); mkdirSync(selected);
  writeFileSync(join(selected,'preserve.txt'),'user data remains byte-exact');
  copyFileSync(join(templates,'plugins/codex-pulse/mcp.json'),join(first.pluginRoot,'mcp.json'));
  copyFileSync(join(templates,'plugins/codex-pulse/plugin.json'),join(first.pluginRoot,'plugin.json'));
  const result = success(run([...args,'-DataDirectory',selected]));
  assert.equal(json(join(result.pluginRoot,'plugin.json')).version,result.version);
  const mcp = json(join(result.pluginRoot,'mcp.json'));
  assert(!JSON.stringify(mcp).includes('__PULSE_'));
  assert.equal(mcp.mcpServers['codex-pulse'].env.PULSE_DATA_DIR,selected);
  assert.equal(readFileSync(marker,'utf8'),'unknown files stay');
  assert.equal(readFileSync(join(selected,'preserve.txt'),'utf8'),'user data remains byte-exact');
});

test('new binaries prepare from embedded templates when no external integration templates exist', { skip:!windows || !native || !supportsEmbedded }, t => {
  const { app } = fixture(t);
  const shippedHelper = join(app,'install-codex-plugin.ps1');
  copyFileSync(helper,shippedHelper);
  assert.equal(existsSync(join(app,'integrations')),false);
  const result = success(spawnSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',shippedHelper,'-PrepareOnly','-Json'],{cwd:app,encoding:'utf8',windowsHide:true,timeout:30000}));
  assert.equal(result.preparation,'embedded');
  assert.equal(json(join(result.pluginRoot,'plugin.json')).version,result.version);
  assert(!readFileSync(join(result.pluginRoot,'mcp.json'),'utf8').includes('__PULSE_'));
  assert.equal(existsSync(join(app,'data')),false,'Headless preparation must not initialize data or a WebView profile');
});

test('an explicit new-binary headless failure never falls back to legacy templates', { skip:!windows }, t => {
  const { app,executable } = fixture(t);
  if(existsSync(executable)) rmSync(executable);
  const compiler = join(process.env.WINDIR || 'C:/Windows','Microsoft.NET/Framework/v4.0.30319/csc.exe');
  assert(existsSync(compiler),'Windows .NET compiler is required for the isolated failure fixture');
  const code = join(app,'HeadlessFailure.cs');
  writeFileSync(code,`using System;using System.IO;using System.Reflection;
[assembly:AssemblyVersion("0.7.1.0")][assembly:AssemblyFileVersion("0.7.1.0")][assembly:AssemblyInformationalVersion("0.7.1")]
class HeadlessFailure { static int Main(string[] args) { File.WriteAllLines(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"headless-arguments.txt"),args);return 19;} }`);
  const compiled = spawnSync(compiler,['/nologo','/target:exe',`/out:${executable}`,code],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(compiled.status,0,compiled.stderr||compiled.stdout);
  const result = run(['-AppDirectory',app,'-PrepareOnly','-Json']);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/No legacy template fallback/);
  const args = readFileSync(join(app,'headless-arguments.txt'),'utf8');
  assert.match(args,/--prepare-codex-integration/);assert.match(args,/--data-directory/);
  assert.equal(existsSync(join(app,'integrations')),false,'A failed native prepare must not silently use source templates');
  assert.equal(existsSync(join(app,'data')),false);
});

test('missing executable, relative directory, and semicolon directory fail before creating integration files', { skip:!windows }, t => {
  const { directory } = fixture(t);
  const missing = join(directory,'missing app'); mkdirSync(missing);
  const result = run(['-AppDirectory',missing,'-PrepareOnly','-Json']);
  assert.notEqual(result.status,0);
  assert.equal(existsSync(join(missing,'integrations')),false);
  const relativeResult = run(['-AppDirectory','relative-app','-PrepareOnly','-Json']);
  assert.notEqual(relativeResult.status,0);
  const semicolonDirectory = join(directory,'invalid;folder'); mkdirSync(semicolonDirectory);
  const semicolonResult = run(['-AppDirectory',semicolonDirectory,'-PrepareOnly','-Json']);
  assert.notEqual(semicolonResult.status,0);
  assert.match(semicolonResult.stderr,/semicolon/);
  assert.equal(existsSync(join(semicolonDirectory,'integrations')),false);
});
