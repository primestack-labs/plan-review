import { splitSentences } from '../tts/split.mjs';

export const PAIR_SIMILARITY = 0.4;
const REWRITE_SIMILARITY = 0.5;
const CONTEXT_LINES = 2;
const MAX_CELLS = 4_000_000;

export function diffSequence(a, b, eq = (x, y) => x === y) {
  const ops = [];
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start], b[start])) ops.push({ op: 'equal', value: b[start++] });
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) { endA--; endB--; }
  const sa = a.slice(start, endA);
  const sb = b.slice(start, endB);
  const n = sa.length;
  const m = sb.length;
  if (n * m > MAX_CELLS) {
    for (const value of sa) ops.push({ op: 'delete', value });
    for (const value of sb) ops.push({ op: 'insert', value });
  } else {
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) lcs[i * w + j] = eq(sa[i], sb[j]) ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (eq(sa[i], sb[j])) { ops.push({ op: 'equal', value: sb[j] }); i++; j++; }
      else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) ops.push({ op: 'delete', value: sa[i++] });
      else ops.push({ op: 'insert', value: sb[j++] });
    }
    while (i < n) ops.push({ op: 'delete', value: sa[i++] });
    while (j < m) ops.push({ op: 'insert', value: sb[j++] });
  }
  for (let i = endA; i < a.length; i++) ops.push({ op: 'equal', value: a[i] });
  return ops;
}

const tokens = (text) => text.match(/\w+|[^\w\s]+|\s+/g) ?? [];
const isWord = (t) => /\S/.test(t);

const isBridge = (ops, i) => ops[i].op === 'equal' && !isWord(ops[i].value) && i > 0 && i < ops.length - 1 && ops[i - 1].op !== 'equal' && ops[i + 1].op !== 'equal';

function mergeRuns(raw) {
  const ops = raw.flatMap((o, i) => (isBridge(raw, i) ? [{ op: 'delete', value: o.value }, { op: 'insert', value: o.value }] : [o]));
  const merged = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].op === 'equal') {
      let value = '';
      while (i < ops.length && ops[i].op === 'equal') value += ops[i++].value;
      merged.push({ op: 'equal', value });
      continue;
    }
    let deleted = '';
    let inserted = '';
    while (i < ops.length && ops[i].op !== 'equal') {
      if (ops[i].op === 'delete') deleted += ops[i].value;
      else inserted += ops[i].value;
      i++;
    }
    if (deleted) merged.push({ op: 'delete', value: deleted });
    if (inserted) merged.push({ op: 'insert', value: inserted });
  }
  return shiftRight(absorbIslands(merged));
}

const ISLAND_WORDS = 1;
const HEAVY_WORDS = 3;
const wordCount = (text) => tokens(text).filter(isWord).length;

function absorbIslands(ops) {
  const group = (i) => {
    const g = { from: i, to: i, deleted: '', inserted: '' };
    for (; g.to < ops.length && ops[g.to].op !== 'equal'; g.to++) g[ops[g.to].op === 'delete' ? 'deleted' : 'inserted'] += ops[g.to].value;
    g.words = Math.max(wordCount(g.deleted), wordCount(g.inserted));
    return g;
  };
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].op !== 'equal' || wordCount(ops[i].value) > ISLAND_WORDS || i === 0 || i === ops.length - 1) continue;
    let from = i - 1;
    while (from > 0 && ops[from - 1].op !== 'equal') from--;
    const prev = group(from);
    const next = group(i + 1);
    if (prev.to !== i || prev.words < HEAVY_WORDS || next.words < HEAVY_WORDS) continue;
    const joined = [{ op: 'delete', value: prev.deleted + ops[i].value + next.deleted }, { op: 'insert', value: prev.inserted + ops[i].value + next.inserted }];
    ops.splice(prev.from, next.to - prev.from, ...joined);
    i = prev.from - 1;
  }
  return ops;
}

function shiftRight(ops) {
  for (let i = 1; i < ops.length - 1; i++) {
    const [prev, change, next] = [ops[i - 1], ops[i], ops[i + 1]];
    if (prev.op !== 'equal' || change.op === 'equal' || next.op !== 'equal') continue;
    while (next.value && change.value[0] === next.value[0]) {
      prev.value += change.value[0];
      change.value = change.value.slice(1) + change.value[0];
      next.value = next.value.slice(1);
    }
  }
  return ops.filter((o) => o.value);
}

export function wordDiff(before, after) {
  const a = tokens(before);
  const b = tokens(after);
  const ops = diffSequence(a, b);
  const shared = ops.filter((o) => o.op === 'equal' && isWord(o.value)).length;
  const words = a.filter(isWord).length + b.filter(isWord).length;
  return { ops: mergeRuns(ops), similarity: words ? (2 * shared) / words : 1 };
}

