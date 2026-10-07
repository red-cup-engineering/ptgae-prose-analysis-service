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

function straightQuoteEnd(source, start) {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '"' && source[i - 1] !== "\\") return i;
    if (source[i] === "\n") return -1;
  }
  return -1;
}

function maskProtected(source) {
  const chars = [...source];
  const masked = [...source];
  let fence = null;
  let inline = false;
  for (let i = 0; i < chars.length; i++) {
    if (!fence && !inline && (i === 0 || chars[i - 1] === "\n")) {
      const end = source.indexOf("\n", i);
      const lineEnd = end === -1 ? source.length : end;
      if (/^\s{0,3}>/.test(source.slice(i, lineEnd))) {
        for (let j = i; j < lineEnd; j++) masked[j] = " ";
        i = lineEnd - 1;
        continue;
      }
    }
    const three = source.slice(i, i + 3);
    if (!inline && (three === "```" || three === "~~~")) {
      if (!fence) fence = three;
      else if (fence === three) fence = null;
      for (let j = 0; j < 3; j++) masked[i + j] = " ";
      i += 2;
      continue;
    }
    if (!fence && chars[i] === "`") {
      inline = !inline;
      masked[i] = " ";
      continue;
    }
    if (!fence && !inline && chars[i] === '"') {
      const end = straightQuoteEnd(source, i);
      if (end !== -1) {
        for (let j = i; j <= end; j++) if (chars[j] !== "\n") masked[j] = " ";
        i = end;
        continue;
      }
    }
    if (!fence && !inline && chars[i] === "“") {
      const end = source.indexOf("”", i + 1);
      if (end !== -1 && !source.slice(i, end + 1).includes("\n")) {
        for (let j = i; j <= end; j++) if (chars[j] !== "\n") masked[j] = " ";
        i = end;
        continue;
      }
    }
    if (fence || inline) if (chars[i] !== "\n") masked[i] = " ";
  }
  return masked.join("");
}

function position(source, index) {
  const before = source.slice(0, index);
  const line = before.split("\n").length;
  const last = before.lastIndexOf("\n");
  return { line, column: index - last };
}

export function analyzePTGAE(source, { sourceVersion = null } = {}) {
  const visible = maskProtected(source);
  const findings = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of visible.matchAll(rule.pattern)) {
      const at = position(source, match.index ?? 0);
      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        line: at.line,
        column: at.column,
        text: match[0],
        message: rule.message,
        sourceVersion
      });
    }
  }
  return findings.sort((a,b) => a.line-b.line || a.column-b.column || a.ruleId.localeCompare(b.ruleId));
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
