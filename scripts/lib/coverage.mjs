const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'for', 'from', 'into', 'its', 'are', 'was', 'not', 'but', 'one', 'per', 'then', 'than', 'when', 'where', 'which', 'what', 'who', 'has', 'have', 'any', 'all', 'each', 'only', 'also', 'out', 'over', 'under', 'off', 'via', 'else', 'ever', 'never', 'does', 'did', 'own', 'same', 'such', 'their', 'there', 'these', 'those', 'they', 'them', 'you', 'your']);
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

export function uncovered(source, narration, min = MIN_COVERAGE) {
  const spoken = new Set(contentWords(narration));
  return clauses(source).filter((clause) => {
    const words = contentWords(clause);
    return words.filter((w) => spoken.has(w)).length / words.length < min;
  });
}

export function narrationCoverage(section, path) {
  const errors = [];
  const spoken = (target) => section.narration.filter((p) => p.target === target).map((p) => p.text).join(' ');
  section.blocks.forEach((b, j) => {
    const text = spoken(b.id);
    if (!text) {
      errors.push(`${path}.blocks[${j}]: no narration paragraph`);
      return;
    }
    for (const clause of uncovered(b.summary, text)) errors.push(`${path}.blocks[${j}].summary: not narrated: "${clause}"`);
  });
  if (section.risks.length) {
    const text = spoken('risks');
    if (!text) errors.push(`${path}.risks: no narration paragraph`);
    else section.risks.forEach((r, k) => {
      for (const clause of uncovered(r, text)) errors.push(`${path}.risks[${k}]: not narrated: "${clause}"`);
    });
  }
  return errors;
}
