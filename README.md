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

For prose duplicated **inside one long operating Skill or across differently written paragraphs**, select the original scanner's sentence-level review instead of a second scanner:

```sh
node src/ptgae-corpus-scan.mjs --json --repeated-sentences --within-file /path/to/operations-services-section/lib/agency/skills
```

`--repeated-sentences` finds exact long sentences after whitespace normalization (default at least 16 words and 100 characters). It uses the same source protection, file admission and SHA-256 fingerprints as paragraph review. It returns file, line, column and optional caller-supplied revision. By default it requires matches in two different files; `--within-file` additionally admits multiple occurrences within one file and is meaningful only with `--repeated-sentences`. Sentence boundaries use terminal punctuation followed by whitespace; abbreviations, paraphrases and punctuation variants are not semantic equivalence tests. A match is a **read-only editorial candidate**, not permission to delete a sentence: different qualification, time, subject, authorship or normative context may require retaining both.

The scanner follows the current PTGAE file-admission policy: recognized text extensions, skipped build/vendor directories, no symlink traversal. A reported match is only a **candidate for human examination**. Protect each source's rights, audience, temporal scope, evidence, distinct propositions, incoming references, and consumer before considering consolidation. Paragraphs containing protected Markdown material (metadata, quotes, code, or link destinations) are deliberately excluded, even when ordinary prose surrounds the protected span. Short repeated boilerplate and paraphrases may be missed; a negative result does not establish a duplicate-free corpus. The default thresholds (20 words and 120 characters) suppress small matches. No source files are modified, including on CLI errors.

For an actual edit, use Operations' original [consolidate-concept-notes](https://github.com/coesite-operations/operations-services-section/blob/main/lib/agency/skills/consolidate-concept-notes/SKILL.md) method and Red Cup's [Markdown engineering](https://github.com/red-cup-engineering/markdown-engineering-services-section) source/graph readers. Its [fail-closed consolidation repair](https://github.com/red-cup-engineering/markdown-engineering-services-section/pull/8) is now source-merged and native-tested; its deployment, original reader admission and independent corpus receiving still require verification before any automated retirement or link retargeting. Corpus scanner output grants no such authority.

Both prose linting and repeated-passage diagnostics use the original source-coordinate protection law in `src/analyze.mjs`. YAML frontmatter, fenced/inline code, Markdown link destinations, tables, explicit and lazy blockquotes, and straight/curly quotations remain source evidence rather than edit suggestions. The scanner still identifies only candidate repetition; its diagnostics grant no permission to rewrite, redirect or retire a document. Tests cover both excluded evidence and ordinary prose after a quotation.

## Operations corpus receiving

The [source-owned read-only corpus consumer](src/review-operations-corpus.mjs) uses the **same PTGAE parser and repeat analysis** with a Git-tracked view of current operating prose. It reads the original `README.md`, `lib/agency/skills/`, `content/` and `services/` Markdown/text/HTML, explicitly excluding `legacy`, `history`, `recovered`, `source-history`, fixtures, generated and private-carrier regions. Source selection is deterministic and bounded by file/byte limits; symlinks and unreadable/non-regular tracked documents refuse rather than silently changing coverage.

```sh
node src/review-operations-corpus.mjs /absolute/path/to/operations-services-section
```

Its JSON identifies an exact committed Git `HEAD`, selected files/bytes, conservative PTGAE findings and exact repetition candidates with original paths/line coordinates. Selection comes from the **immutable HEAD tree**, and each read file's bytes must reproduce its Git blob OID. Unstaged/staged worktree changes refuse as `operations-corpus-source-revision-mismatch`; newly staged-only files are not attributed to the older commit. Symlink/nonregular files still refuse. This prevents assigning changed prose to a revision that never contained it. The report prints **no source paragraphs or customer records**, rewrites/deletes nothing and cannot establish semantic equivalence; historical evidence stays with its archival owners. Before rewriting, qualify the actual source and consumer under the original Coesite consolidation rule.

The [reusable CI reader](.github/workflows/review-operations-corpus.yml) allows an authorized consumer to call this report with an **immutable supplier commit**. The caller repository stays the source owner; it does not install a new language engine, invent an L-Space admission or grant deletion authority. GitHub source, runner execution, downstream package selection and independent editorial acceptance remain separate readings.

A repository source commit does not establish an installed CLI, PTGAE corpus approval, or downstream reader receiving.
