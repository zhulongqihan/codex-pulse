import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQuotaClient } from '../src/main/quota-service.mjs';

test('Windows cmd wrapper handshake reads only account endpoints and closes its owned helper', { skip: process.platform !== 'win32' }, async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local/tests');
  await fs.mkdir(root, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(root, 'quota with spaces-'));
  let client;
  try {
    const server = `import readline from 'node:readline';\nconst lines=readline.createInterface({input:process.stdin});\nlines.on('line',line=>{const q=JSON.parse(line);if(q.id==null)return;let result;if(q.method==='initialize')result={};else if(q.method==='account/rateLimits/read')result={rateLimits:{planType:'pro',primary:{usedPercent:25,windowDurationMins:10080,resetsAt:1800000000}}};else if(q.method==='account/usage/read')result={summary:{lifetimeTokens:1234},dailyUsageBuckets:[{startDate:'2026-11-06',tokens:99}]};else {process.stdout.write(JSON.stringify({id:q.id,error:{code:-1,message:'Unexpected method'}})+'\\n');return;}process.stdout.write(JSON.stringify({id:q.id,result})+'\\n');});\nlines.on('close',()=>process.exit(0));\n`;
    await fs.writeFile(path.join(temporary, 'server.mjs'), server);
    const wrapper = path.join(temporary, 'codex.cmd');
    await fs.writeFile(wrapper, `@echo off\r\n"${process.execPath}" "%~dp0server.mjs" %*\r\n`);
    client = createQuotaClient({ codexExecutable: wrapper, dataDir: path.join(temporary, 'data'), timeoutMs: 4000 });
    const [first, shared] = await Promise.all([client.read(), client.read()]);
    assert.equal(first.ok, true, first.errorCode);
    assert.deepEqual(first, shared);
    assert.equal(first.quota.remainingPercent, 75);
    assert.equal(first.quota.lifetimeTokens, 1234);
    assert.equal(first.quota.officialDaily[0].totalTokens, 99);
  } finally {
    client?.close();
    if (!path.resolve(temporary).startsWith(root + path.sep)) throw new Error('Unsafe cleanup');
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 6, retryDelay: 60 });
  }
});
