import assert from 'node:assert/strict';
import { CLAIM_STATUS, lintPTGAE, summarizeFindings } from '../src/ptgae-lint.mjs';

const poison = [
  ['PTG001', 'It is important to note that the parser preserves provenance.'],
  ['PTG001', 'It is worth noting that the parser preserves provenance.'],
  ['PTG001', 'It should be noted that the API is internal.'],
  ['PTG001', 'It is worth mentioning that the cache is stale.'],
  ['PTG002', 'The change may potentially affect the parser.'],
  ['PTG002', 'The change could possibly affect the parser.'],
  ['PTG003', 'One possible approach could be a typed event log.'],
  ['PTG004', 'We parse the record in order to preserve provenance.'],
  ['PTG005', 'This module serves as the parser.'],
  ['PTG006', 'This represents a significant improvement.'],
  ['PTG007', 'This does not necessarily mean the record is valid.'],
  ['PTG008', 'While this has not been conclusively demonstrated, the model predicts X.'],
  ['PTG009', 'It is possible that the cache is stale.'],
  ['PTG010', 'The build failed due to the fact that the lockfile changed.'],
  ['PTG011', 'The parser has the ability to preserve provenance.'],
  ['PTG012', 'There are a number of reasons for the failure.'],
  ['PTG013', 'The Music Services Section maintains knowledge and practices for this service domain.'],
  ['PTG014', "In today's rapidly evolving market, teams need better tooling."],
  ['PTG015', 'The ever-evolving landscape requires adaptability.'],
  ['PTG016', 'Teams navigate the complexities of compliance.'],
  ['PTG017', 'Metadata plays a crucial role in provenance.'],
  ['PTG018', 'The release is a testament to our collaboration.'],
  ['PTG019', 'This tool unlocks the full potential of automation.'],
  ['PTG020', 'We use a holistic approach to governance.'],
  ['PTG021', 'This architecture is a paradigm shift.'],
  ['PTG022', 'The incident underscores the importance of backups.'],
  ['PTG023', 'It is crucial to validate the input.'],
  ['PTG024', 'The importance of provenance cannot be overstated.'],
  ['PTG025', 'In light of the fact that the source changed, we rebuilt the index.'],
  ['PTG026', 'With regard to caching, the client stores one copy.'],
  ['PTG027', 'The system supports a wide range of formats.'],
  ['PTG028', 'The API provides seamless integration with the client.'],
  ['PTG029', 'We built a robust and scalable service.'],
  ['PTG030', 'The policy fosters a culture of accountability.'],
  ['PTG031', 'As we move forward, we will improve the parser.'],
  ['PTG032', 'Going forward, all files will use UTF-8.'],
  ['PTG033', 'At the end of the day, the cache must be correct.'],
  ['PTG034', 'When it comes to provenance, hashes matter.'],
  ['PTG035', 'Needless to say, tests are important.'],
  ['PTG036', 'Further research is needed.'],
  ['PTG037', 'It remains to be seen whether the cache is stable.'],
  ['PTG038', 'At its core, the service is a parser.'],
  ['PTG039', 'In conclusion, the parser is correct.'],
  ['PTG040', 'This demonstrates the importance of typed receipts.'],
  ['PTG041', 'The Sociology Services Section maintains knowledge and practices for the study of social structure.'],
  ['PTG042', 'This section holds shared knowledge and services concerning Tai Chi.'],
  ['PTG043', 'This is the home for OECD FORD 5.3, education research.']
];

for (const [code, source] of poison) {
  assert.ok(lintPTGAE(source).some(f => f.code === code), `${code} did not match: ${source}`);
}

const clean = [
  'The parser preserves provenance.',
  'Hypothesis: information precedes quantum structure.',
  'Model prediction: X.',
  'We propose a typed event log.',
  'Measured on 2026-10-06: 14.2 GB free.',
  'The cache may be stale.',
  'The API is internal.',
  'We cannot establish the value from the available telemetry.',
  'The section description is incomplete.',
  'The repository is the canonical home of the signed corpus.',
  'Backups prevent data loss after disk failure.',
  'The client supports Markdown, JSON, and YAML.',
  'Required: validate the input before admission.',
  'Unknown: the provider does not expose remaining quota.',
  '`It is important to note` is a banned throat-clearing phrase.',
  '```\nIt is important to note that this example is intentionally bad.\n```',
  '> It is important to note that this is quoted source text.',
  '   > The source may potentially describe an obsolete behavior.',
  'The source says "it is important to note that this example is intentionally bad."',
  'The source says “the change may potentially affect the parser.”',
  '> Source states:\nThe change may potentially matter.',
  '   > Source states:\nThe change could possibly matter.\n>\n> Another quoted paragraph might perhaps matter.',
  '🔬 Source evidence:\n> Source states:\nThe change may potentially matter.'
];

