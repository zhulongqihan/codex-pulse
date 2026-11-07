import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Scan the current tree or index only. Historical releases are never rewritten.
const PRIVATE_DIRECTORIES = new Set([
  '.local', '.cache', 'cache', 'caches', 'node_modules', 'release', 'dist',
  'target', 'output', 'data', '.codex', 'sessions', 'archived_sessions',
  '.impeccable', '.playwright-cli', 'playwright-report', 'test-results',
]);
const INTERNAL_DOCUMENTS = new Set([
  'docs/contract.md', 'docs/roadmap.md', 'docs/feature_parity.zh-cn.md',
  'docs/parity_implementation.zh-cn.md',
]);
const SECRET_RULES = [
  ['private-key', /-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----/g],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g],
  ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g],
  ['openai-project-key', /\bsk-proj-[A-Za-z0-9_-]{32,}\b/g],
  ['openai-service-account-key', /\bsk-svcacct-[A-Za-z0-9_-]{32,}\b/g],
];

export function checkPath(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const lower = normalized.toLowerCase();
  const parts = lower.split('/');
  const base = parts.at(-1);
  const rules = [];
  if (!normalized || lower.startsWith('/') || /^[a-z]:/i.test(normalized) || parts.includes('..')) {
    rules.push('invalid-repository-path');
  }
  if (parts.some(part => PRIVATE_DIRECTORIES.has(part))) rules.push('private-or-generated-directory');
  if (lower.includes('codexpulse-内部资料')) rules.push('internal-materials');
  if (/^(?:product|design|agents)\.md$/.test(lower)) rules.push('local-project-brief');
  if (INTERNAL_DOCUMENTS.has(lower) || /^docs\/(?:audits|parity)(?:\/|$)/.test(lower)
    || /^docs\/context_summary[^/]*$/.test(lower)) rules.push('internal-document');
  if (base === 'auth.json') rules.push('account-credentials');
  if (base.startsWith('.env') && base !== '.env.example') rules.push('environment-secrets');
  if (/\.(?:db|sqlite|sqlite3)(?:[-.].*)?$/.test(base)) rules.push('private-database');
  if (/\.(?:jsonl|ndjson)(?:\.(?:gz|zst))?$/.test(base)) rules.push('private-session-log');
  if (/\.(?:log|pdb|ilk)$/.test(base)) rules.push('local-runtime-artifact');
  return [...new Set(rules)];
}

function decodeContent(content) {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString('utf16le');
  if (bytes[0] === 0xfe && bytes[1] === 0xff && bytes.length % 2 === 0) {
    return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
  }
  return bytes.toString('utf8');
}

export function inspectFile(filePath, content = '') {
  const pathRules = checkPath(filePath);
  // A forbidden path is sufficient; do not inspect private contents unnecessarily.
  if (pathRules.length) return pathRules.map(rule => ({ path: filePath, rule }));
  const text = decodeContent(content);
  return SECRET_RULES.flatMap(([rule, expression]) => {
    expression.lastIndex = 0;
    return expression.test(text) ? [{ path: filePath, rule }] : [];
  });
}

function git(cwd, arguments_) {
  return execFileSync('git', arguments_, {
    cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
  });
}

export function scanRepository({ cwd = process.cwd(), staged = false } = {}) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  const files = git(root, staged
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '--no-ext-diff', '-z', '--']
    : ['ls-files', '-z', '--']).toString('utf8').split('\0').filter(Boolean);
  const findings = [];
  for (const filePath of files) {
    const pathRules = checkPath(filePath);
    if (pathRules.length) {
      findings.push(...pathRules.map(rule => ({ path: filePath, rule })));
      continue;
    }
    if (staged) {
      // Read the actual staged blob; cleaning an unstaged copy cannot bypass the gate.
      const bytes = git(root, ['show', '--no-ext-diff', '--no-textconv', `:0:${filePath}`]);
      findings.push(...inspectFile(filePath, bytes));
    } else {
      const file = resolve(root, filePath);
      let stat;
      try { stat = lstatSync(file); }
      catch { findings.push({ path: filePath, rule: 'missing-tracked-file' }); continue; }
      if (!stat.isFile()) {
        findings.push({ path: filePath, rule: 'unsupported-tracked-file-type' });
        continue;
      }
      findings.push(...inspectFile(filePath, readFileSync(file)));
    }
  }
  return { passed: findings.length === 0, mode: staged ? 'staged' : 'tracked', filesChecked: files.length, findings };
}

// Path names are useful diagnostics, but a token used as a file name must not leak.
function safeOutput(result) {
  return {
    ...result,
    findings: result.findings.map(finding => {
      let path = finding.path;
      for (const [, expression] of SECRET_RULES) {
        expression.lastIndex = 0;
        path = path.replace(expression, '[redacted]');
      }
      return { path, rule: finding.rule };
    }),
  };
}

export function main(arguments_ = process.argv.slice(2)) {
  if (arguments_.some(argument => argument !== '--staged') || arguments_.length > 1) {
    process.stderr.write('Usage: node scripts/check-public-files.mjs [--staged]\n');
    return 2;
  }
  try {
    const result = scanRepository({ staged: arguments_.includes('--staged') });
    process.stdout.write(`${JSON.stringify(safeOutput(result), null, 2)}\n`);
    return result.passed ? 0 : 1;
  } catch {
    // Git errors can include file contents or paths. Do not relay raw stderr.
    process.stderr.write('Unable to inspect public files. Run inside the Git checkout and check that tracked/index files are readable.\n');
    return 2;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
