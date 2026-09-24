import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validate } from './lib/schema.mjs';
import { sha1, sectionHash } from './lib/hash.mjs';

const loadSchema = (name) => JSON.parse(readFileSync(new URL(`../schema/${name}`, import.meta.url), 'utf8'));
export const MANIFEST_SCHEMA = loadSchema('manifest.schema.json');
export const SUBMISSION_SCHEMA = loadSchema('submission.schema.json');

const SUB_TARGETS = ['summary', 'interfaces', 'decisions', 'risks', 'ui'];
const OVERVIEW_TARGETS = ['goal', 'architecture', 'techStack', 'taskMap'];
const MAX_PARAGRAPH_WORDS = 90;
const MAX_SENTENCE_WORDS = 35;

export function narrationIssues(text) {
  const issues = [];
  if (/[—–]/.test(text)) issues.push('contains a dash; use a comma or a full stop');
  if (/[()]/.test(text)) issues.push('contains parentheses; make the aside its own sentence');
  if (/\[\[/.test(text)) issues.push('contains [[');
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > MAX_PARAGRAPH_WORDS) issues.push(`${words} words; keep a paragraph under ${MAX_PARAGRAPH_WORDS}`);
  const longest = Math.max(...text.split(/(?<=[.!?])\s+/).map((s) => s.split(/\s+/).filter(Boolean).length));
  if (longest > MAX_SENTENCE_WORDS) issues.push(`a sentence of ${longest} words; keep sentences under ${MAX_SENTENCE_WORDS}`);
  return issues;
}

export function validateManifest(manifest) {
  const errors = validate(MANIFEST_SCHEMA, manifest);
  if (errors.length) return errors;

  const seen = new Map();
  const unique = (id, path) => {
    if (seen.has(id)) errors.push(`${path}: duplicate id ${id}`);
    else seen.set(id, path);
  };
  manifest.decisions.forEach((d, i) => unique(d.id, `$.decisions[${i}].id`));
  (manifest.narration?.overview ?? []).forEach((p, j) => unique(p.id, `$.narration.overview[${j}].id`));
  (manifest.narration?.decisions ?? []).forEach((p, j) => unique(p.id, `$.narration.decisions[${j}].id`));
  manifest.sections.forEach((s, i) => {
    unique(s.id, `$.sections[${i}].id`);
    s.blocks.forEach((b, j) => unique(b.id, `$.sections[${i}].blocks[${j}].id`));
    s.ui.forEach((u, j) => unique(u.id, `$.sections[${i}].ui[${j}].id`));
    s.narration.forEach((p, j) => unique(p.id, `$.sections[${i}].narration[${j}].id`));
  });

  const sectionIds = new Set(manifest.sections.map((s) => s.id));
  const decisionIds = new Set(manifest.decisions.map((d) => d.id));
  const nodeIds = new Set(manifest.taskMap.nodes.map((n) => n.id));

  manifest.decisions.forEach((d, i) => {
    if (!sectionIds.has(d.sectionId)) errors.push(`$.decisions[${i}].sectionId: unknown section ${d.sectionId}`);
  });
  (manifest.narration?.overview ?? []).forEach((p, j) => {
    if (!OVERVIEW_TARGETS.includes(p.target)) errors.push(`$.narration.overview[${j}].target: unknown target ${p.target}`);
    for (const issue of narrationIssues(p.text)) errors.push(`$.narration.overview[${j}].text: ${issue}`);
  });
  (manifest.narration?.decisions ?? []).forEach((p, j) => {
    if (!decisionIds.has(p.target)) errors.push(`$.narration.decisions[${j}].target: unknown decision ${p.target}`);
    for (const issue of narrationIssues(p.text)) errors.push(`$.narration.decisions[${j}].text: ${issue}`);
  });
  manifest.taskMap.nodes.forEach((n, i) => {
    if (!sectionIds.has(n.id)) errors.push(`$.taskMap.nodes[${i}].id: unknown section ${n.id}`);
  });
  manifest.taskMap.edges.forEach((e, i) => {
    for (const end of ['from', 'to']) {
      if (!nodeIds.has(e[end])) errors.push(`$.taskMap.edges[${i}].${end}: unknown node ${e[end]}`);
    }
  });
  manifest.sections.forEach((s, i) => {
    s.decisionIds.forEach((id, j) => {
      if (!decisionIds.has(id)) errors.push(`$.sections[${i}].decisionIds[${j}]: unknown decision ${id}`);
    });
    const targets = new Set([...SUB_TARGETS, ...s.blocks.map((b) => b.id)]);
    s.narration.forEach((p, j) => {
      if (!targets.has(p.target)) errors.push(`$.sections[${i}].narration[${j}].target: unknown target ${p.target}`);
      for (const issue of narrationIssues(p.text)) errors.push(`$.sections[${i}].narration[${j}].text: ${issue}`);
    });
  });
  return errors;
}

export function stampHashes(manifest, planText) {
  manifest.plan.hash = sha1(planText);
  for (const section of manifest.sections) section.contentHash = sectionHash(section);
  return manifest;
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { plan: { type: 'string' } } });
  const [manifestPath] = positionals;
  if (!manifestPath) {
    console.error('usage: validate.mjs <manifest.json> [--plan <plan.md>]');
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (values.plan) stampHashes(manifest, readFileSync(values.plan, 'utf8'));
  const errors = validateManifest(manifest);
  if (values.plan && !errors.length) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const e of errors) console.error(e);
  console.log(errors.length ? `invalid: ${errors.length} error(s)` : `valid: ${manifest.sections.length} section(s)`);
  process.exit(errors.length ? 1 : 0);
}
