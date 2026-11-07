import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION_FILES = Object.freeze([
  'package.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
]);

const USAGE = 'Usage: node scripts/version.mjs check | bump <patch|minor|major|X.Y.Z> [--dry-run]';
const MAX_COMPONENT = 4_294_967_295n; // The native update reader parses each component as u32.

export function parseVersion(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`Unsupported version ${JSON.stringify(value)}: use stable X.Y.Z without prefixes, prerelease labels or build metadata.`);
  }
  const parts = value.split('.').map(BigInt);
  if (parts.some(part => part > MAX_COMPONENT)) {
    throw new Error(`Unsupported version ${value}: each component must fit the native updater's u32 range.`);
  }
  return parts;
}

export function nextVersion(current, target) {
  const previous = parseVersion(current);
  let next;
  if (['patch', 'minor', 'major'].includes(target)) {
    next = [...previous];
    const index = { major: 0, minor: 1, patch: 2 }[target];
    next[index]++;
    for (let following = index + 1; following < next.length; following++) next[following] = 0n;
  } else {
    next = parseVersion(target);
  }
  const version = next.join('.');
  parseVersion(version);
  const difference = next.findIndex((part, index) => part !== previous[index]);
  if (difference < 0 || next[difference] < previous[difference]) {
    throw new Error(`Version must increase: ${current} -> ${version} is not allowed.`);
  }
  return version;
}

function readText(path) {
  // Reject invalid UTF-8 rather than silently rewriting bytes in the manifests.
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(path));
}

function jsonVersion(text, name) {
  let metadata;
  try { metadata = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch (cause) { throw new Error(`Cannot parse ${name}: ${cause.message}`); }
  if (name === 'package.json' && metadata.name !== 'codex-pulse') {
    throw new Error('package.json must describe codex-pulse.');
  }
  // Find the root property only. Nested dependency objects may also contain "version".
  const matches = [];
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      const start = index++;
      while (index < text.length && text[index] !== '"') {
        if (text[index] === '\\') index++;
        index++;
      }
      if (depth !== 1 || JSON.parse(text.slice(start, index + 1)) !== 'version') continue;
      let valueStart = index + 1;
      while (/\s/.test(text[valueStart] ?? '') && valueStart < text.length) valueStart++;
      if (text[valueStart] !== ':') continue;
      valueStart++;
      while (/\s/.test(text[valueStart] ?? '') && valueStart < text.length) valueStart++;
      if (text[valueStart] !== '"') throw new Error(`${name} version must be a string.`);
      const contentStart = ++valueStart;
      while (valueStart < text.length && text[valueStart] !== '"') {
        if (text[valueStart] === '\\') valueStart++;
        valueStart++;
      }
      matches.push({ start: contentStart, end: valueStart, version: metadata.version });
    } else if (character === '{' || character === '[') {
      depth++;
    } else if (character === '}' || character === ']') {
      depth--;
    }
  }
  if (matches.length !== 1) throw new Error(`${name} must contain exactly one root version property.`);
  return matches[0];
}

function tomlField(block, field, name, offset) {
  const matches = [...block.matchAll(new RegExp(`^([ \\t]*${field}[ \\t]*=[ \\t]*)(["'])([^"'\\r\\n]*)\\2[ \\t]*(?:#.*)?$`, 'gm'))];
  if (matches.length !== 1) throw new Error(`${name} must contain exactly one ${field} in the selected package.`);
  const match = matches[0];
  const start = offset + match.index + match[1].length + 1;
  return { start, end: start + match[3].length, version: match[3] };
}

function tomlVersion(text, name) {
  const headers = [...text.matchAll(/^\s*(\[\[?[^\]\r\n]+\]\]?)[ \t]*(?:#.*)?\r?$/gm)];
  const expected = name.endsWith('Cargo.lock') ? '[[package]]' : '[package]';
  const packages = [];
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index];
    if (header[1] !== expected) continue;
    const start = header.index + header[0].length;
    const end = headers[index + 1]?.index ?? text.length;
    const block = text.slice(start, end);
    const packageName = tomlField(block, 'name', name, start).version;
    if (packageName === 'codex-pulse') packages.push(tomlField(block, 'version', name, start));
  }
  if (packages.length !== 1) throw new Error(`${name} must contain exactly one codex-pulse package.`);
  return packages[0];
}

