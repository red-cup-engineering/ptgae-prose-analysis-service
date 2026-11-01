import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { protectedPtgaeSpans } from './analyze.mjs';
import { lintPTGAE, summarizeFindings } from './ptgae-lint.mjs';

const DEFAULT_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.html']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.next']);

async function collect(target, files) {
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink()) return;
  if (stat.isFile()) {
    if (DEFAULT_EXTENSIONS.has(path.extname(target).toLowerCase())) files.push(target);
    return;
  }
  if (!stat.isDirectory() || SKIP_DIRS.has(path.basename(target))) return;
  const entries = await fs.readdir(target, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    await collect(path.join(target, entry.name), files);
  }
}

function sourceLocation(source, index) {
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  const lastNewline = before.lastIndexOf('\n');
  return { line, column: index - lastNewline };
}

export async function verifyLiteralOccurrences(targets, literals) {
  const files = [];
  for (const target of targets) await collect(target, files);
  files.sort();
  const occurrences = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    for (const literal of literals) {
      if (!literal) continue;
      let from = 0;
      while (from <= source.length) {
        const index = source.indexOf(literal, from);
        if (index === -1) break;
        const at = sourceLocation(source, index);
        occurrences.push({ file, literal, line: at.line, column: at.column });
        from = index + Math.max(1, literal.length);
      }
    }
  }
  return occurrences;
}

export async function scanPTGAE(targets) {
  const files = [];
  for (const target of targets) await collect(target, files);
  files.sort();
  const results = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const findings = lintPTGAE(source);
    if (!findings.length) continue;
    results.push({ file, summary: summarizeFindings(findings), findings });
  }
  return results;
}