const clauses = (text) => splitSentences(text).flatMap((s) => s.split(/(?<=[;:])\s+(?=\S)/));
const plain = (text) => (text ? [{ op: 'equal', value: text }] : null);

function changedPart(before, after) {
  const part = { kind: 'changed', before: plain(before), after: plain(after) };
  if (before && after) {
    const { ops, similarity } = wordDiff(before, after);
    if (similarity >= PAIR_SIMILARITY) {
      part.before = ops.filter((o) => o.op !== 'insert');
      part.after = ops.filter((o) => o.op !== 'delete');
    }
  }
  return part;
}

export function textChange(before, after) {
  if (before === after) return null;
  const ops = diffSequence(clauses(before), clauses(after));
  const parts = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].op === 'equal') {
      const text = [];
      while (i < ops.length && ops[i].op === 'equal') text.push(ops[i++].value);
      parts.push({ kind: 'same', text: text.join(' ') });
      continue;
    }
    const removed = [];
    const added = [];
    while (i < ops.length && ops[i].op !== 'equal') (ops[i].op === 'delete' ? removed : added).push(ops[i++].value);
    parts.push(changedPart(removed.join(' '), added.join(' ')));
  }
  return { kind: wordDiff(before, after).similarity < REWRITE_SIMILARITY ? 'rewritten' : 'edited', parts };
}

export function listChange(before, after, { pair = true } = {}) {
  const ops = diffSequence(before, after);
  if (ops.every((o) => o.op === 'equal')) return null;
  const items = [];
  const counts = { added: 0, removed: 0, edited: 0 };
  let i = 0;
  while (i < ops.length) {
    if (ops[i].op === 'equal') { items.push({ kind: 'same', text: ops[i++].value }); continue; }
    const removed = [];
    const added = [];
    while (i < ops.length && ops[i].op !== 'equal') (ops[i].op === 'delete' ? removed : added).push(ops[i++].value);
    const paired = new Map();
    for (const text of removed) {
      let best = null;
      if (pair) {
        for (let k = 0; k < added.length; k++) {
          if (paired.has(k)) continue;
          const { similarity } = wordDiff(text, added[k]);
          if (similarity >= PAIR_SIMILARITY && (!best || similarity > best.similarity)) best = { k, similarity };
        }
      }
      if (best) paired.set(best.k, text);
      else { items.push({ kind: 'removed', text }); counts.removed++; }
    }
    added.forEach((text, k) => {
      if (paired.has(k)) { items.push({ kind: 'edited', text, before: paired.get(k), change: textChange(paired.get(k), text) }); counts.edited++; }
      else { items.push({ kind: 'added', text }); counts.added++; }
    });
  }
  return { items, counts };
}

export function lineDiff(before, after) {
  if (before === after) return null;
  const ops = diffSequence(before.split('\n'), after.split('\n'));
  for (let i = 0; i < ops.length;) {
    if (ops[i].op === 'equal') { i++; continue; }
    const removed = [];
    const added = [];
    while (i < ops.length && ops[i].op !== 'equal') (ops[i].op === 'delete' ? removed : added).push(ops[i++]);
    for (let k = 0; k < Math.min(removed.length, added.length); k++) {
      const { ops: words, similarity } = wordDiff(removed[k].value, added[k].value);
      if (similarity < PAIR_SIMILARITY) continue;
      removed[k].ops = words.filter((o) => o.op !== 'insert');
      added[k].ops = words.filter((o) => o.op !== 'delete');
    }
  }
  const hunks = [];
  let current = null;
  ops.forEach((o, i) => {
    if (o.op === 'equal') return;
    const from = Math.max(0, i - CONTEXT_LINES);
    if (current && from <= current.to + 1) current.to = i;
    else { current = { from, to: i }; hunks.push(current); }
  });
  for (const h of hunks) h.to = Math.min(ops.length - 1, h.to + CONTEXT_LINES);
  return {
    hunks: hunks.map((h) => ops.slice(h.from, h.to + 1)),
    added: ops.filter((o) => o.op === 'insert').length,
    removed: ops.filter((o) => o.op === 'delete').length,
  };
}

const fileKey = (c) => `${c.role} · ${c.path} · ${c.action}`;
const byId = (items) => new Map(items.map((x) => [x.id, x]));
const prune = (o) => (Object.values(o).some(Boolean) ? o : null);

