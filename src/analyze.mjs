const RULES = [
  { id: "PTG001", severity: "warning", pattern: /\b(?:it is important to note(?: that)?|it is worth noting(?: that)?|it should be noted that|it is worth mentioning(?: that)?)\b/gi, message: "State the proposition without throat-clearing." },
  { id: "PTG002", severity: "warning", pattern: /\b(?:may|might|could)\s+(?:potentially|possibly|perhaps)\b/gi, message: "Use one uncertainty mechanism unless two uncertainties are distinct." },
  { id: "PTG003", severity: "warning", pattern: /\bone possible (?:approach|option|way) (?:could|would|might) be\b/gi, message: "State the proposal directly." },
  { id: "PTG004", severity: "info", pattern: /\bin order to\b/gi, message: "Prefer 'to' when meaning is unchanged." },
  { id: "PTG005", severity: "info", pattern: /\bserves as\b/gi, message: "Prefer the direct verb when it names the actual action." },
  { id: "PTG006", severity: "warning", pattern: /\brepresents? a significant\b/gi, message: "Name the significance, measurement, or consequence." },
  { id: "PTG007", severity: "warning", pattern: /\bthis does not necessarily mean\b/gi, message: "State the bounded implication directly." },
  { id: "PTG008", severity: "warning", pattern: /\bwhile\b[^.!?\n]{0,120}\b(?:not been|cannot|can't)\b[^.!?\n]{0,100}\b(?:prov(?:e|ed|en)|demonstrat(?:e|ed)|establish(?:ed)?)\b/gi, message: "Put the claim first and encode real uncertainty as status." },
  { id: "PTG009", severity: "warning", pattern: /\bit is possible that\b/gi, message: "Use a precise uncertainty or claim-status rendering." },
  { id: "PTG010", severity: "info", pattern: /\bdue to the fact that\b/gi, message: "Prefer 'because' when stating cause." },
  { id: "PTG011", severity: "info", pattern: /\bhas the ability to\b/gi, message: "Prefer 'can' when capability is the intended meaning." },
  { id: "PTG012", severity: "warning", pattern: /\b(?:there is|there are)\s+(?:a number of|several different|various different)\b/gi, message: "Name the items or give the count." },
  { id: "PTG013", severity: "error", pattern: /\bmaintains knowledge and practices for this service domain\b/gi, message: "Generic service boilerplate is not a description; state actual work or mark scope unknown." },
  { id: "PTG017", severity: "warning", pattern: /\b(?:plays?|playing) (?:a )?(?:crucial|critical|important|key|pivotal) role\b/gi, message: "State what the subject does." },
  { id: "PTG021", severity: "warning", pattern: /\bparadigm shift\b/gi, message: "Name the old model, new model, and changed consequence." },
  { id: "PTG027", severity: "warning", pattern: /\ba wide (?:array|range|variety) of\b/gi, message: "Name representative items, the class, or the actual count." },
  { id: "PTG029", severity: "warning", pattern: /\brobust and scalable\b/gi, message: "Name tested reliability and scale properties." },
  { id: "PTG032", severity: "warning", pattern: /\bgoing forward\b/gi, message: "State the future rule, action, or effective date." },
  { id: "PTG036", severity: "warning", pattern: /\bfurther research is needed\b/gi, message: "Name the unanswered question, missing measurement, or next experiment." },
  { id: "PTG041", severity: "error", pattern: /\bmaintains knowledge and practices for the study of\b/gi, message: "Generic research scaffold hides the actual verb and scope." },
  { id: "PTG042", severity: "error", pattern: /\bthis section holds shared knowledge and services concerning\b/gi, message: "Generic scope boilerplate needs an owning-editor rewrite." },
  { id: "PTG043", severity: "warning", pattern: /\bthis is the home for OECD FORD\b/gi, message: "State the classification and scope directly." },
  { id: "PTG044", severity: "warning", pattern: /\bIts material is organized by artifact role under `content\/`; specialized\s+subdomains continue under `services\/`\./gi, message: "Repeated scaffold tail is generator/template evidence, not section-specific scope." }
];

// All offsets are UTF-16 code-unit offsets, the same coordinates as String.slice
// and RegExp match.index. Never spread the string into Unicode code points.
export function protectedPtgaeSpans(source, {protectTables = true} = {}) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  const marks = new Uint8Array(source.length);
  const protect = (from, to) => { for (let i = from; i < to; i++) marks[i] = 1; };
  let cursor = 0;
  let lineNo = 0;
  let inFrontmatter = false;
  let fence = null;
  let inLazyQuote = false;
  while (cursor < source.length) {
    const newLine = source.indexOf('\n', cursor);
    const end = newLine < 0 ? source.length : newLine;
    const line = source.slice(cursor, end).replace(/\r$/u, '');
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (lineNo === 0 && /^\uFEFF?---\s*$/u.test(line)) inFrontmatter = true;
    if (inFrontmatter) {
      protect(cursor, end);
      if (lineNo > 0 && /^\s*(?:---|\.\.\.)\s*$/u.test(line)) inFrontmatter = false;
    } else if (fence) {
      protect(cursor, end);
      const closing = /^ {0,3}(`+|~+)\s*$/u.exec(line);
      if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.size) fence = null;
    } else if (opening) {
      // An unquoted fence opens a new block, not a lazy blockquote continuation.
      inLazyQuote = false;
      fence = { marker: opening[1][0], size: opening[1].length };
      protect(cursor, end);
    } else if (/^ {0,3}>/u.test(line)) {
      protect(cursor, end);
      // An empty quoted line does not license a following lazy paragraph.
      inLazyQuote = /^ {0,3}>[ \t]?\S/u.test(line);
    } else if (inLazyQuote && line.trim()
      && !/^(?: {4}|\t| {0,3}(?:#{1,6}(?:\s|$)|(?:[-+*]|\d{1,9}[.)])\s+|(?:[-*_]\s*){3,}$|\[[^\]]+\]:\s*\S|<[/!]|\|))/u.test(line)) {
      // Only paragraph-like lines can lazily continue quoted testimony.
      // Headings, lists, thematic breaks, link definitions, HTML and tables interrupt it.
      protect(cursor, end);
    } else {
      inLazyQuote = false;
      if (/^(?: {4}|\t)/u.test(line)
        || /^ {0,3}\[[^\]]+\]:\s*\S/u.test(line)) {
        protect(cursor, end);
      } else if (protectTables && line.includes('|')) {
        // A conservative text lint, not a Markdown parser: table cells are protected.
        protect(cursor, end);
      }
    }
    cursor = newLine < 0 ? source.length : newLine + 1;
    lineNo++;
  }

  const escaped = i => { let n = 0; for (let j = i-1; j >= 0 && source[j] === '\\'; j--) n++; return n % 2 === 1; };
  const findClosingQuote = (at, closing) => {
    for (let j = at + 1; j < source.length && source[j] !== '\n'; j++) {
      if (marks[j]) return -1;
      if (source[j] === closing && !escaped(j)) return j;
    }
    return -1;
  };
  for (let i = 0; i < source.length; i++) {
    if (marks[i] || escaped(i)) continue;
    if (source[i] === '`') {
      let n = 1; while (source[i+n] === '`') n++;
      let closing = -1;
      for (let j = i+n; j < source.length; j++) {
        if (marks[j]) break;
        if (source[j] !== '`') continue;
        let k = j+1; while (source[k] === '`') k++;
        if (k-j === n) { closing = k; break; }
        j = k-1;
      }
      if (closing !== -1) { protect(i, closing); i = closing-1; }
      else { protect(i, source.length); break; }
    } else if (source[i] === '"' || source[i] === '“' || source[i] === '‘') {
      // Curly single quotation marks carry evidence; apostrophes inside words do not.
      const closing = findClosingQuote(i, source[i] === '“' ? '”' : source[i] === '‘' ? '’' : '"');
      if (closing !== -1) { protect(i, closing+1); i = closing; }
      else { const eol = source.indexOf('\n', i); const end = eol < 0 ? source.length : eol; protect(i, end); i = end-1; }
    } else if (source[i] === ']' && source[i+1] === '(') {
      // Protect Markdown link destinations, not the prose of the link label.
      let depth = 1, j = i+2;
      for (; j < source.length && source[j] !== '\n' && !marks[j]; j++) {
        if (escaped(j)) continue;
        if (source[j] === '(') depth++;
        if (source[j] === ')' && --depth === 0) break;
      }
      if (j < source.length && source[j] === ')' && depth === 0) {
        protect(i+1, j+1); i = j;
      } else {
        const eol = source.indexOf('\n', i); const end = eol < 0 ? source.length : eol;
        protect(i+1, end); i = end-1;
      }
    }
  }
  const spans = [];
  for (let i=0; i<marks.length;) {
    if (!marks[i]) { i++; continue; }
    const start=i; while(i<marks.length&&marks[i]) i++;
    spans.push([start,i]);
  }
  return spans;
}

function maskProtected(source, spans) {
  const masked = source.split(''); // UTF-16 code units
  for (const [start, end] of spans) {
    for (let i=start;i<end;i++) if (masked[i] !== '\n' && masked[i] !== '\r') masked[i]=' ';
  }
  return masked.join('');
}

function position(source, index) {
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  const last = before.lastIndexOf("\n");
  return { line, column: index - last };
}

/** Unverified stylistic diagnostics. Coordinates are UTF-16 half-open source spans. */
export function analyzePTGAE(source, { sourceVersion = null } = {}) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  const protectedSpans = protectedPtgaeSpans(source);
  const visible = maskProtected(source, protectedSpans);
  const findings = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of visible.matchAll(rule.pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      // A regex may bridge masked regions through whitespace or a wildcard.
      if (protectedSpans.some(([lo, hi]) => start < hi && end > lo)) continue;
      const at = position(source, start);
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        line: at.line,
        column: at.column,
        sourceSpan: [start, end],
        text: source.slice(start, end),
        message: rule.message,
        sourceVersion
      });
    }
  }
  return findings.sort((a,b) => a.sourceSpan[0]-b.sourceSpan[0] || a.ruleId.localeCompare(b.ruleId));
}

export function summarizeCorpus(files) {
  const byRule = new Map();
  for (const file of files) {
    for (const finding of file.findings) {
      if (!byRule.has(finding.ruleId)) byRule.set(finding.ruleId, new Set());
      byRule.get(finding.ruleId).add(file.path);
    }
  }
  return [...byRule].map(([ruleId, paths]) => ({
    ruleId,
    files: [...paths].sort(),
    fileCount: paths.size,
    systemic: paths.size >= 2
  })).sort((a,b) => b.fileCount-a.fileCount || a.ruleId.localeCompare(b.ruleId));
}