export function summarizeScan(results) {
  const summary = {
    files: results.length,
    error: 0,
    warning: 0,
    info: 0,
    findings: 0,
    byCode: {},
    filesByCode: {},
    systemic: []
  };
  const filesByCode = new Map();

  for (const result of results) {
    summary.error += result.summary.error;
    summary.warning += result.summary.warning;
    summary.info += result.summary.info;
    summary.findings += result.summary.total;

    for (const [code, count] of Object.entries(result.summary.byCode)) {
      summary.byCode[code] = (summary.byCode[code] ?? 0) + count;
      const files = filesByCode.get(code) ?? [];
      files.push(result.file);
      filesByCode.set(code, files);
    }
  }

  for (const [code, files] of [...filesByCode.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    summary.filesByCode[code] = files;
  }

  summary.systemic = [...filesByCode.entries()]
    .filter(([, files]) => files.length >= 2)
    .map(([code, files]) => ({
      code,
      files: files.length,
      findings: summary.byCode[code] ?? 0,
      paths: files
    }))
    .sort((a, b) => b.files - a.files || b.findings - a.findings || a.code.localeCompare(b.code));

  return summary;
}


/** Exact repeated prose candidates, not a semantic equivalence or deletion verdict. */
export function findRepeatedPassages(documents, { minimumWords = 20, minimumCharacters = 120, limit = 100, unit = 'paragraph', includeWithinFile = false } = {}) {
  if (!Array.isArray(documents)) throw new TypeError('documents must be an array');
  if (![minimumWords, minimumCharacters, limit].every(n => Number.isSafeInteger(n) && n > 0)) {
    throw new RangeError('thresholds and limit must be positive integers');
  }
  if (!['paragraph', 'sentence'].includes(unit) || typeof includeWithinFile !== 'boolean') {
    throw new TypeError('unit must be paragraph or sentence, and includeWithinFile must be boolean');
  }
  const candidates = new Map(), files = new Set();
  for (const document of documents) {
    const { file, source, revision = null } = document ?? {};
    if (typeof file !== 'string' || !file || typeof source !== 'string' || files.has(file)) {
      throw new TypeError('each document must have a unique file and source text');
    }
    files.add(file);
    const protectedRanges = protectedPtgaeSpans(source);
    const lines = source.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
    let offset = 0, lineNumber = 1, start = 0, firstLine = 1, paragraph = [];
    const finish = () => {
      if (!paragraph.length) return;
      const raw = paragraph.join('');
      paragraph = [];
      const protectedCount = protectedRanges.reduce((n, [lo, hi]) =>
        n + Math.max(0, Math.min(hi, start + raw.length) - Math.max(lo, start)), 0);
      // Do not call a passage an ordinary prose duplicate if any part
      // is authored source evidence: metadata, quoted text, code or a link
      // destination. An incomplete safe comparison is better than merging
      // distinct custody because only most of a paragraph was protected.
      if (protectedCount > 0) return;
      // Sentence review uses the same protected paragraph boundary and source
      // coordinates as exact-passage review. Split only at terminal punctuation
      // followed by whitespace/end; these are candidates, not semantic claims.
      const units = unit === 'sentence'
        ? [...raw.matchAll(/[^\s.!?][^.!?]*(?:[.!?]+(?=\s|$)|$)/gu)]
        : [{ 0: raw, index: 0 }];
      for (const part of units) {
        const original = part[0];
        // Bare network references are not ordinary prose, and punctuation
        // inside them is not a reliable sentence boundary.
        if (unit === 'sentence' && /(?:https?:\/\/|www\.)/iu.test(original)) continue;
        const normalized = original.replace(/\s+/gu, ' ').trim();
        const words = normalized.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
        if (normalized.length < minimumCharacters || words < minimumWords) continue;
        const item = candidates.get(normalized) ?? { words, characters: normalized.length, occurrences: [] };
        const at = unit === 'sentence' ? sourceLocation(source, start + part.index) : { line: firstLine };
        item.occurrences.push({ file, line: at.line, ...(unit === 'sentence' ? { column: at.column } : {}), revision });
        candidates.set(normalized, item);
      }
    };
    for (const line of lines) {
      if (!line.trim() || /^ {0,3}#{1,6}\s/u.test(line)) finish();
      else {
        if (!paragraph.length) { start = offset; firstLine = lineNumber; }
        paragraph.push(line);
      }
      offset += line.length;
      lineNumber++;
    }
    finish();
  }
  return [...candidates.entries()]
    .filter(([, item]) => item.occurrences.length > 1 && (includeWithinFile || new Set(item.occurrences.map(o => o.file)).size > 1))
    .map(([normalized, item]) => ({
      ...(unit === 'sentence' ? { unit } : {}),
      fingerprint: createHash('sha256').update(normalized).digest('hex'),
      words: item.words,
      characters: item.characters,
      occurrences: item.occurrences.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    }))
    .sort((a, b) => b.characters * (b.occurrences.length - 1) - a.characters * (a.occurrences.length - 1)
      || a.fingerprint.localeCompare(b.fingerprint))
    .slice(0, limit);
}

/** Uses the original corpus file admission; never follows symlinks or edits text. */
export async function scanRepeatedPassages(targets, options) {
  const paths = [];
  for (const target of targets) await collect(target, paths);
  const documents = [];
  for (const file of [...new Set(paths)].sort()) documents.push({ file, source: await fs.readFile(file, 'utf8') });
  return findRepeatedPassages(documents, options);
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const failOnWarning = args.includes('--fail-on-warning');
  const sentenceAudit = args.includes('--repeated-sentences');
  const includeWithinFile = args.includes('--within-file');
  const repeatAudit = args.includes('--repeated-passages');
  if (includeWithinFile && !sentenceAudit) {
    console.error('--within-file requires --repeated-sentences');
    process.exit(2);
  }
  const literals = args
    .filter(arg => arg.startsWith('--literal='))
    .map(arg => arg.slice('--literal='.length))
    .filter(Boolean);
  const targets = args.filter(arg => !arg.startsWith('--'));
  if (!targets.length) {
    console.error('usage: node ptgae-corpus-scan.mjs [--json] [--fail-on-warning] [--repeated-passages] [--repeated-sentences] [--within-file] [--literal=TEXT] PATH [...]');
    process.exit(2);
  }

  const results = await scanPTGAE(targets);
  const summary = summarizeScan(results);
  const repeatedPassages = repeatAudit ? await scanRepeatedPassages(targets) : [];
  const repeatedSentences = sentenceAudit ? await scanRepeatedPassages(targets, {
    unit: 'sentence', minimumWords: 16, minimumCharacters: 100, includeWithinFile,
  }) : [];
  const literalOccurrences = literals.length
    ? await verifyLiteralOccurrences(targets, literals)
    : [];

  if (json) {
    console.log(JSON.stringify({ summary, repeatedPassages, repeatedSentences, literalOccurrences, results }, null, 2));
  } else {
    for (const result of results) {
      for (const finding of result.findings) {
        console.log(result.file + ':' + finding.line + ':' + finding.column + ' ' + finding.code + ' ' + finding.severity + ' ' + finding.message);
      }
    }
    for (const passage of repeatedPassages) {
      for (const occurrence of passage.occurrences) console.log(occurrence.file + ':' + occurrence.line + ' REPEATED-PASSAGE-CANDIDATE sha256=' + passage.fingerprint);
    }
    for (const sentence of repeatedSentences) {
      for (const occurrence of sentence.occurrences) console.log(occurrence.file + ':' + occurrence.line + ':' + occurrence.column + ' REPEATED-SENTENCE-CANDIDATE sha256=' + sentence.fingerprint);
    }
    for (const occurrence of literalOccurrences) {
      console.log(occurrence.file + ':' + occurrence.line + ':' + occurrence.column + ' LITERAL ' + JSON.stringify(occurrence.literal));
    }
    console.log(JSON.stringify(summary));
  }

  if (summary.error > 0 || (failOnWarning && summary.warning > 0)) process.exitCode = 1;
}