export function sectionRevision(previous, next) {
  const prevUi = byId(previous.ui);
  const prevBlocks = byId(previous.blocks);
  const ui = {};
  for (const u of next.ui) {
    const p = prevUi.get(u.id);
    const change = p ? prune({ title: textChange(p.title, u.title), notes: textChange(p.notes ?? '', u.notes ?? ''), html: p.html !== u.html }) : { added: true };
    if (change) ui[u.id] = change;
  }
  const blocks = {};
  for (const b of next.blocks) {
    const p = prevBlocks.get(b.id);
    const change = p
      ? prune({ role: textChange(p.role, b.role), summary: textChange(p.summary, b.summary), behaviors: listChange(p.behaviors ?? [], b.behaviors ?? []), source: p.source !== b.source, sourceDiff: lineDiff(p.source, b.source) })
      : { added: true };
    if (change) blocks[b.id] = change;
  }
  const nextUi = byId(next.ui);
  const nextBlocks = byId(next.blocks);
  const rows = new Map([...previous.changes, ...next.changes].map((c) => [fileKey(c), c]));
  const changes = listChange(previous.changes.map(fileKey), next.changes.map(fileKey), { pair: false });
  if (changes) for (const item of changes.items) item.row = rows.get(item.text);
  const revision = {
    title: textChange(previous.title, next.title),
    summary: textChange(previous.summary, next.summary),
    changes,
    interfaces: { consumes: listChange(previous.interfaces.consumes, next.interfaces.consumes), produces: listChange(previous.interfaces.produces, next.interfaces.produces) },
    ui,
    removedUi: previous.ui.filter((u) => !nextUi.has(u.id)).map((u) => ({ id: u.id, title: u.title })),
    risks: listChange(previous.risks, next.risks),
    blocks,
    removedBlocks: previous.blocks.filter((b) => !nextBlocks.has(b.id)).map((b) => ({ id: b.id, role: b.role })),
    executorDetail: lineDiff(previous.executorDetail, next.executorDetail),
  };
  const any = revision.title || revision.summary || revision.changes || revision.interfaces.consumes || revision.interfaces.produces || Object.keys(ui).length || revision.removedUi.length
    || revision.risks || Object.keys(blocks).length || revision.removedBlocks.length || revision.executorDetail;
  return any ? revision : null;
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const countText = (counts) => ['added', 'removed', 'edited'].filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`).join(', ');
const textKind = (change, noun) => (change ? `${noun} ${change.kind}` : null);

export function revisionNotes(revision, section) {
  if (!revision) return [];
  const notes = [];
  if (revision.title) notes.push({ target: 'title', text: `Title ${revision.title.kind}` });
  if (revision.summary) notes.push({ target: 'summary', text: `Summary ${revision.summary.kind}` });
  if (revision.changes) notes.push({ target: 'changes', text: `Files: ${countText(revision.changes.counts)}` });
  if (revision.interfaces.consumes) notes.push({ target: 'interfaces', text: `Interfaces consumed: ${countText(revision.interfaces.consumes.counts)}` });
  if (revision.interfaces.produces) notes.push({ target: 'interfaces', text: `Interfaces produced: ${countText(revision.interfaces.produces.counts)}` });
  section.ui.forEach((u, i) => {
    const c = revision.ui[u.id];
    if (!c) return;
    const parts = c.added ? ['added'] : [textKind(c.title, 'title'), textKind(c.notes, 'notes'), c.html ? 'picture updated' : null].filter(Boolean);
    notes.push({ target: u.id, text: `Mockup ${i + 1}: ${parts.join(', ')}` });
  });
  for (const u of revision.removedUi) notes.push({ target: 'ui', text: `Mockup "${u.title}" removed` });
  if (revision.risks) notes.push({ target: 'risks', text: `Risks: ${countText(revision.risks.counts)}` });
  section.blocks.forEach((b, i) => {
    const c = revision.blocks[b.id];
    if (!c) return;
    const parts = c.added ? ['added'] : [textKind(c.role, 'role'), textKind(c.summary, 'summary'), c.behaviors ? `behaviours ${countText(c.behaviors.counts)}` : null, c.source ? 'source changed' : null].filter(Boolean);
    notes.push({ target: b.id, text: `Code block ${i + 1}: ${parts.join(', ')}` });
  });
  for (const b of revision.removedBlocks) notes.push({ target: 'code', text: `Code block "${b.role}" removed` });
  if (revision.executorDetail) {
    const { added, removed } = revision.executorDetail;
    const parts = [added ? `${plural(added, 'line')} added` : null, removed ? `${plural(removed, 'line')} removed` : null].filter(Boolean);
    notes.push({ target: 'executor', text: `Executor detail: ${parts.join(', ')}` });
  }
  return notes;
}
