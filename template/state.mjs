export function buildQueue(sections) {
  return sections.flatMap((s) => s.narration.map((p) => ({ id: p.id, sectionId: s.id, target: p.target })));
}

export function initialState(sections, decisions, prefill = {}, previousResolutions = {}) {
  return {
    sections: Object.fromEntries(sections.map((s) => [s.id, { verdict: prefill[s.id] ?? null, heard: false }])),
    decisions: Object.fromEntries(decisions.map((d) => [d.id, { resolution: previousResolutions[d.id] ?? null }])),
    comments: [],
    nextComment: 1,
    scroll: 0,
  };
}

export function mergeDraft(state, draft) {
  if (!draft) return state;
  for (const [id, v] of Object.entries(draft.sections ?? {})) if (state.sections[id]) state.sections[id] = { verdict: v.verdict ?? null, heard: Boolean(v.heard) };
  for (const [id, d] of Object.entries(draft.decisions ?? {})) if (state.decisions[id]) state.decisions[id] = { resolution: d.resolution ?? null };
  state.comments = (draft.comments ?? []).filter((c) => state.sections[c.anchor?.sectionId]);
  state.nextComment = draft.nextComment ?? state.comments.length + 1;
  state.scroll = draft.scroll ?? 0;
  return state;
}

const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function submitBlockers(sections, decisions, state) {
  const blockers = [];
  const noVerdict = sections.filter((s) => !state.sections[s.id]?.verdict).length;
  if (noVerdict) blockers.push(`${plural(noVerdict, 'section')} without a verdict`);
  const open = decisions.filter((d) => !state.decisions[d.id]?.resolution).length;
  if (open) blockers.push(`${plural(open, 'open decision')}`);
  const orphaned = sections.filter((s) => ['commented', 'questioned'].includes(state.sections[s.id]?.verdict) && !state.comments.some((c) => c.anchor.sectionId === s.id)).length;
  if (orphaned) blockers.push(`${plural(orphaned, 'commented section')} without a comment`);
  return blockers;
}

export function counters(sections, decisions, state) {
  const by = (v) => sections.filter((s) => state.sections[s.id]?.verdict === v).length;
  return { approved: by('approved'), commented: by('commented'), questioned: by('questioned'), openDecisions: decisions.filter((d) => !state.decisions[d.id]?.resolution).length };
}

export function outcome(sections, state) {
  const allApproved = sections.every((s) => state.sections[s.id]?.verdict === 'approved');
  return allApproved && state.comments.length === 0 ? 'approved' : 'changes-requested';
}

export function buildSubmission({ round, planHash, sections, decisions, state, now }) {
  return {
    schema: 1,
    round,
    planHash,
    submittedAt: now,
    outcome: outcome(sections, state),
    sections: Object.fromEntries(sections.map((s) => [s.id, { verdict: state.sections[s.id].verdict, heard: state.sections[s.id].heard }])),
    decisions: Object.fromEntries(decisions.map((d) => [d.id, { resolution: state.decisions[d.id].resolution }])),
    comments: state.comments,
  };
}

export function anchorFromSelection({ text, before, after }) {
  return { quote: text, prefix: before.slice(-10), suffix: after.slice(0, 10) };
}

export function sectionOrder(sections, currentId, delta) {
  const ids = sections.map((s) => s.id);
  const index = ids.indexOf(currentId);
  if (index < 0) return delta > 0 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, index + delta))];
}
