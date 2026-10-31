# ptgae-prose-analysis-service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Source-anchored conservative PTGAE prose diagnostics.


## Read-only corpus review

The existing [PTGAE corpus scanner](src/ptgae-corpus-scan.mjs) reports source-positioned prose diagnostics. Its optional repeated-passage review finds **identical paragraphs after whitespace normalization** across at least two distinct Markdown/text/HTML files. It reports a SHA-256 fingerprint, file, line, source revision (for callers supplying one), and passage length. It does not merge, rewrite, delete, or infer that two authors, authorities, claims, or sources are interchangeable.

From a checked-out, authorized corpus, select the original source directories explicitly:

```sh
node src/ptgae-corpus-scan.mjs --json --repeated-passages /path/to/operations-services-section/content /path/to/operations-services-section/services
```

The scanner follows the current PTGAE file-admission policy: recognized text extensions, skipped build/vendor directories, no symlink traversal. A reported match is only a **candidate for human examination**. Protect each source's rights, audience, temporal scope, evidence, distinct propositions, incoming references, and consumer before considering consolidation. Paragraphs containing protected Markdown material (metadata, quotes, code, or link destinations) are deliberately excluded, even when ordinary prose surrounds the protected span. Short repeated boilerplate and paraphrases may be missed; a negative result does not establish a duplicate-free corpus. The default thresholds (20 words and 120 characters) suppress small matches. No source files are modified, including on CLI errors.

For an actual edit, use Operations' original [consolidate-concept-notes](https://github.com/coesite-operations/operations-services-section/blob/main/lib/agency/skills/consolidate-concept-notes/SKILL.md) method and Red Cup's [Markdown engineering](https://github.com/red-cup-engineering/markdown-engineering-services-section) source/graph readers. Its outstanding [fail-closed consolidation repair](https://github.com/red-cup-engineering/markdown-engineering-services-section/pull/8) must receive native testing and authorized integration before automatic retirement or link retargeting. Corpus scanner output grants no such authority.

A repository source commit does not establish an installed CLI, PTGAE corpus approval, or downstream reader receiving.
