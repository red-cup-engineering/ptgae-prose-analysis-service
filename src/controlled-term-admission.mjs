// Read-only lexical collision detection. Science owns the profile and meanings.
// A receipt attests review of exact source bytes; it is NOT a formal proof of meaning.
import {createHash} from "node:crypto";
import {protectedPtgaeSpans} from "./analyze.mjs";

const hash = s => createHash("sha256").update(s, "utf8").digest("hex");
const present = x => typeof x === "string" && x.trim().length > 0;
const overlap = (start, end, spans) => spans.some(([a, b]) => start < b && end > a);
const escapeRegExp = text => text.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");

function position(source, index) {
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  return {line, column: index - before.lastIndexOf("\n")};
}

function validateProfile(profile) {
  if (!profile || profile.kind !== "ptgae.canonical-term-admission/v1" ||
      !present(profile.id) || !Array.isArray(profile.canonicalTerms) ||
      profile.canonicalTerms.length === 0) throw new TypeError("Invalid canonical-term profile");
  const forms = new Set(), ids = new Set();
  for (const term of profile.canonicalTerms) {
    if (!present(term.id) || ids.has(term.id) || !present(term.source) ||
        !Array.isArray(term.collisionForms) || term.collisionForms.length === 0 ||
        !Array.isArray(term.admissibleSorts) || term.admissibleSorts.length === 0)
      throw new TypeError("Malformed canonical term");
    ids.add(term.id);
    for (const form of term.collisionForms) {
      if (!present(form) || forms.has(form.toLocaleLowerCase("en-US")))
        throw new TypeError("Ambiguous or duplicate collision form");
      forms.add(form.toLocaleLowerCase("en-US"));
    }
    const sorts = new Set();
    for (const sort of term.admissibleSorts) {
      if (!present(sort.id) || sorts.has(sort.id) || !Array.isArray(sort.required) ||
          sort.required.some(x => !present(x))) throw new TypeError("Invalid term sort");
      sorts.add(sort.id);
    }
  }
  return profile;
}

function isReceipt(candidate, receipt, sourceHash, term, profileSourceSha256, sourceVersion) {
  if (!receipt || receipt.fileContentSha256 !== sourceHash ||
      receipt.profileContentSha256 !== profileSourceSha256 ||
      receipt.sourceVersion !== sourceVersion ||
      receipt.term !== candidate.term || receipt.matchedText !== candidate.text ||
      !Array.isArray(receipt.sourceSpan) || receipt.sourceSpan.length !== 2 ||
      receipt.sourceSpan[0] !== candidate.sourceSpan[0] ||
      receipt.sourceSpan[1] !== candidate.sourceSpan[1] ||
      !present(receipt.reviewedBy) || !present(receipt.sourceRef) ||
      !receipt.details || typeof receipt.details !== "object" ||
      Array.isArray(receipt.details)) return false;
  const foreign = receipt.sort === "foreign-discipline";
  const kind = term.admissibleSorts.find(s => s.id === receipt.sort);
  if (!foreign && !kind) return false;
  // A distinct-discipline receipt cannot cite the canonical monetary source as its authority.
  if (foreign && receipt.sourceRef === term.source) return false;
  const fields = foreign ? ["domain", "reason"] : kind.required;
  return fields.every(k => present(receipt.details[k])) &&
    (foreign || receipt.sourceRef === term.source);
}

/**
 * Returns every unprotected token collision and its exact UTF-16 coordinates.
 * Passing the review-receipt gate cannot establish the mathematics or truth
 * of the reviewed sentences; semantic responsibility stays with their owner.
 */
export function auditCanonicalTerms(source, profile, {receipts = [], sourceVersion = null, profileSourceSha256 = null} = {}) {
  if (typeof source !== "string") throw new TypeError("source must be a string");
  if (!Array.isArray(receipts) || receipts.some(x => !x || typeof x !== "object"))
    throw new TypeError("receipts must be an array of objects");
  if (sourceVersion !== null && !present(sourceVersion)) throw new TypeError("Invalid source version");
  if (profileSourceSha256 !== null && !/^[a-f0-9]{64}$/u.test(profileSourceSha256))
    throw new TypeError("Invalid Science profile SHA-256");
  if (receipts.length > 0 && profileSourceSha256 === null)
    throw new TypeError("Review receipts require the exact Science profile source SHA-256");
  validateProfile(profile);
  const sourceSha256 = hash(source);
  // Existing style lint protects whole Markdown table rows. This audit
  // deliberately scans prose table cells while still excluding source quotes,
  // code, YAML metadata and link destinations.
  const protectedSpans = protectedPtgaeSpans(source, {protectTables: false});
  const matched = [];
  for (const term of profile.canonicalTerms) {
    const pattern = new RegExp(
      "(?<![\\p{L}\\p{N}_])(?:" +
      [...term.collisionForms].sort((a,b) => b.length-a.length)
        .map(escapeRegExp).join("|") + ")(?![\\p{L}\\p{N}_])", "giu");
    for (const match of source.matchAll(pattern)) {
      const start = match.index, end = start + match[0].length;
      if (overlap(start, end, protectedSpans)) continue;
      matched.push({
        term: term.id, text: source.slice(start,end), sourceSpan: [start,end],
        ...position(source, start), authority: term.source, sourceVersion
      });
    }
  }
  matched.sort((a,b) => a.sourceSpan[0]-b.sourceSpan[0] || a.term.localeCompare(b.term));
  const usedReceipts = new Set(), candidates = [];
  for (const candidate of matched) {
    const term = profile.canonicalTerms.find(t => t.id === candidate.term);
    let index = -1;
    for (let j=0; j<receipts.length; j++) {
      if (!usedReceipts.has(j) && isReceipt(candidate, receipts[j], sourceSha256, term, profileSourceSha256, sourceVersion)) {
        index=j; break;
      }
    }
    if (index >= 0) usedReceipts.add(index);
    candidates.push({...candidate, disposition:index >= 0 ? "review-receipted" : "review-required",
      requiredSorts:term.admissibleSorts.map(s => s.id)});
  }
  const unbound = candidates.filter(x => x.disposition === "review-required");
  const staleReceipts = receipts.length-usedReceipts.size;
  return {
    kind:"ptgae.canonical-term-audit/v1",
    profileId:profile.id,
    profileSourceSha256,
    source:{sha256:sourceSha256, utf16Length:source.length, sourceVersion},
    candidates, reviewedCount:candidates.length-unbound.length,
    unresolvedCount:unbound.length, staleReceipts,
    disposition:unbound.length || staleReceipts ? "review-required" : "lexically-receipted",
    semanticTruth:"not-established", mathematicalProof:"not-established",
    reviewedTermMeaning:"reviewer-attested-not-machine-proven"
  };
}