function versionField(text, name) {
  const field = name.endsWith('.json') ? jsonVersion(text, name) : tomlVersion(text, name);
  try { parseVersion(field.version); }
  catch (cause) { throw new Error(`${name}: ${cause.message}`); }
  return field;
}

export function checkVersions(directory = process.cwd()) {
  const root = resolve(directory);
  const files = VERSION_FILES.map(relativePath => {
    const path = resolve(root, relativePath);
    const before = readText(path);
    return { relativePath, path, before, ...versionField(before, relativePath) };
  });
  const version = files[0].version;
  if (files.some(file => file.version !== version)) {
    throw new Error(`Version mismatch: ${files.map(file => `${file.relativePath}=${file.version}`).join(', ')}`);
  }
  return { root, version, files };
}

export function planVersionBump(directory, target) {
  const checked = checkVersions(directory);
  const version = nextVersion(checked.version, target);
  return {
    root: checked.root,
    from: checked.version,
    to: version,
    files: checked.files.map(file => ({ ...file, after: file.before.slice(0, file.start) + version + file.before.slice(file.end) })),
  };
}

export function applyVersionBump(plan, { writeFile = writeFileSync } = {}) {
  // Validate the whole plan and reject concurrent edits before writing any file.
  if (plan.files.length !== VERSION_FILES.length) throw new Error('Version plan must contain all four manifests.');
  nextVersion(plan.from, plan.to);
  for (const [index, file] of plan.files.entries()) {
    if (file.relativePath !== VERSION_FILES[index] || file.path !== resolve(plan.root, file.relativePath)) {
      throw new Error('Version plan contains an unexpected file.');
    }
    const field = versionField(file.before, file.relativePath);
    const expected = file.before.slice(0, field.start) + plan.to + file.before.slice(field.end);
    if (field.version !== plan.from || file.after !== expected || versionField(file.after, file.relativePath).version !== plan.to) {
      throw new Error(`Version plan contains unexpected changes in ${file.relativePath}.`);
    }
    if (readText(file.path) !== file.before) throw new Error(`${file.relativePath} changed after planning; no files were written.`);
  }
  const attempted = [];
  try {
    for (const file of plan.files) {
      attempted.push(file); // A failed write can already have truncated this file.
      writeFile(file.path, file.after, 'utf8');
    }
    const checked = checkVersions(plan.root);
    if (checked.version !== plan.to || plan.files.some(file => readText(file.path) !== file.after)) {
      throw new Error('Version files did not match the complete prepared update.');
    }
  } catch (cause) {
    const rollbackErrors = [];
    for (const file of attempted.reverse()) {
      try {
        if (readText(file.path) === file.before) continue;
      } catch { /* Restore a file even if the failed write removed or corrupted it. */ }
      try {
        writeFile(file.path, file.before, 'utf8');
        if (readText(file.path) !== file.before) throw new Error('Restored contents did not match.');
      } catch (rollbackError) {
        rollbackErrors.push(new Error(`${file.relativePath}: ${rollbackError.message}`));
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError([cause, ...rollbackErrors], `Version update failed and rollback was incomplete. Restore these files before continuing: ${rollbackErrors.map(error => error.message).join('; ')}`);
    }
    throw new Error(`Version update failed; original files were restored: ${cause.message}`, { cause });
  }
  return { from: plan.from, to: plan.to, files: plan.files.map(file => file.relativePath), dryRun: false };
}

export function bumpVersion(directory, target, { dryRun = false, writeFile = writeFileSync } = {}) {
  const plan = planVersionBump(directory, target);
  return dryRun
    ? { from: plan.from, to: plan.to, files: plan.files.map(file => file.relativePath), dryRun: true }
    : applyVersionBump(plan, { writeFile });
}

export function runCLI(args, directory = process.cwd(), print = console.log) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { print(USAGE); return; }
  if (args.length === 1 && args[0] === 'check') {
    const checked = checkVersions(directory);
    print(`Version check passed: ${checked.version} (${checked.files.length} files).`);
    return;
  }
  const flags = args.filter(argument => argument === '--dry-run');
  const positional = args.filter(argument => argument !== '--dry-run');
  if (flags.length > 1 || positional.length !== 2 || positional[0] !== 'bump') throw new Error(USAGE);
  const result = bumpVersion(directory, positional[1], { dryRun: flags.length === 1 });
  print(`${result.dryRun ? 'Dry run' : 'Updated version'}: ${result.from} -> ${result.to}`);
  for (const name of result.files) print(`  ${name}`);
  if (result.dryRun) print('No files were written.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCLI(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
