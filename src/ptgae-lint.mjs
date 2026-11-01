import { protectedPtgaeSpans } from './analyze.mjs';

const RULES = [
  { code: 'PTG001', severity: 'warning', pattern: /\b(?:it is important to note(?: that)?|it is worth noting(?: that)?|it should be noted that|it is worth mentioning(?: that)?|it is important to remember(?: that)?)\b/gi, message: 'Delete the throat-clearing phrase and state the proposition.' },
  { code: 'PTG002', severity: 'warning', pattern: /\b(?:may|might|could)\s+(?:potentially|possibly|perhaps)\b/gi, message: 'Use one uncertainty marker, not stacked modality.' },
  { code: 'PTG003', severity: 'warning', pattern: /\bone possible (?:approach|option|way) (?:could|would|might) be\b/gi, message: 'State the proposal directly.' },
  { code: 'PTG004', severity: 'info', pattern: /\bin order to\b/gi, message: 'Prefer “to” unless the longer phrase prevents ambiguity.' },
  { code: 'PTG005', severity: 'info', pattern: /\bserves as\b/gi, message: 'Prefer a direct verb when one names the actual action.' },
  { code: 'PTG006', severity: 'warning', pattern: /\brepresents? a significant\b/gi, message: 'Name the significance or measurement instead of asserting generic importance.' },
  { code: 'PTG007', severity: 'warning', pattern: /\bthis does not necessarily mean\b/gi, message: 'State the bounded implication directly.' },
  { code: 'PTG008', severity: 'warning', pattern: /\bwhile\b[^.!?\n]{0,120}\b(?:not been|cannot|can't)\b[^.!?\n]{0,100}\b(?:prov(?:e|ed|en)|demonstrat(?:e|ed)|establish(?:ed)?)\b/gi, message: 'Put the claim first; encode real uncertainty as claim status.' },
  { code: 'PTG009', severity: 'warning', pattern: /\bit is possible that\b/gi, message: 'State the proposition with a precise uncertainty or claim-status marker.' },
  { code: 'PTG010', severity: 'info', pattern: /\bdue to the fact that\b/gi, message: 'Prefer “because” unless the longer construction changes meaning.' },
  { code: 'PTG011', severity: 'info', pattern: /\bhas the ability to\b/gi, message: 'Prefer “can” when capability is the intended meaning.' },
  { code: 'PTG012', severity: 'warning', pattern: /\b(?:there is|there are)\s+(?:a number of|several different|various different)\b/gi, message: 'Name the items or give the count.' },
  { code: 'PTG013', severity: 'error', pattern: /\bmaintains knowledge and practices for this service domain\b/gi, message: 'Generic service boilerplate is not a description. State the section’s actual work or mark the description incomplete.' },
  { code: 'PTG014', severity: 'warning', pattern: /\bin today(?:'|’)s rapidly (?:changing|evolving)\b/gi, message: 'Delete generic scene-setting and state the current condition.' },
  { code: 'PTG015', severity: 'warning', pattern: /\b(?:ever[- ]evolving|rapidly evolving) landscape\b/gi, message: 'Name the domain and the change instead of using a landscape metaphor.' },
  { code: 'PTG016', severity: 'warning', pattern: /\bnavigat(?:e|es|ing) the complexit(?:y|ies) of\b/gi, message: 'Name the concrete problem and action.' },
  { code: 'PTG017', severity: 'warning', pattern: /\b(?:plays?|playing) (?:a )?(?:crucial|critical|important|key|pivotal) role\b/gi, message: 'State what the subject does.' },
  { code: 'PTG018', severity: 'warning', pattern: /\b(?:is|are|was|were) a testament to\b/gi, message: 'State the evidence or consequence directly.' },
  { code: 'PTG019', severity: 'warning', pattern: /\bunlock(?:s|ed|ing)? (?:the )?(?:full )?potential of\b/gi, message: 'Name the capability or outcome instead of promising “potential.”' },
  { code: 'PTG020', severity: 'warning', pattern: /\b(?:holistic|comprehensive and holistic) approach\b/gi, message: 'Name the included components or scope.' },
  { code: 'PTG021', severity: 'warning', pattern: /\bparadigm shift\b/gi, message: 'Name the old model, new model, and changed consequence.' },
  { code: 'PTG022', severity: 'warning', pattern: /\b(?:underscores?|highlights?) the (?:importance|need|necessity) of\b/gi, message: 'State the requirement or consequence directly.' },
  { code: 'PTG023', severity: 'warning', pattern: /\b(?:it is|it's) (?:crucial|critical|essential|imperative) to\b/gi, message: 'State the required action and its authority or consequence.' },
  { code: 'PTG024', severity: 'warning', pattern: /\bcannot be overstated\b/gi, message: 'Delete the emphasis formula and state the measured consequence.' },
  { code: 'PTG025', severity: 'info', pattern: /\bin light of the fact that\b/gi, message: 'Prefer “because” or name the triggering fact directly.' },
  { code: 'PTG026', severity: 'info', pattern: /\bwith (?:regard|respect) to\b/gi, message: 'Use “about,” “for,” or the direct object when meaning is unchanged.' },
  { code: 'PTG027', severity: 'warning', pattern: /\ba wide (?:array|range|variety) of\b/gi, message: 'Name representative items, the class, or the actual count.' },
  { code: 'PTG028', severity: 'warning', pattern: /\b(?:seamless|seamlessly) (?:integration|integrate|integrates|integrated|experience)\b/gi, message: 'Name the integration behavior or interface contract.' },
  { code: 'PTG029', severity: 'warning', pattern: /\brobust and scalable\b/gi, message: 'Name the reliability and scale properties that were tested or required.' },
  { code: 'PTG030', severity: 'warning', pattern: /\b(?:foster|fosters|fostering) (?:a |an )?(?:culture|environment|ecosystem) of\b/gi, message: 'Name the concrete practice, incentive, or institution.' },
  { code: 'PTG031', severity: 'warning', pattern: /\bas we move forward\b/gi, message: 'State the next action, condition, or date.' },
  { code: 'PTG032', severity: 'warning', pattern: /\bgoing forward\b/gi, message: 'State the future rule or action directly.' },
  { code: 'PTG033', severity: 'warning', pattern: /\bat the end of the day\b/gi, message: 'Delete the filler and state the conclusion.' },
  { code: 'PTG034', severity: 'warning', pattern: /\bwhen it comes to\b/gi, message: 'Name the subject directly.' },
  { code: 'PTG035', severity: 'warning', pattern: /\b(?:needless to say|there is no doubt that)\b/gi, message: 'Delete the certainty theater and state the proposition.' },
  { code: 'PTG036', severity: 'warning', pattern: /\bfurther research is needed\b/gi, message: 'Name the unanswered question, missing measurement, or next experiment.' },
  { code: 'PTG037', severity: 'warning', pattern: /\bit remains to be seen\b/gi, message: 'State what is unknown and what observation would resolve it.' },
  { code: 'PTG038', severity: 'warning', pattern: /\b(?:at its core|at the core of)\b/gi, message: 'State the central mechanism or definition directly.' },
  { code: 'PTG039', severity: 'warning', pattern: /\b(?:in conclusion|to conclude|in summary)\b[:,]?/gi, message: 'Use a descriptive heading or state the conclusion without a transition label.' },
  { code: 'PTG040', severity: 'warning', pattern: /\b(?:this|that) (?:clearly )?(?:demonstrates|shows) the (?:importance|value) of\b/gi, message: 'State the observed consequence or evidence directly.' },
  { code: 'PTG041', severity: 'error', pattern: /\bmaintains knowledge and practices for the study of\b/gi, message: 'Generic research scaffold hides the verb. State what the section studies or does.' },
  { code: 'PTG042', severity: 'error', pattern: /\bthis section holds shared knowledge and services concerning\b/gi, message: 'Generic scope boilerplate is not a useful description. Name the section’s work or state that the description is incomplete.' },
  { code: 'PTG043', severity: 'warning', pattern: /\bthis is the home for OECD FORD\b/gi, message: 'State the classification and scope directly instead of using “home for.”' }
];

export const CLAIM_STATUS = new Set([
  'Observed', 'Measured', 'Inferred', 'Hypothesis', 'Model', 'Proposed',
  'Required', 'Intended', 'Simulated', 'Unverified', 'Disputed',
  'Deprecated', 'Unknown'
]);

// The source-coordinate protection law is shared with analysis and corpus scanning.
// Do not maintain a second, weaker Markdown masker for prose linting.
function maskMarkdownCode(source) {
  const masked = source.split(''); // UTF-16 code units, unchanged source offsets
  for (const [start, end] of protectedPtgaeSpans(source)) {
    for (let i = start; i < end; i++) {
      if (masked[i] !== '\n' && masked[i] !== '\r') masked[i] = ' ';
    }
  }
  return masked.join('');
}

function lineColumn(source, index) {
  const before = source.slice(0, index);
  const line = before.split('\n').length;
  const lastNl = before.lastIndexOf('\n');
  return { line, column: index - lastNl };
}

export function lintPTGAE(source) {
  const visible = maskMarkdownCode(source);
  const findings = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of visible.matchAll(rule.pattern)) {
      const at = lineColumn(source, match.index ?? 0);
      findings.push({
        code: rule.code,
        severity: rule.severity,
        line: at.line,
        column: at.column,
        text: match[0],
        message: rule.message
      });
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column || a.code.localeCompare(b.code));
}

export function summarizeFindings(findings) {
  const summary = { error: 0, warning: 0, info: 0, total: findings.length, byCode: {} };
  for (const finding of findings) {
    summary[finding.severity] = (summary[finding.severity] ?? 0) + 1;
    summary.byCode[finding.code] = (summary.byCode[finding.code] ?? 0) + 1;
  }
  return summary;
}

export function formatFindings(findings, filename = '<text>') {
  return findings.map(f => filename + ':' + f.line + ':' + f.column + ' ' + f.code + ' ' + f.severity + ' ' + f.message).join('\n');
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const fs = await import('node:fs/promises');
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const failOnWarning = args.includes('--fail-on-warning');
  const files = args.filter(arg => !arg.startsWith('--'));
  if (!files.length) {
    console.error('usage: node ptgae-lint.mjs [--json] [--fail-on-warning] FILE [...]');
    process.exit(2);
  }
  let failed = false;
  const report = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const findings = lintPTGAE(source);
    const summary = summarizeFindings(findings);
    report.push({ file, summary, findings });
    if (!json && findings.length) console.log(formatFindings(findings, file));
    if (findings.some(f => f.severity === 'error') || (failOnWarning && findings.some(f => f.severity === 'warning'))) failed = true;
  }
  if (json) console.log(JSON.stringify(report, null, 2));
  process.exitCode = failed ? 1 : 0;
}
