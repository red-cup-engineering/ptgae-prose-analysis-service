import fs from 'node:fs/promises';
import path from 'node:path';
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

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const failOnWarning = args.includes('--fail-on-warning');
  const literals = args
    .filter(arg => arg.startsWith('--literal='))
    .map(arg => arg.slice('--literal='.length))
    .filter(Boolean);
  const targets = args.filter(arg => !arg.startsWith('--'));
  if (!targets.length) {
    console.error('usage: node ptgae-corpus-scan.mjs [--json] [--fail-on-warning] [--literal=TEXT] PATH [...]');
    process.exit(2);
  }

  const results = await scanPTGAE(targets);
  const summary = summarizeScan(results);
  const literalOccurrences = literals.length
    ? await verifyLiteralOccurrences(targets, literals)
    : [];

  if (json) {
    console.log(JSON.stringify({ summary, literalOccurrences, results }, null, 2));
  } else {
    for (const result of results) {
      for (const finding of result.findings) {
        console.log(result.file + ':' + finding.line + ':' + finding.column + ' ' + finding.code + ' ' + finding.severity + ' ' + finding.message);
      }
    }
    for (const occurrence of literalOccurrences) {
      console.log(occurrence.file + ':' + occurrence.line + ':' + occurrence.column + ' LITERAL ' + JSON.stringify(occurrence.literal));
    }
    console.log(JSON.stringify(summary));
  }

  if (summary.error > 0 || (failOnWarning && summary.warning > 0)) process.exitCode = 1;
}
