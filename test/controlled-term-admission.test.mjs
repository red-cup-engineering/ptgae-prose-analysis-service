import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {auditCanonicalTerms} from "../src/controlled-term-admission.mjs";

const profile={
  kind:"ptgae.canonical-term-admission/v1",id:"test-policy",canonicalTerms:[
    {id:"WIT",source:"https://example.edu/wit",collisionForms:["wit","witnessing","witness"],
      admissibleSorts:[{id:"four-cover",required:["cellRef","fromCharge","toCharge","evidenceRef"]}]},
    {id:"ATT",source:"https://example.edu/att",collisionForms:["att","attention"],
      admissibleSorts:[{id:"bounded-budget",required:["agentRef","budgetRef","obstructionSetRef","allocationRef"]}]}
  ]
};
const H=text=>createHash("sha256").update(text,"utf8").digest("hex");
const PROFILE_TEXT=JSON.stringify(profile);
const PROFILE_SHA=H(PROFILE_TEXT);
const a=(text,options)=>auditCanonicalTerms(text,profile,{
  profileSourceSha256:PROFILE_SHA,profileSourceText:PROFILE_TEXT,
  sourceVersion:"fixture/owned.md",...options
});

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
  const receipt={fileContentSha256:H(text),profileContentSha256:PROFILE_SHA,sourceVersion:"fixture/owned.md",sourceSpan:candidate.sourceSpan,matchedText:candidate.text,
    term:"WIT",sort:"four-cover",details:{cellRef:"c",fromCharge:"bottom",toCharge:"true",evidenceRef:"e"},
    sourceRef:profile.canonicalTerms[0].source,reviewedBy:"office:science"};
  const r=a(text,{receipts:[receipt]});
  assert.equal(r.disposition,"lexically-receipted");
  assert.equal(r.reviewedCount,1);
  assert.equal(r.semanticTruth,"not-established");
  // Engineering must not accept the earlier, noncanonical receipt key.
  const wrongKey={...receipt,sourceSha256:receipt.fileContentSha256};
  delete wrongKey.fileContentSha256;
  const mismatched=a(text,{receipts:[wrongKey]});
  assert.equal(mismatched.disposition,"review-required");
  assert.equal(mismatched.staleReceipts,1);
  const bad=a(text,{receipts:[{...receipt, details:{cellRef:"c"}}]});
  assert.equal(bad.disposition,"review-required");
  assert.equal(bad.staleReceipts,1);
  assert.equal(a(text+" changed",{receipts:[receipt]}).disposition,"review-required");
});
test("source review is invalid across Science policy or document changes",()=>{
  const text="A WIT.", candidate=a(text).candidates[0];
  const reviewed={fileContentSha256:H(text),profileContentSha256:PROFILE_SHA,
    sourceVersion:"docs/a.md",sourceSpan:candidate.sourceSpan,matchedText:candidate.text,
    term:"WIT",sort:"four-cover",details:{cellRef:"cell",fromCharge:"bottom",toCharge:"true",evidenceRef:"e"},
    sourceRef:profile.canonicalTerms[0].source,reviewedBy:"office:science"};
  const accepted=a(text,{sourceVersion:"docs/a.md",receipts:[reviewed]});
  assert.equal(accepted.disposition,"lexically-receipted");
  assert.equal(accepted.profileSourceSha256,PROFILE_SHA);
  const otherSource=a(text,{sourceVersion:"docs/b.md",receipts:[reviewed]});
  assert.equal(otherSource.disposition,"review-required");
  assert.equal(otherSource.staleReceipts,1);
  const changedProfile={...profile,canonicalTerms:profile.canonicalTerms.map(term =>
    term.id==="WIT" ? {...term,admissibleSorts:term.admissibleSorts.map(sort => ({
      ...sort,required:[...sort.required,"new-policy-condition"]
    }))} : term)};
  const changedProfileText=JSON.stringify(changedProfile);
  const otherProfile=auditCanonicalTerms(text,changedProfile,{
    sourceVersion:"docs/a.md",profileSourceSha256:H(changedProfileText),
    profileSourceText:changedProfileText,receipts:[reviewed]
  });
  assert.equal(otherProfile.disposition,"review-required");
  assert.equal(otherProfile.staleReceipts,1);
  assert.throws(()=>a(text,{profileSourceSha256:"b".repeat(64)}),/does not match exact supplied policy text/);
  assert.throws(()=>a(text,{profileSourceText:JSON.stringify({...profile,id:"forged-policy"})}),/does not match exact supplied policy text/);
  const forgedProfileText=JSON.stringify({...profile,id:"forged-policy"});
  assert.throws(()=>auditCanonicalTerms(text,profile,{
    sourceVersion:"docs/a.md",profileSourceSha256:H(forgedProfileText),
    profileSourceText:forgedProfileText,receipts:[reviewed]
  }),/Science profile object differs from supplied policy text/);
  const oldReceipt=a(text,{sourceVersion:"docs/a.md",receipts:[{...reviewed,profileContentSha256:undefined}]});
  assert.equal(oldReceipt.disposition,"review-required");
  assert.throws(()=>auditCanonicalTerms(text,profile,{receipts:[reviewed]}),/review receipts require verified Science policy bytes/i);
  assert.throws(()=>a(text,{sourceVersion:null,receipts:[reviewed]}),/nonempty reviewed source identity/);
  assert.throws(()=>a(text,{profileSourceSha256:"not-hex"}),/Invalid Science profile SHA-256/);
});

test("distinct scientific sense needs explicit authority and positive attribution",()=>{
  const text="The witness testified in court.";
  const c=a(text).candidates[0];
  const valid={fileContentSha256:H(text),profileContentSha256:PROFILE_SHA,sourceVersion:"fixture/owned.md",sourceSpan:c.sourceSpan,matchedText:c.text,term:"WIT",
    sort:"foreign-discipline",sourceRef:"https://example.edu/court-procedure",
    reviewedBy:"office:law",details:{domain:"legal witness",reason:"testimony role, not a FOUR cover"}};
  assert.equal(a(text,{receipts:[valid]}).disposition,"lexically-receipted");
  assert.equal(a(text,{receipts:[{...valid,sourceRef:""}]}).disposition,"review-required");
  assert.equal(a(text,{receipts:[{...valid,sourceRef:profile.canonicalTerms[0].source}]}).disposition,"review-required");
});
test("duplicate receipts and stale source identities remain visible",()=>{
  const text="wit wit",c=a(text).candidates[0];
  const ok={fileContentSha256:H(text),profileContentSha256:PROFILE_SHA,sourceVersion:"fixture/owned.md",sourceSpan:c.sourceSpan,matchedText:c.text,
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
