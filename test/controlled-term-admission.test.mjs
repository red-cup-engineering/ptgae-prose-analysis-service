import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {auditCanonicalTerms} from "../src/controlled-term-admission.mjs";
import {termCliArgs, canonicalTermCorpusAudit} from "../../../src/canonical-term-check-cli.mjs";
import {mkdtempSync, writeFileSync, mkdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

const profile={
  kind:"ptgae.canonical-term-admission/v1",id:"test-policy",canonicalTerms:[
    {id:"WIT",source:"https://example.edu/wit",collisionForms:["wit","witnessing","witness"],
      admissibleSorts:[{id:"four-cover",required:["cellRef","fromCharge","toCharge","evidenceRef"]}]},
    {id:"ATT",source:"https://example.edu/att",collisionForms:["att","attention"],
      admissibleSorts:[{id:"bounded-budget",required:["agentRef","budgetRef","obstructionSetRef","allocationRef"]}]}
  ]
};
const H=text=>createHash("sha256").update(text,"utf8").digest("hex");
const a=(text,options)=>auditCanonicalTerms(text,profile,options);

test("source spans are UTF-16, deterministic, and distinguish canonical terms",()=>{
  const text="🌊 The witness allocates attention. WIT is counted.";
  const r=a(text,{sourceVersion:"file@sha"});
  assert.deepEqual(r,a(text,{sourceVersion:"file@sha"}));
  assert.deepEqual(r.candidates.map(x=>x.term),["WIT","ATT","WIT"]);
  assert.equal(r.candidates[0].sourceSpan[0],7);
  for(const c of r.candidates)assert.equal(text.slice(...c.sourceSpan),c.text);
  assert.equal(r.unresolvedCount,3);
  assert.equal(r.disposition,"review-required");
  assert.equal(r.mathematicalProof,"not-established");
});
test("quotations, URLs, code, frontmatter are protected; table prose is audited",()=>{
  const tick=String.fromCharCode(96);
  const text=['---','description: witnessed attention','---','> The witness saw it.',
    '~~~','attention witnessed','~~~','"attention" and '+tick+'witnessing'+tick,
    '[attention](https://example.org/witness) | field', '| label | attention |',
    'The witness spoke.'].join("\n");
  const r=a(text);
  assert.deepEqual(r.candidates.map(x=>x.text),["attention","attention","witness"]);
  assert.ok(r.candidates.every(x=>x.line>=9));
});
test("exact reviewer receipt binds source hash, offsets, authority, required referents",()=>{
  const text="A WIT.", candidate=a(text).candidates[0];
  const receipt={sourceSha256:H(text),sourceSpan:candidate.sourceSpan,matchedText:candidate.text,
    term:"WIT",sort:"four-cover",details:{cellRef:"c",fromCharge:"bottom",toCharge:"true",evidenceRef:"e"},
    sourceRef:profile.canonicalTerms[0].source,reviewedBy:"office:science"};
  const r=a(text,{receipts:[receipt]});
  assert.equal(r.disposition,"lexically-receipted");
  assert.equal(r.reviewedCount,1);
  assert.equal(r.semanticTruth,"not-established");
  const bad=a(text,{receipts:[{...receipt, details:{cellRef:"c"}}]});
  assert.equal(bad.disposition,"review-required");
  assert.equal(bad.staleReceipts,1);
  assert.equal(a(text+" changed",{receipts:[receipt]}).disposition,"review-required");
});
test("distinct scientific sense needs explicit authority and positive attribution",()=>{
  const text="The witness testified in court.";
  const c=a(text).candidates[0];
  const valid={sourceSha256:H(text),sourceSpan:c.sourceSpan,matchedText:c.text,term:"WIT",
    sort:"foreign-discipline",sourceRef:"https://example.edu/court-procedure",
    reviewedBy:"office:law",details:{domain:"legal witness",reason:"testimony role, not a FOUR cover"}};
  assert.equal(a(text,{receipts:[valid]}).disposition,"lexically-receipted");
  assert.equal(a(text,{receipts:[{...valid,sourceRef:""}]}).disposition,"review-required");
});
test("duplicate receipts and stale source identities remain visible",()=>{
  const text="wit wit",c=a(text).candidates[0];
  const ok={sourceSha256:H(text),sourceSpan:c.sourceSpan,matchedText:c.text,
    term:"WIT",sort:"four-cover",
    details:{cellRef:"c",fromCharge:"bottom",toCharge:"true",evidenceRef:"e"},
    sourceRef:"https://example.edu/wit",reviewedBy:"office"};
  const r=a(text,{receipts:[ok,ok]});
  assert.equal(r.reviewedCount,1);
  assert.equal(r.staleReceipts,1);
  assert.equal(r.unresolvedCount,1);
});
test("source profile must be unambiguous and review cannot silently fill unknowns",()=>{
  assert.throws(()=>a(42),/must be a string/);
  assert.throws(()=>a("hello",{receipts:{}}),/array of objects/);
  assert.throws(()=>auditCanonicalTerms("wit",{...profile,canonicalTerms:[
    ...profile.canonicalTerms,{id:"OTHER",source:"source",collisionForms:["wit"],admissibleSorts:[{id:"x",required:[]}]}]}),/duplicate/);
  assert.throws(()=>auditCanonicalTerms("wit",{...profile,canonicalTerms:[]}),/Invalid canonical/);
});
test("CLI requires explicit science-owned profile and never guesses one",()=>{
  assert.deepEqual(termCliArgs(["notes.md","--profile","science.json"]),{
    source:"notes.md",profile:"science.json",receipts:null});
  assert.throws(()=>termCliArgs(["notes.md"]),/usage/);
  assert.throws(()=>termCliArgs(["notes.md","--profile","x","--profile","y"]),/usage/);
});

test("tree scanning is read-only and counts only reviewed Markdown forms",()=>{
  const root=mkdtempSync(join(tmpdir(),"ptgae-term-audit-"));
  try {
    mkdirSync(join(root,"docs"));
    writeFileSync(join(root,"docs","a.md"),"The witness read attention.");
    writeFileSync(join(root,"docs","b.mdx"),"A WIT.");
    writeFileSync(join(root,"docs","c.org"),"Unscanned syntax: attention.");
    writeFileSync(join(root,"docs","d.txt"),"Unscanned literal: witness.");
    mkdirSync(join(root,".git"));
    writeFileSync(join(root,".git","private.md"),"Ignore witness.");
    const report=canonicalTermCorpusAudit(root,profile);
    assert.equal(report.scannedFiles,2);
    assert.equal(report.filesWithCollisions,2);
    assert.equal(report.unresolvedOccurrences,3);
    assert.equal(report.disposition,"review-required");
    assert.equal(report.affectedFiles[0].path,"docs/a.md");
    assert.equal(report.affectedFiles[1].path,"docs/b.mdx");
    assert.throws(()=>canonicalTermCorpusAudit(root,{...profile,canonicalTerms:[]}),/Invalid canonical-term profile/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
