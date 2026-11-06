import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createPackageWithOptions, listPackage } from '@electron/asar';
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build the Windows x64 portable release on Windows x64.');
const root = process.cwd(), metadata = JSON.parse(fs.readFileSync('package.json'));
const release = path.resolve(root, 'release');
const temporary = path.resolve(root, '.local', 'package');
fs.mkdirSync(temporary, { recursive: true });
process.env.TEMP = temporary; process.env.TMP = temporary; process.env.TMPDIR = temporary;
const target = path.join(release, 'CodexPulse-win32-x64');
const stage = path.join(temporary, 'app');
for (const directory of [target, stage]) {
  const resolved = path.resolve(directory);
  if (!(resolved.startsWith(release + path.sep) || resolved.startsWith(temporary + path.sep))) throw new Error('Build path escaped its workspace.');
  if (fs.existsSync(path.join(resolved, 'data'))) throw new Error('A build folder contains user data. Move it before building.');
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.mkdirSync(resolved, { recursive: true });
}
// Explicit allowlist: development artifacts and private caches never enter ASAR.
for (const entry of ['src', 'dist', 'assets', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt']) fs.cpSync(path.join(root, entry), path.join(stage, entry), { recursive: true });
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: metadata.name, productName: metadata.productName, version: metadata.version, type: 'module', main: metadata.main, author: metadata.author, license: metadata.license }));
const runtime = path.join(root, 'node_modules', 'electron', 'dist');
if (!fs.existsSync(path.join(runtime, 'electron.exe'))) throw new Error('Run npm install to prepare Electron first.');
for (const entry of fs.readdirSync(runtime)) {
  if (entry === 'electron.exe') fs.copyFileSync(path.join(runtime, entry), path.join(target, 'CodexPulse.exe'));
  else if (entry !== 'resources') fs.cpSync(path.join(runtime, entry), path.join(target, entry), { recursive: true });
}
fs.mkdirSync(path.join(target, 'resources'), { recursive: true });
const asar = path.join(target, 'resources', 'app.asar');
await createPackageWithOptions(stage, asar, { unpackDir: 'src/main' });
const entries = listPackage(asar);
if (entries.some(entry => /(?:\.local|node_modules|auth\.json|\.jsonl|context_summary|statistics|\.sqlite)/i.test(entry))) throw new Error('Unexpected private/development artifact in ASAR.');
// Embed this project's icon and product metadata without moving a runtime folder.
const executable = path.join(target, 'CodexPulse.exe');
const exe = NtExecutable.from(fs.readFileSync(executable));
const resources = NtExecutableResource.from(exe);
const icon = Resource.IconGroupEntry.fromEntries(resources.entries)[0];
Resource.IconGroupEntry.replaceIconsForResource(resources.entries, icon.id, icon.lang, Data.IconFile.from(fs.readFileSync('assets/icon.ico')).icons.map(item => item.data));
const info = Resource.VersionInfo.fromEntries(resources.entries)[0];
const version = metadata.version.split('.').map(Number);
info.setFileVersion(...version, 0); info.setProductVersion(...version, 0);
for (const language of info.getAllLanguagesForStringValues()) info.setStringValues(language, { CompanyName: metadata.author, ProductName: 'Codex Pulse', FileDescription: 'Codex Pulse', InternalName: 'CodexPulse', OriginalFilename: 'CodexPulse.exe', FileVersion: metadata.version, ProductVersion: metadata.version, LegalCopyright: 'Copyright (c) 2026 zhulongqihan' });
info.outputToResourceEntries(resources.entries); resources.outputResource(exe);
fs.writeFileSync(executable, Buffer.from(exe.generate()));
fs.writeFileSync(path.join(target, 'Start-Codex-Pulse.cmd'), '@echo off\r\nstart "" "%~dp0CodexPulse.exe"\r\n');
for (const entry of ['README.zh-CN.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_LICENSES.txt']) {
  fs.copyFileSync(entry, path.join(target, entry === 'LICENSE' ? 'LICENSE.CodexPulse.txt' : entry));
}
const archive = path.join(release, `CodexPulse-${metadata.version}-windows-x64.zip`);
const ps = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const quote = text => "'" + text.replaceAll("'", "''") + "'";
const zip = spawnSync(ps, ['-NoProfile', '-Command', `Compress-Archive -LiteralPath ${quote(target)} -DestinationPath ${quote(archive)} -Force`], { stdio: 'inherit', windowsHide: true });
if (zip.status !== 0) throw new Error('Portable archive creation failed');
const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
fs.writeFileSync(archive + '.sha256', hash + '  ' + path.basename(archive) + '\n');
console.log(JSON.stringify({ executable, archive, sha256: hash, asarEntries: entries.length }));
