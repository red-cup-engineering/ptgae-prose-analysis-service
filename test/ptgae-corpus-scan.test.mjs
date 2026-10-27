import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanPTGAE, summarizeScan, verifyLiteralOccurrences } from '../src/ptgae-corpus-scan.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ptgae-scan-'));
try {
  await fs.mkdir(path.join(root, 'docs'));
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.writeFile(path.join(root, 'docs', 'clean.md'), 'The parser preserves provenance.\n');
  await fs.writeFile(path.join(root, 'docs', 'poison.md'), 'The Music Services Section maintains knowledge and practices for this service domain.\n');
  await fs.writeFile(path.join(root, 'docs', 'poison-2.md'), 'The Pedagogy Services Section maintains knowledge and practices for this service domain.\n');
  await fs.writeFile(path.join(root, 'docs', 'study.md'), 'The Sociology Services Section maintains knowledge and practices for the study of social structure.\n');
  await fs.writeFile(path.join(root, 'node_modules', 'ignored.md'), 'It is important to note that this file must be ignored.\n');
  await fs.writeFile(path.join(root, 'docs', 'ignored.js'), 'It is important to note that this extension must be ignored.\n');

  let symlinkCreated = false;
  try {
    await fs.symlink(path.join(root, 'docs', 'poison.md'), path.join(root, 'docs', 'linked-poison.md'));
    symlinkCreated = true;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) throw error;
  }

  const results = await scanPTGAE([root]);
  assert.deepEqual(results.map(x => path.basename(x.file)), ['poison-2.md', 'poison.md', 'study.md']);
  const summary = summarizeScan(results);
  assert.equal(summary.files, 3);
  assert.equal(summary.error, 3);
  assert.equal(summary.findings, 3);
  assert.equal(summary.byCode.PTG013, 2);
  assert.equal(summary.byCode.PTG041, 1);
  assert.deepEqual(summary.filesByCode.PTG013.map(x => path.basename(x)), ['poison-2.md', 'poison.md']);
  assert.deepEqual(summary.systemic.map(x => x.code), ['PTG013']);
  assert.equal(summary.systemic[0].files, 2);
  assert.equal(summary.systemic[0].findings, 2);
  if (symlinkCreated) assert.ok(!results.some(x => path.basename(x.file) === 'linked-poison.md'));

  await fs.writeFile(path.join(root, 'docs', 'literal.md'), 'The change may potentially matter.\nThe change may potentially recur.\n');
  await fs.writeFile(path.join(root, 'docs', 'near.md'), 'The change may matter.\n');
  const literals = await verifyLiteralOccurrences([root], ['may potentially', 'in an effort to']);
  assert.equal(literals.length, 2, 'exact literal verification must not inherit fuzzy search candidates');
  assert.ok(literals.every(x => path.basename(x.file) === 'literal.md'));
  assert.ok(literals.every(x => x.literal === 'may potentially'));
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log('ok corpus scanner finds text defects, identifies systemic recurrence, and skips excluded sources and symlinks');
console.log('ok corpus scanner finds text defects, verifies exact literals, and skips excluded sources and symlinks');
