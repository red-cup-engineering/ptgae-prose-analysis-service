import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { reviewOperationsCorpus, selectActiveOperationsProse } from '../src/review-operations-corpus.mjs';

const shared = 'The receiving officer must preserve the original Work identity and inspect the authoritative source revision before treating a delivery as accepted by the independent beneficiary.';

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}
async function put(root, relative, source) {
  const dest = join(root, ...relative.split('/'));
  await mkdir(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
  await writeFile(dest, source, 'utf8');
}

test('selects original active prose, not legacy/custody/fixture mirrors', () => {
  assert.deepEqual(selectActiveOperationsProse([
    'README.md', 'README.md',
    'lib/agency/skills/alpha/SKILL.md',
    'services/research/README.md',
    'content/terms/example.md',
    'services/research/lib/legacy/original.md',
    'services/research/data/source-history/old.md',
    'content/text/documents/articles/notes/history/snapshot.md',
    'lib/legacy/main.md', 'services/secret/private/customer.md',
    'services/reader.md/../../../etc/passwd.md',
    'services/link.md', 'src/program.mjs',
  ]), [
    'README.md',
    'content/terms/example.md',
    'lib/agency/skills/alpha/SKILL.md',
    'services/link.md',
    'services/research/README.md',
  ]);
  assert.throws(() => selectActiveOperationsProse(['one.md', null]), TypeError);
});

test('produces source-bound private-text-free repetition candidates from a real tracked Operations corpus', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ptgae-operations-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'PTGAE test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  await put(root, 'README.md', '# Operations\n\nThe original references belong to their owner.\n');
  await put(root, 'lib/agency/skills/intake/SKILL.md', '# Intake\n\n' + shared + '\n\n' + shared + '\n');
  await put(root, 'services/research/README.md', '# Research\n\nA separate premise matters. ' + shared + '\n');
  await put(root, 'lib/legacy/duplicate.md', shared + '\n');
  await put(root, 'services/research/data/source-history/duplicate.md', shared + '\n');
  await put(root, 'content/text/documents/articles/notes/history/duplicate.md', shared + '\n');
  await put(root, 'content/quotes.md', '> ' + shared + '\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'freeze source');
  const result = await reviewOperationsCorpus({ root });
  assert.equal(result.type, 'ptgae.operations-corpus-reading/v1');
  assert.match(result.sourceRevision, /^[a-f0-9]{40}$/u);
  assert.equal(result.files, 4);
  assert.equal(result.repetition.repeatedParagraphCandidates, 0);
  assert.equal(result.repetition.repeatedSentenceCandidates, 1);
  assert.deepEqual(result.repetition.sentences[0].occurrences.map(o => [o.file, o.line]), [
    ['lib/agency/skills/intake/SKILL.md', 3],
    ['lib/agency/skills/intake/SKILL.md', 5],
    ['services/research/README.md', 3],
  ]);
  assert.equal(result.repetition.bounded, false);
  assert.ok(result.bytes > 100);
  assert.equal(result.admission, 'active-tracked-source-only');
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(shared), 'the output must not expose source or protected testimony');
  assert.ok(!serialized.includes('lib/legacy'));
  assert.ok(!serialized.includes('source-history'));
  await assert.rejects(reviewOperationsCorpus({ root, maxFiles: 2 }), /file-limit-exceeded/u);
  await assert.rejects(reviewOperationsCorpus({ root, maxBytes: 100 }), /byte-limit-exceeded/u);
  await assert.rejects(reviewOperationsCorpus({ root: '.' }), /absolute existing Git checkout/u);
});

test('a tracked symlink refuses the source survey rather than treating outside bytes as admitted', async t => {
  const root = await mkdtemp(join(tmpdir(), 'ptgae-operations-links-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'PTGAE test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  await put(root, 'README.md', '# Operations\n');
  await mkdir(join(root, 'services'), { recursive: true });
  await symlink(join(root, 'README.md'), join(root, 'services', 'linked.md'));
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'freeze symlink');
  await assert.rejects(reviewOperationsCorpus({ root }), /nonregular-tracked-source/u);
});