for (const source of clean) {
  assert.deepEqual(lintPTGAE(source), [], `clean fixture was flagged: ${source}`);
}

// A reviewer must not edit documented source evidence as ordinary prose.
for (const preserved of [
  '---\ndescription: Going forward, the edition says in order to do this.\n---\nThe parser preserves provenance.',
  '[Release](https://example.org/going-forward/in-order-to) is a supported destination.',
  'The witness stated ‘Going forward in order to preserve the source.’',
  '> The testimony says:\nGoing forward, use the source as received.',
  '~~~~md\nGoing forward, preserve the code.\n~~~\nIn order to preserve the code.\n~~~~',
]) {
  assert.deepEqual(lintPTGAE(preserved), [], 'quoted, linked, metadata and fenced evidence are protected');
}
const postQuote = lintPTGAE('> The testimony says:\nGoing forward, use the old source.\n\nGoing forward, edit the live prose.');
assert.equal(postQuote.length, 1);
assert.equal(postQuote[0].line, 4);
assert.equal(postQuote[0].code, 'PTG032');
assert.equal(lintPTGAE("The team's editor works in order to clarify prose.").length, 1,
  'ordinary apostrophes do not hide editorial prose');

const interruptedQuote = lintPTGAE('> Going forward was in the testimony.\n# A new method\nGoing forward, fix the operative instruction.');
assert.deepEqual(interruptedQuote.filter(f => f.code === 'PTG032').map(f => f.line), [3],
  'the shared source-protection reader must expose editorial prose after a heading');
const listAfterQuote = lintPTGAE('> Going forward was quoted.\n- New work item\nGoing forward, revise the live method.');
assert.deepEqual(listAfterQuote.filter(f => f.code === 'PTG032').map(f => f.line), [3]);

// After a blank quote marker, unmarked prose is a new ordinary paragraph.
// This is not a lazy continuation of source testimony under CommonMark.
const detachedAfterEmptyQuote = lintPTGAE('> Source testimony.\n>\nGoing forward, the editor must revise this method.');
assert.deepEqual(detachedAfterEmptyQuote.filter(f => f.code === 'PTG032').map(f => f.line), [3]);

const quotedMixed = lintPTGAE('The change may potentially matter; the source says "it may potentially matter."');
assert.equal(quotedMixed.length, 1);
assert.equal(quotedMixed[0].code, 'PTG002');
assert.equal(quotedMixed[0].text.toLowerCase(), 'may potentially');

const quotedMixedCurly = lintPTGAE('The change could possibly matter; the source says “it could possibly matter.”');
assert.equal(quotedMixedCurly.length, 1);
assert.equal(quotedMixedCurly[0].code, 'PTG002');
assert.equal(quotedMixedCurly[0].text.toLowerCase(), 'could possibly');

const afterQuote = lintPTGAE('🔬 Source evidence:\n> Source states:\nThe change may potentially matter.\n\nOur change could possibly help.');
assert.equal(afterQuote.length, 1);
assert.equal(afterQuote[0].code, 'PTG002');
assert.equal(afterQuote[0].line, 5);
assert.equal(afterQuote[0].column, 12);

const summary = summarizeFindings(lintPTGAE(poison.map(x => x[1]).join('\n')));
assert.equal(summary.total, poison.length);
assert.equal(summary.error, 3);
assert.ok(summary.warning > 30);
assert.ok(summary.info >= 4);
assert.equal(summary.byCode.PTG013, 1);
assert.equal(summary.byCode.PTG041, 1);
assert.equal(summary.byCode.PTG042, 1);
assert.equal(summary.byCode.PTG043, 1);

for (const status of [
  'Observed', 'Measured', 'Inferred', 'Hypothesis', 'Model', 'Proposed',
  'Required', 'Intended', 'Simulated', 'Unverified', 'Disputed',
  'Deprecated', 'Unknown'
]) {
  assert.ok(CLAIM_STATUS.has(status), `missing claim status ${status}`);
}

console.log(`ok ${poison.length} poison fixtures; ${clean.length} clean fixtures`);
