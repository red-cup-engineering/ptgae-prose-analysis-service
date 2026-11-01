import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePTGAE, protectedPtgaeSpans, summarizeCorpus } from '../src/analyze.mjs';
const rule = (source, id) => analyzePTGAE(source).filter(f => f.ruleId === id);

test('ordinary prose yields stable UTF-16 source spans, including astral prefixes', () => {
  const source = '😀🌋 In order to ship.\nGoing forward, revise.';
  const a = analyzePTGAE(source, {sourceVersion:'v1'});
  assert.deepEqual(a, analyzePTGAE(source,{sourceVersion:'v1'}));
  assert.deepEqual(rule(source,'PTG004')[0].sourceSpan,[5,16]);
  assert.equal(source.slice(...a[0].sourceSpan),a[0].text);
  assert.equal(rule(source,'PTG032')[0].line,2);
  assert.equal(rule(source,'PTG032')[0].column,1);
  assert.equal(a[0].sourceVersion,'v1');
});

test('YAML frontmatter, quotes, blockquotes and fenced code are protected', () => {
  const source=['---','description: In order to ship','---','> Going forward','~~~ts','Going forward','~~~~','"In order to finish"','“Going forward”','In order to publish.'].join('\n');
  assert.equal(rule(source,'PTG004').length,1);
  assert.equal(rule(source,'PTG032').length,0);
  assert.equal(rule(source,'PTG004')[0].line,10);
});

test('lazy blockquote continuation and curly single quoted evidence remain protected', () => {
  const lazy = ['> The witness stated:', 'In order to protect this quotation.', '', 'In order to edit the operative prose.'].join('\n');
  assert.equal(rule(lazy, 'PTG004').length, 1);
  assert.equal(rule(lazy, 'PTG004')[0].line, 4);
  const single = 'The witness stated ‘Going forward and in order to protect evidence’ but going forward we check the source.';
  assert.equal(rule(single, 'PTG004').length, 0);
  assert.equal(rule(single, 'PTG032').length, 1);
  assert.equal(rule("The team's editor works in order to clarify prose.", 'PTG004').length, 1,
    'ordinary apostrophes must not hide editable prose');
});

test('fence termination must agree in marker type and length',()=>{
  const source=['~~~~js','In order to do A','~~~','In order to do B','~~~~','In order to do C'].join('\n');
  assert.equal(rule(source,'PTG004').length,1);
  assert.equal(rule(source,'PTG004')[0].line,6);
});

test('inline code and Markdown destinations protected while visible link labels lint',()=>{
  const source='[In order to](https://example.com/in-order-to) and ``Going forward``; Going forward.';
  assert.equal(rule(source,'PTG004').length,1);
  assert.equal(rule(source,'PTG032').length,1);
});

test('escaped quotes do not terminate a protected quotation early',()=>{
  const source='The vendor said "this is \\"Going forward\\" and In order to proceed." In order to ship.';
  assert.equal(rule(source,'PTG004').length,1);
});

test('unclosed frontmatter and code fences fail closed',()=>{
  assert.equal(analyzePTGAE('---\ndescription: In order to').length,0);
  assert.equal(analyzePTGAE('```\nIn order to').length,0);
  assert.ok(protectedPtgaeSpans('```\nIn order to').length>0);
});

test('conservative Markdown table rows are not rewritten',()=>{
  assert.equal(rule('| field | In order to |\nIn order to finish.','PTG004').length,1);
  assert.equal(rule('Field | In order to finish','PTG004').length,0);
});

test('matches cannot cross a quote or other protected region',()=>{
  assert.equal(rule('She may "this was quoted" potentially agree.','PTG002').length,0);
});

test('unmatched inline delimiters and indented code fail closed',()=>{
  assert.equal(rule('A `In order to finish','PTG004').length,0);
  assert.equal(rule('A "In order to finish','PTG004').length,0);
  assert.equal(rule('[link](In order to finish','PTG004').length,0);
  assert.equal(rule('\tIn order to finish','PTG004').length,0);
});

test('corpus counts file occurrences, not rule repetitions',()=>{
  const findings=analyzePTGAE('In order to, in order to.');
  const summary=summarizeCorpus([{path:'a',findings},{path:'b',findings}]);
  assert.equal(summary[0].fileCount,2);
  assert.equal(summary[0].systemic,true);
});

test('source must be a string; diagnostics do not mutate the input',()=>{
  assert.throws(()=>analyzePTGAE(null),/must be a string/);
  assert.throws(()=>protectedPtgaeSpans(undefined),/must be a string/);
  const original='😀 In order to finish.';
  analyzePTGAE(original);
  assert.equal(original,'😀 In order to finish.');
});
