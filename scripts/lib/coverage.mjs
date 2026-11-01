const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'for', 'from', 'into', 'its', 'are', 'was', 'not', 'but', 'one', 'per', 'then', 'than', 'when', 'where', 'which', 'what', 'who', 'has', 'have', 'any', 'all', 'each', 'only', 'also', 'out', 'over', 'under', 'off', 'via', 'else', 'ever', 'never', 'does', 'did', 'own', 'same', 'such', 'their', 'there', 'these', 'those', 'they', 'them', 'you', 'your']);
const SPOKEN = new Set(['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'zero', 'slash', 'dot', 'dash', 'point', 'percent', 'plus', 'minus', 'colon', 'star', 'underscore', 'arrow', 'quote', 'quotes', 'ampersand', 'tilde', 'pipe', 'backtick', 'equals']);
const ANNOUNCE = 'overview goal architecture tech stack task preamble wrap up decision needed confirm assumption open question risks interfaces consumes produces code block mockup';
export const MIN_COVERAGE = 0.45;

const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
const contentWords = (text) => String(text)
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .toLowerCase()
  .replace(/[—–-]/g, ' ')
  .replace(/[^a-z0-9 ]/g, ' ')
  .split(/\s+/)
  .filter((w) => w.length > 2 && !/\d/.test(w) && !STOP.has(w))
  .map(stem);

const clauses = (text) => String(text)
  .replace(/\s+/g, ' ')
  .split(/(?<=[.!?;:])\s+|\s+—\s+|,\s+(?=(?:and|but|so|or)\s)/)
  .map((s) => s.trim())
  .filter((s) => contentWords(s).length >= 3);

const unmatched = (text, against, min, skip = new Set()) => {
  const known = new Set(contentWords(against));
  return clauses(text).filter((clause) => {
    const words = contentWords(clause).filter((w) => !skip.has(w));
    return words.length >= 3 && words.filter((w) => known.has(w)).length / words.length < min;
  });
};

export function uncovered(source, narration, min = MIN_COVERAGE) {
  return unmatched(source, narration, min);
}

export function unsupported(narration, source, extras = '', min = MIN_COVERAGE) {
  return unmatched(narration, `${source} ${extras} ${ANNOUNCE}`, min, SPOKEN);
}

function bothWays(errors, { source, sourcePath, paragraphs, extras = '' }) {
  const spoken = paragraphs.map((p) => p.text).join(' ');
  for (const clause of uncovered(source, spoken)) errors.push(`${sourcePath}: not narrated: "${clause}"`);
  for (const p of paragraphs) for (const clause of unsupported(p.text, source, extras)) errors.push(`${p.path}: not in the text: "${clause}"`);
}

const withPaths = (paragraphs, base) => paragraphs.map((p, j) => ({ ...p, path: `${base}[${j}]` }));

export function narrationCoverage(section, path) {
  const errors = [];
  const paragraphs = withPaths(section.narration, `${path}.narration`);
  const spoken = (target) => paragraphs.filter((p) => p.target === target);
  const check = (target, source, sourcePath, extras) => {
    const ps = spoken(target);
    if (!ps.length) return false;
    bothWays(errors, { source, sourcePath, paragraphs: ps, extras: `${section.title} ${extras ?? ''}` });
    return true;
  };
  if (section.summary) check('summary', section.summary, `${path}.summary`);
  section.blocks.forEach((b, j) => {
    if (!check(b.id, b.summary, `${path}.blocks[${j}].summary`, `${b.role} ${(b.behaviors ?? []).join(' ')}`)) errors.push(`${path}.blocks[${j}]: no narration paragraph`);
  });
  (section.ui ?? []).forEach((u, j) => {
    if (!check(u.id, u.notes, `${path}.ui[${j}].notes`, u.title)) errors.push(`${path}.ui[${j}]: no narration paragraph`);
  });
  if (section.risks.length) {
    const ps = spoken('risks');
    if (!ps.length) errors.push(`${path}.risks: no narration paragraph`);
    else {
      const text = ps.map((p) => p.text).join(' ');
      section.risks.forEach((r, k) => {
        for (const clause of uncovered(r, text)) errors.push(`${path}.risks[${k}]: not narrated: "${clause}"`);
      });
      const all = section.risks.join(' ');
      for (const p of ps) for (const clause of unsupported(p.text, all, section.title)) errors.push(`${p.path}: not in the text: "${clause}"`);
    }
  }
  return errors;
}

export function overviewCoverage(manifest) {
  const errors = [];
  const paragraphs = withPaths(manifest.narration?.overview ?? [], '$.narration.overview');
  for (const field of ['goal', 'architecture', 'techStack']) {
    const ps = paragraphs.filter((p) => p.target === field);
    if (ps.length && manifest.plan[field]) bothWays(errors, { source: manifest.plan[field], sourcePath: `$.plan.${field}`, paragraphs: ps, extras: manifest.plan.title });
  }
  const decisions = withPaths(manifest.narration?.decisions ?? [], '$.narration.decisions');
  manifest.decisions.forEach((d, k) => {
    const ps = decisions.filter((p) => p.target === d.id);
    if (ps.length) bothWays(errors, { source: `${d.text} ${(d.options ?? []).join(' ')}`, sourcePath: `$.decisions[${k}]`, paragraphs: ps, extras: d.kind });
  });
  return errors;
}
