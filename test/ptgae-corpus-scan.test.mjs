import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanPTGAE, summarizeScan, verifyLiteralOccurrences, findRepeatedPassages, scanRepeatedPassages } from '../src/ptgae-corpus-scan.mjs';

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

  const passage = 'The original evidence must remain available to its actual recipient until the receiving office verifies the current source and independently accepts the exact claim with its source revision.';
  const repeated = findRepeatedPassages([
    { file: 'north.md', revision: 'a1', source: '# Heading\n\n' + passage + '\n\n' + passage },
    { file: 'south.md', revision: 'b2', source: '---\ntitle: South\n---\n\n' + passage.replace('available to', 'available  to') },
    { file: 'different.md', source: passage.replace('must remain', 'must not remain') },
  ]);
  assert.equal(repeated.length, 1, 'whitespace-only variants are source candidates');
  assert.equal(repeated[0].occurrences.length, 3);
  assert.deepEqual([...new Set(repeated[0].occurrences.map(o => o.file))], ['north.md', 'south.md']);
  assert.deepEqual(repeated[0].occurrences.filter(o => o.file === 'north.md').map(o => o.line), [3, 5]);
  assert.equal(repeated[0].occurrences[2].revision, 'b2');
  assert.match(repeated[0].fingerprint, /^[0-9a-f]{64}$/u);

  // The same original parser can surface exact repeated long sentences even
  // when paragraphs have different, separately valuable surrounding claims.
  const sharedSentence = 'The receiving officer must compare the exact original source revision against the actual installed consumer and independently read the beneficiary result before closing the existing Work.';
  const sentences = findRepeatedPassages([
    { file: 'alpha.md', revision: 'a1', source: 'A different introduction comes first. ' + sharedSentence + '\n\nUnique conclusion follows.' },
    { file: 'beta.md', revision: 'b2', source: 'This paragraph has its own introductory context.\n' + sharedSentence + ' Another independent observation follows.' },
    { file: 'gamma.md', revision: 'c3', source: sharedSentence.replace('must compare', 'must not compare') },
  ], { unit: 'sentence', minimumWords: 16, minimumCharacters: 100 });
  assert.equal(sentences.length, 1);
  assert.equal(sentences[0].unit, 'sentence');
  assert.deepEqual(sentences[0].occurrences.map(o => [o.file, o.line]), [['alpha.md', 1], ['beta.md', 2]]);
  assert.equal(sentences[0].occurrences[0].revision, 'a1');
  assert.ok(sentences[0].occurrences[0].column > 1);
  assert.match(sentences[0].fingerprint, /^[0-9a-f]{64}$/u);

  assert.deepEqual(findRepeatedPassages([{ file: 'within.md', source: sharedSentence + '\n\n' + sharedSentence }],
    { unit: 'sentence', minimumWords: 16, minimumCharacters: 100 }), []);
  const within = findRepeatedPassages([{ file: 'within.md', source: sharedSentence + '\n\n' + sharedSentence }],
    { unit: 'sentence', minimumWords: 16, minimumCharacters: 100, includeWithinFile: true });
  assert.equal(within.length, 1);
  assert.deepEqual(within[0].occurrences.map(o => o.line), [1, 3]);

  assert.deepEqual(findRepeatedPassages([
    { file: 'quoted-a.md', source: '> ' + sharedSentence },
    { file: 'quoted-b.md', source: '> ' + sharedSentence },
  ], { unit: 'sentence', minimumWords: 16, minimumCharacters: 100 }), []);
  assert.deepEqual(findRepeatedPassages([
    { file: 'meta-a.md', source: '---\ndescription: ' + sharedSentence + '\n---' },
    { file: 'meta-b.md', source: '---\ndescription: ' + sharedSentence + '\n---' },
  ], { unit: 'sentence', minimumWords: 16, minimumCharacters: 100 }), []);
  assert.deepEqual(findRepeatedPassages([
    { file: 'link-a.md', source: '[Evidence](https://example.org/item) and ' + sharedSentence },
    { file: 'link-b.md', source: '[Evidence](https://example.org/item) and ' + sharedSentence },
  ], { unit: 'sentence', minimumWords: 16, minimumCharacters: 100 }), []);
  assert.throws(() => findRepeatedPassages([], { unit: 'word' }), TypeError);
  assert.throws(() => findRepeatedPassages([], { includeWithinFile: 'yes' }), TypeError);

  const unquotedSentence = 'The current operations reader shall preserve the exact original Work and read the independent recipient acceptance before any obsolete prose is retired.';
  const afterQuote = findRepeatedPassages([
    { file: 'operations.md', source: '> Quoted source testimony.\n# Current rule\n' + unquotedSentence },
    { file: 'editor.md', source: '## Current editorial instruction\n' + unquotedSentence },
  ], { unit: 'sentence', minimumWords: 16, minimumCharacters: 100 });
  assert.equal(afterQuote.length, 1,
    'a genuine repeated sentence after a quote-ending heading must remain discoverable');
  assert.deepEqual(afterQuote[0].occurrences.map(o => [o.file, o.line]),
    [['editor.md', 2], ['operations.md', 3]]);

  assert.deepEqual(findRepeatedPassages([{ file: 'one.md', source: passage + '\n\n' + passage }]), [],
    'repetition within one file is not cross-file duplication');
  assert.deepEqual(findRepeatedPassages([
    { file: 'a.md', source: '~~~txt\n' + passage + '\n~~~' },
    { file: 'b.md', source: '~~~txt\n' + passage + '\n~~~' },
  ]), [], 'fenced source is protected from prose duplicate candidates');
  assert.deepEqual(findRepeatedPassages([
    { file: 'a.md', source: '---\ndescription: ' + passage + '\n---' },
    { file: 'b.md', source: '---\ndescription: ' + passage + '\n---' },
  ]), [], 'frontmatter is protected from prose duplication');
  assert.deepEqual(findRepeatedPassages([
    { file: 'a.md', source: passage },
    { file: 'b.md', source: passage.replace('must remain', 'must not remain') },
  ]), [], 'opposite claims must not be normalized together');
  assert.deepEqual(findRepeatedPassages([
    { file: 'a.md', source: passage },
    { file: 'b.md', source: passage },
  ], { minimumWords: 500 }), []);
  assert.throws(() => findRepeatedPassages([{ file: 'a.md', source: passage }, { file: 'a.md', source: passage }]), TypeError);
  assert.throws(() => findRepeatedPassages([], { limit: 0 }), RangeError);

  await fs.writeFile(path.join(root, 'docs', 'repeat-a.md'), passage);
  await fs.writeFile(path.join(root, 'docs', 'repeat-b.md'), passage);
  const onDisk = await scanRepeatedPassages([root]);
  assert.equal(onDisk.length, 1);
  assert.deepEqual(onDisk[0].occurrences.map(o => path.basename(o.file)), ['repeat-a.md', 'repeat-b.md']);
  if (symlinkCreated) assert.ok(!onDisk[0].occurrences.some(o => o.file.includes('linked-poison')));

  // Protected content is not ordinary prose just because it is less than
  // 80 percent of a long paragraph. Never emit a custody-sensitive match.
  for (const decorated of [
    'The witness wrote "original testimony" and ' + passage,
    'The witness wrote ‘original testimony’ and ' + passage,
    '> The witness supplied:\n' + passage,
    'The evidence is [held](https://example.org/record) and ' + passage,
    'The command `preserve-source` is required and ' + passage,
    '> The original says: ' + passage,
  ]) {
    assert.deepEqual(findRepeatedPassages([
      { file: 'protected-a.md', source: decorated },
      { file: 'protected-b.md', source: decorated },
    ]), [], 'protected Markdown must not become a repeat candidate');
  }
  assert.deepEqual(findRepeatedPassages([
    { file: 'a.md', source: '~~~text\nsource literal\n~~~\n' + passage },
    { file: 'b.md', source: '~~~text\nsource literal\n~~~\n' + passage },
  ]), [], 'mixed fenced and prose region must not become a candidate');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log('ok corpus scanner finds text defects, identifies systemic recurrence, and skips excluded sources and symlinks');
console.log('ok corpus scanner finds text defects, verifies exact literals, and skips excluded sources and symlinks');
