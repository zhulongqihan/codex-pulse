import { parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { createZstdDecompress } from 'node:zlib';
import { PARSER_VERSION, createLogParser, canonicalFiles, aggregateRecords } from './scanner-core.mjs';

const { dataDir, codexHome, timeZone, force = false } = workerData;
const cachePath = path.join(dataDir, 'usage-files-v1.json');
const warnings = new Set();
let lastProgress = 0;
let discovered = 0;

function progress(done, total, extra = {}, urgent = false) {
  const now = Date.now();
  if (urgent || now - lastProgress > 220) {
    lastProgress = now;
    parentPort.postMessage({ type: 'progress', progress: { done, total, ...extra } });
  }
}

async function discover(root, archived) {
  const found = [];
  async function visit(directory, relative = '') {
    let entries;
    try { entries = await fsp.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code !== 'ENOENT') warnings.add('A source directory could not be read.'); return false; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      const local = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(absolute, local);
      else if (entry.isFile() && /\.jsonl(?:\.zst)?$/i.test(entry.name)) {
        try {
          const stat = await fsp.stat(absolute);
          found.push({ path: absolute, relative: local, archived, size: stat.size, mtimeMs: stat.mtimeMs });
        } catch { warnings.add('A source log changed while it was being listed.'); }
      }
    }
    return true;
  }
  const accessible = await visit(root);
  return { accessible, entries: found };
}

async function* linesFrom(filePath, onBytes = () => {}, onWarning = () => {}) {
  const input = fs.createReadStream(filePath, { highWaterMark: 128 * 1024 });
  const compressed = /\.zst$/i.test(filePath);
  const stream = compressed ? input.pipe(createZstdDecompress()) : input;
  input.on('error', error => { if (stream !== input) stream.destroy(error); });
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let dropping = false;
  const maxLine = 4 * 1024 * 1024;
  try {
    for await (const chunk of stream) {
      onBytes(input.bytesRead);
      let text = decoder.write(chunk);
      if (dropping) {
        const newline = text.indexOf('\n');
        if (newline < 0) continue;
        text = text.slice(newline + 1);
        dropping = false;
      }
      pending += text;
      let newline;
      while ((newline = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (line.length <= maxLine) yield line;
        else onWarning('An oversized log record was ignored.');
      }
      if (pending.length > maxLine) { pending = ''; dropping = true; onWarning('An oversized log record was ignored.'); }
    }
    pending += decoder.end();
    // A complete final JSON record is valid without a trailing newline. An
    // incomplete append is left for the next refresh, without storing its text.
    if (!dropping && pending && pending.length <= maxLine && /"(?:session_meta|turn_context|token_count|token_usage_record|compacted|task_started|turn_started)"/.test(pending)) {
      try { JSON.parse(pending); yield pending; } catch { /* Incomplete trailing record. */ }
    }
  } finally {
    input.destroy();
    if (stream !== input) stream.destroy();
  }
}

async function run() {
  await fsp.mkdir(dataDir, { recursive: true });
  let oldCache = { parserVersion: PARSER_VERSION, files: {} };
  try {
    const parsed = JSON.parse(await fsp.readFile(cachePath, 'utf8'));
    if (parsed.parserVersion === PARSER_VERSION && parsed.files && typeof parsed.files === 'object') oldCache = parsed;
  } catch { /* Missing or invalid private cache is reconstructed from local logs. */ }
  const active = await discover(path.join(codexHome, 'sessions'), false);
  const archived = await discover(path.join(codexHome, 'archived_sessions'), true);
  if (!active.accessible && !archived.accessible) {
    parentPort.postMessage({ type: 'unavailable', errorCode: 'LOGS_NOT_FOUND' });
    return;
  }
  const entries = canonicalFiles([...active.entries, ...archived.entries]);
  discovered = entries.length;
  const nextFiles = {};
  const summaries = [];
  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  let bytesDone = 0;
  let parsedFiles = 0;
  progress(0, entries.length, { bytesDone, totalBytes }, true);
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const key = entry.path;
    const fingerprint = `${entry.size}:${entry.mtimeMs}`;
    const prior = oldCache.files[key];
    let summary;
    if (!force && prior?.fingerprint === fingerprint && prior.summary) summary = prior.summary;
    else {
      const parser = createLogParser({ fileKey: entry.logicalKey, timeZone });
      const fileWarnings = new Set();
      try {
        for await (const line of linesFrom(entry.path,
          read => progress(index, entries.length, { bytesDone: bytesDone + Math.min(entry.size, read), totalBytes }),
          warning => fileWarnings.add(warning))) parser.pushLine(line);
        summary = parser.finish();
        // A reused fingerprint skips the stream entirely. Preserve stream-level
        // precision warnings alongside the statistics that skipped those lines.
        summary.warnings = [...new Set([...(summary.warnings || []), ...fileWarnings])];
        parsedFiles++;
      } catch {
        warnings.add('A log could not be decoded; its last successful cached statistics were retained when available.');
        if (prior?.summary) { summary = prior.summary; nextFiles[key] = prior; }
      }
    }
    if (summary) {
      summaries.push(summary);
      if (!nextFiles[key]) nextFiles[key] = { fingerprint, summary };
    }
    bytesDone += entry.size;
    progress(index + 1, entries.length, { bytesDone, totalBytes });
  }
  const aggregate = aggregateRecords(summaries, timeZone);
  const cache = { parserVersion: PARSER_VERSION, writtenAt: new Date().toISOString(), files: nextFiles };
  const temporary = `${cachePath}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, JSON.stringify(cache));
  await fsp.rename(temporary, cachePath);
  progress(entries.length, entries.length, { bytesDone, totalBytes }, true);
  parentPort.postMessage({ type: 'complete', data: { ...aggregate, sessionFiles: discovered, parsedFiles, scannedAt: cache.writtenAt, timeZone, warnings: [...new Set([...warnings, ...aggregate.warnings])] } });
}

run().catch(() => parentPort.postMessage({ type: 'failure', errorCode: 'SCAN_FAILED' }));
