import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findRepeatedPassages } from './ptgae-corpus-scan.mjs';
import { lintPTGAE, summarizeFindings } from './ptgae-lint.mjs';

const ALLOWED = /\.(?:md|mdx|txt|html)$/iu;
const EXCLUDED = new Set([
  'legacy', 'history', 'recovered', 'source-history', 'fixtures', 'fixture',
  'node_modules', 'vendor', 'dist', 'build', 'test', 'tests', 'archives',
  'assets', 'private', 'generated',
]);
const MAX_FILES = 1500;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Eligible current Coesite operating prose. Historic evidence is not a duplicate candidate. */
export function selectActiveOperationsProse(paths) {
  if (!Array.isArray(paths) || paths.some(value => typeof value !== 'string')) {
    throw new TypeError('paths must be an array of strings');
  }
  return [...new Set(paths.filter(p => {
    if (!p || p.startsWith('/') || p.includes('\\') || !ALLOWED.test(p)) return false;
    const parts = p.split('/');
    if (parts.some(part => part === '.' || part === '..' || EXCLUDED.has(part))) return false;
    if (p !== 'README.md' && !['content', 'services'].includes(parts[0])
      && !(parts[0] === 'lib' && parts[1] === 'agency' && parts[2] === 'skills')) return false;
    return true;
  }))].sort((a, b) => a.localeCompare(b));
}

function gitText(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    timeout: 20_000,
  });
}

function safeCandidates(items, limit) {
  return items.slice(0, limit).map(item => ({
    fingerprint: item.fingerprint,
    characters: item.characters,
    words: item.words,
    occurrences: item.occurrences.map(o => ({
      file: o.file, line: o.line,
      ...(Number.isInteger(o.column) ? { column: o.column } : {}),
      revision: o.revision,
    })),
  }));
}

/**
 * Observe the original tracked corpus, using the incumbent PTGAE analyzer.
 * Output is intentionally source-text-free: candidate locations are evidence leads,
 * not sufficient grounds for relocation, deletion or semantic settlement.
 */
export async function reviewOperationsCorpus({
  root, maxFiles = MAX_FILES, maxBytes = MAX_BYTES,
  maxFileBytes = MAX_FILE_BYTES, candidateLimit = 40,
} = {}) {
  if (typeof root !== 'string' || !root || !isAbsolute(root)) {
    throw new TypeError('root must be an absolute existing Git checkout');
  }
  if (![maxFiles, maxBytes, maxFileBytes, candidateLimit].every(n => Number.isSafeInteger(n) && n > 0)) {
    throw new RangeError('limits must be positive safe integers')  const revision = gitText(repository, ['rev-parse', 'HEAD']).trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revision)) throw new Error('unqualified-git-revision');
  const objectFormat = gitText(repository, ['rev-parse', '--show-object-format']).trim();
  if (!['sha1', 'sha256'].includes(objectFormat)) throw new Error('unsupported-git-object-format');

  // Select *HEAD's immutable tree*, not the mutable index. An uncommitted
  // addition is not part of the revision reported to a downstream reader.
  const treeEntries = gitText(repository, ['ls-tree', '-r', '-z', revision]).split('\0').filter(Boolean);
  const atRevision = new Map();
  for (const record of treeEntries) {
    const match = /^(100644|100755|120000|160000) (blob|commit) ([a-f0-9]{40}|[a-f0-9]{64})\t([\s\S]+)$/u.exec(record);
    if (!match) throw new Error('operations-corpus-invalid-git-tree-entry');
    const [, mode, kind, oid, relative] = match;
    atRevision.set(relative, { mode, kind, oid });
  }
  const selected = selectActiveOperationsProse([...atRevision.keys()]);
  if (selected.length > maxFiles) throw new RangeError('operations-corpus-file-limit-exceeded');
'operations-corpus-file-limit-exceeded');
  const documents = [];
  let bytes = 0;
  const style = { filesWithFindings: 0, errors: 0, warnings: 0, information: 0, byCode: {} };
  for (const relative of selected) {
    const absolute = join(repository, ...relative.split('/'));
    if (!absolute.startsWith(repository + sep)) throw new Error('operations-corpus-path-outside-root');
    const entry = atRevision.get(relative);
    if (!entry || entry.kind !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
      throw new Error('operations-corpus-nonregular-tracked-source: ' + relative);
    }
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('operations-corpus-nonregular-tracked-source: ' + relative);
    if (stat.size > maxFileBytes || bytes + stat.size > maxBytes) {
      throw new RangeError('operations-corpus-byte-limit-exceeded');
    }
    const sourceBytes = await readFile(absolute);
    if (sourceBytes.length > maxFileBytes || bytes + sourceBytes.length > maxBytes) {
      throw new RangeError('operations-corpus-byte-limit-exceeded');
    }
    // Git's canonical blob identity binds the actual bytes observed to HEAD.
    // This refuses unstaged, staged or race-time edits instead of mislabeling
    // worktree text as immutable source from the current commit.
    const receivedOid = createHash(objectFormat)
      .update('blob ' + sourceBytes.length + '\0').update(sourceBytes).digest('hex');
    if (receivedOid !== entry.oid) {
      throw new Error('operations-corpus-source-revision-mismatch: ' + relative);
    }
    const source = sourceBytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(sourceBytes)) {
      throw new Error('operations-corpus-source-invalid-utf8: ' + relative);
    }
    bytes += sourceBytes.length;
    documents.push({ file: relative, source, revision });
    const result = summarizeFindings(lintPTGAE(source));
    if (result.total) style.filesWithFindings++;
    style.errors += result.error;
    style.warnings += result.warning;
    style.information += result.info;
    for (const [code, count] of Object.entries(result.byCode)) style.byCode[code] = (style.byCode[code] ?? 0) + count;
  }
  const options = { limit: 10_000 };
  const passages = findRepeatedPassages(documents, options);
  const sentences = findRepeatedPassages(documents, {
    unit: 'sentence', includeWithinFile: true, minimumWords: 16,
    minimumCharacters: 100, limit: 10_000,
  });
  return Object.freeze({
    type: 'ptgae.operations-corpus-reading/v1',
    sourceRevision: revision,
    admission: 'active-tracked-source-only',
    files: documents.length, bytes,
    style: Object.freeze(style),
    repetition: Object.freeze({
      repeatedParagraphCandidates: passages.length,
      repeatedSentenceCandidates: sentences.length,
      bounded: passages.length === 10_000 || sentences.length === 10_000,
      paragraphs: safeCandidates(passages, candidateLimit),
      sentences: safeCandidates(sentences, candidateLimit),
    }),
    claimsOfAuthority: 'none; read-only candidates, no semantic equivalence or deletion grant',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const reading = await reviewOperationsCorpus({ root: resolve(process.argv[2] ?? '.') });
    process.stdout.write(JSON.stringify(reading, null, 2) + '\n');
  } catch (error) {
    process.stderr.write('operations-corpus-review-refused: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
