import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { diffManifests } from './diff.mjs';
import { introSections } from './audio.mjs';

const TEMPLATE_DIR = fileURLToPath(new URL('../template/', import.meta.url));
const WORDS_PER_MINUTE = 200;
const SUB_NAMES = ['summary', 'changes', 'interfaces', 'decisions', 'ui', 'risks', 'code'];

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const h = escapeHtml;
export const mermaidId = (id) => id.replace(/[^A-Za-z0-9_]/g, '_');

const readTemplate = (name) => (existsSync(join(TEMPLATE_DIR, name)) ? readFileSync(join(TEMPLATE_DIR, name), 'utf8') : '');

export function readingMinutes(section) {
  const text = [section.summary, ...section.interfaces.consumes, ...section.interfaces.produces, ...section.risks, ...section.blocks.map((b) => b.summary)].join(' ');
  return text.split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE;
}

export function listeningSeconds(section, audioIndex) {
  return section.narration.reduce((sum, p) => sum + (audioIndex[p.id]?.duration ?? 0), 0);
}

const fmtMin = (minutes) => `${Math.max(1, Math.round(minutes))} min`;
const fmtSec = (seconds) => (seconds ? `${Math.max(1, Math.round(seconds / 60))} min` : 'no audio');
const list = (items) => (items.length ? `<ul>${items.map((i) => `<li>${h(i)}</li>`).join('')}</ul>` : '<p class="none">None.</p>');

const INTRO_TITLES = { overview: 'Overview', decisions: 'Decisions needed' };
const INTRO_LABELS = { overview: 'Ov', decisions: 'Dec' };
const chapterLabel = (s) => (s.kind === 'task' ? `T${s.ordinal}` : s.kind === 'preamble' ? 'P' : 'W');

function renderHeader(manifest, audioIndex, round) {
  const intro = introSections(manifest);
  const readTotal = manifest.sections.reduce((s, x) => s + readingMinutes(x), 0);
  const listenTotal = [...intro, ...manifest.sections].reduce((s, x) => s + listeningSeconds(x, audioIndex), 0);
  const segments = [
    ...intro.map((s) => `<button class="seg intro" data-section="${h(s.id)}" style="flex-grow:${listeningSeconds(s, audioIndex) || 1}" title="${INTRO_TITLES[s.id]}"><span class="fill"></span></button>`),
    ...manifest.sections.map((s) => `<button class="seg" data-section="${h(s.id)}" style="flex-grow:${listeningSeconds(s, audioIndex) || 1}" title="${h(s.title)}"><span class="fill"></span></button>`),
  ].join('');
  const chapters = [
    ...intro.map((s) => `<button class="chapter intro" data-section="${h(s.id)}" style="flex-grow:${listeningSeconds(s, audioIndex) || 1}" title="${INTRO_TITLES[s.id]}">${INTRO_LABELS[s.id]}</button>`),
    ...manifest.sections.map((s) => `<button class="chapter" data-section="${h(s.id)}" style="flex-grow:${listeningSeconds(s, audioIndex) || 1}" title="${h(s.title)}">${chapterLabel(s)}</button>`),
  ].join('');
  return `<header class="bar" id="bar">
  <div class="row">
    <h1>${h(manifest.plan.title)}</h1><span class="round">Round ${round}</span>
    <div class="transport">
      <button id="prev" title="Previous section (Shift+↑)">⏮</button>
      <button id="back" title="Back 15 seconds (Shift+←)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><text x="12.5" y="15.5">15</text></svg></button>
      <button id="toggle" title="Play or pause (Space) · Start the section over (Shift+Space)">▶</button>
      <button id="fwd" title="Forward 15 seconds (Shift+→)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><text x="11.5" y="15.5">15</text></svg></button>
      <button id="next" title="Next section (Shift+↓)">⏭</button>
      <label class="stop-at-end"><input id="stop-at-end" type="checkbox"> Stop at section end</label>
    </div>
  </div>
  <div class="row status">
    <div class="theme" id="theme" role="radiogroup" aria-label="Theme"><button data-theme="system" title="Theme: follow the system">◐</button><button data-theme="light" title="Theme: light">☀</button><button data-theme="dark" title="Theme: dark">☾</button></div>
    <label class="transport" title="Slower (Alt+←) · Faster (Alt+→)">Speed <input id="speed" type="range" min="0.8" max="2" step="0.1" value="1"><span id="speed-value">1.0×</span></label>
    <span id="now">Not playing</span>
    <span id="clock">0:00 / 0:00</span>
  </div>
  <div class="progress" id="progress">${segments}</div>
  <div class="chapters" id="chapters">${chapters}</div>
  <div class="row counters">
    <span id="count-approved">0 approved</span><span id="count-commented">0 commented</span><span id="count-decisions">0 open decisions</span>
    <span class="budget">read ${fmtMin(readTotal)} · listen ${fmtSec(listenTotal)}</span>
  </div>
</header>`;
}

function renderOverview(manifest) {
  const { plan, taskMap } = manifest;
  const lines = ['flowchart LR', ...taskMap.nodes.map((n) => `  ${mermaidId(n.id)}["${n.title.replace(/"/g, "'")}"]`), ...taskMap.edges.map((e) => `  ${mermaidId(e.from)} -->|${e.label.replace(/\|/g, '/')}| ${mermaidId(e.to)}`)];
  const taskMapHtml = taskMap.nodes.length
    ? `<div class="taskmap" id="taskmap"><div class="taskmap-tools"><button data-taskmap="fit" title="Fit the diagram to the frame">Fit</button><button data-taskmap="full" title="Toggle fullscreen">⛶ Fullscreen</button><span class="hint">ctrl + wheel or pinch to zoom · drag to pan</span></div><div class="taskmap-view"><div class="taskmap-canvas"><pre class="mermaid">${h(lines.join('\n'))}</pre></div></div></div>`
    : '';
  return `<section id="overview">
  <h2><button class="play" data-section="overview" title="Play the overview">▶</button> Overview</h2>
  <dl>
    <dt>Goal</dt><dd id="overview-goal">${h(plan.goal)}</dd>
    <dt>Architecture</dt><dd id="overview-architecture">${h(plan.architecture)}</dd>
    <dt>Tech stack</dt><dd id="overview-techStack">${h(plan.techStack)}</dd>
    <dt>Spec</dt><dd><code>${h(plan.spec)}</code></dd>
    <dt>Plan</dt><dd><code>${h(plan.path)}</code></dd>
  </dl>
  <div id="overview-taskMap">${taskMapHtml}</div>
</section>`;
}

function renderDecisions(manifest, previousResolutions) {
  const titles = new Map(manifest.sections.map((s) => [s.id, s.title]));
  const rows = manifest.decisions.map((d) => {
    const resolved = previousResolutions[d.id];
    const control = d.options
      ? d.options.map((o) => `<label><input type="radio" name="decision-${h(d.id)}" value="${h(o)}"${resolved === o ? ' checked' : ''}> ${h(o)}</label>`).join('')
      : `<input type="text" name="decision-${h(d.id)}" value="${h(resolved ?? '')}" placeholder="Your resolution">`;
    return `<div class="decision" id="decision-${h(d.id)}" data-decision="${h(d.id)}" data-kind="${h(d.kind)}"${resolved ? ' data-resolved="true"' : ''}>
    <span class="kind">${h(d.kind)}</span>
    <p>${h(d.text)}</p>
    <a href="#${h(d.sectionId)}">${h(titles.get(d.sectionId) ?? d.sectionId)}</a>
    <div class="resolution">${control}</div>
  </div>`;
  }).join('');
  return `<section id="decisions"><h2><button class="play" data-section="decisions" title="Play the decisions">▶</button> Decisions needed</h2>${rows || '<p class="none">No open decisions.</p>'}</section>`;
}

const renderConstraints = (constraints) => `<section id="constraints"><details><summary>Global constraints (${constraints.length})</summary>${list(constraints)}</details></section>`;

function renderSection(s, ctx) {
  const { audioIndex, changed, prefill, decisionsById, threads } = ctx;
  const sub = (name, label, inner) => `<div class="sub sub-${name}" id="${h(s.id)}-${name}"><h3>${label}</h3>${inner}</div>`;
  const changes = s.changes.length
    ? `<table><thead><tr><th>Role</th><th>Path</th><th>Action</th></tr></thead><tbody>${s.changes.map((c) => `<tr><td>${h(c.role)}</td><td><code>${h(c.path)}</code></td><td>${h(c.action)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="none">No files.</p>';
  const interfaces = `<dl><dt>Consumes</dt><dd>${list(s.interfaces.consumes)}</dd><dt>Produces</dt><dd>${list(s.interfaces.produces)}</dd></dl>`;
  const decisions = s.decisionIds.length
    ? `<ul>${s.decisionIds.map((id) => `<li><a href="#decision-${h(id)}">${h(decisionsById.get(id)?.text ?? id)}</a></li>`).join('')}</ul>`
    : '<p class="none">None.</p>';
  const ui = s.ui.map((u) => `<figure class="mockup" id="${h(u.id)}" data-ui="${h(u.id)}"><figcaption>${h(u.title)} <button class="comment-ui" data-ui="${h(u.id)}">Comment on this mockup</button></figcaption><div class="frame-fit"><div class="frame" style="width:${Number(u.width) || 360}px" title="Open full size">${u.html}</div></div>${u.notes ? `<p class="notes">${h(u.notes)}</p>` : ''}</figure>`).join('');
  const blocks = s.blocks.map((b) => `<details class="block" id="${h(b.id)}" data-kind="${h(b.kind)}"><summary><span class="role">${h(b.role)}</span> ${h(b.summary)}</summary>${b.behaviors?.length ? `<ul class="behaviors">${b.behaviors.map((x) => `<li>${h(x)}</li>`).join('')}</ul>` : ''}<pre><code class="lang-${h(b.lang)}">${h(b.source)}</code></pre></details>`).join('');
  const isChanged = changed.has(s.id);
  const verdict = prefill[s.id] ?? '';
  return `<article class="card" id="${h(s.id)}" data-section="${h(s.id)}" data-kind="${h(s.kind)}" data-verdict="${h(verdict)}"${isChanged ? ' data-changed="true"' : ''}${verdict === 'approved' ? ' data-collapsed="true"' : ''}>
  <header>
    <button class="play" data-section="${h(s.id)}" title="Play this section">▶</button>
    <h2>${h(s.title)}</h2>
    ${isChanged ? '<span class="badge changed">changed since last round</span>' : ''}
    <span class="budget">read ${fmtMin(readingMinutes(s))} · listen ${fmtSec(listeningSeconds(s, audioIndex))}</span>
  </header>
  ${sub('summary', 'Summary', `<p>${h(s.summary)}</p>`)}
  ${sub('changes', 'Changes', changes)}
  ${sub('interfaces', 'Interfaces', interfaces)}
  ${sub('decisions', 'Decisions', decisions)}
  ${sub('ui', 'UI', ui || '<p class="none">No UI.</p>')}
  ${sub('risks', 'Risks', list(s.risks))}
  ${sub('code', 'Code', blocks || '<p class="none">No code.</p>')}
  <details class="sub sub-executor" id="${h(s.id)}-executor"><summary>Executor detail</summary><div class="md" data-md="${h(s.id)}"></div><script type="text/markdown" id="md-${h(s.id)}">${s.executorDetail.replace(/<\/script/gi, '<\\/script')}</script></details>
  ${threads(s.id)}
  <footer class="verdict"><button data-verdict="commented">✎ Comment</button><button data-verdict="approved">✓ Approve</button></footer>
</article>`;
}

const renderFooter = () => `<footer class="foot" id="foot">
  <span id="comment-count">0 comments</span><span id="autosave">Not saved yet</span><span id="blockers"></span>
  <button id="submit" disabled>Submit review</button>
</footer>`;

export function render(manifest, { audioIndex = {}, previous = null, round = 1 } = {}) {
  const ctx = roundContext(manifest, previous);
  const body = [
    renderHeader(manifest, audioIndex, round),
    '<main>',
    renderOverview(manifest),
    renderDecisions(manifest, ctx.previousResolutions),
    renderConstraints(manifest.constraints),
    ...manifest.sections.map((s) => renderSection(s, { ...ctx, audioIndex, decisionsById: new Map(manifest.decisions.map((d) => [d.id, d])) })),
    '</main>',
    renderFooter(),
  ].join('\n');
  const data = {
    round,
    planHash: manifest.plan.hash,
    audioIndex,
    prefill: ctx.prefill,
    previousResolutions: ctx.previousResolutions,
    changed: [...ctx.changed],
    intro: introSections(manifest).map((s) => ({ id: s.id, narration: s.narration.map((p) => ({ id: p.id, target: p.target })) })),
    sections: manifest.sections.map((s) => ({ id: s.id, narration: s.narration.map((p) => ({ id: p.id, target: p.target })) })),
    decisions: manifest.decisions.map((d) => ({ id: d.id })),
  };
  const fill = {
    title: h(manifest.plan.title),
    css: readTemplate('page.css'),
    body,
    data: JSON.stringify(data).replace(/<\/script/gi, '<\\/script'),
    state: readTemplate('state.mjs').replace(/^export /gm, ''),
    js: readTemplate('page.js'),
  };
  return readTemplate('page.html').replace(/\{\{(\w+)\}\}/g, (_, key) => fill[key] ?? '');
}

export function roundContext(manifest, previous) {
  if (!previous?.submission) return { changed: new Set(), prefill: {}, previousResolutions: {}, threads: () => '' };
  const { submission, replies } = previous;
  const changed = new Set(previous.manifest ? diffManifests(previous.manifest, manifest).changed : []);
  const replyFor = (id) => replies?.replies?.[id];
  const comments = submission.comments ?? [];
  const reopened = new Set(comments.filter((c) => ['rejected', 'clarified'].includes(replyFor(c.id)?.status)).map((c) => c.anchor.sectionId));

  const prefill = {};
  for (const s of manifest.sections) {
    const verdict = submission.sections?.[s.id]?.verdict;
    if (verdict === 'approved' && !changed.has(s.id) && !reopened.has(s.id)) prefill[s.id] = 'approved';
  }
  const previousResolutions = Object.fromEntries(Object.entries(submission.decisions ?? {}).map(([id, d]) => [id, d.resolution]));

  const threads = (sectionId) => {
    const own = comments.filter((c) => c.anchor.sectionId === sectionId);
    if (!own.length) return '';
    return `<div class="threads">${own.map((c) => {
      const reply = replyFor(c.id);
      return `<div class="thread" data-comment="${h(c.id)}" data-status="${h(reply?.status ?? 'unanswered')}">
    <blockquote>${h(c.anchor.quote)}</blockquote>
    <p class="you">${h(c.text)}</p>
    ${reply ? `<p class="reply"><b>${h(reply.status)}:</b> ${h(reply.text)}</p>` : '<p class="reply none">No reply yet.</p>'}
  </div>`;
    }).join('')}</div>`;
  };
  return { changed, prefill, previousResolutions, threads };
}

export function readPrevious(dir) {
  const read = (name) => (existsSync(join(dir, name)) ? JSON.parse(readFileSync(join(dir, name), 'utf8')) : null);
  return { manifest: read('manifest.json'), submission: read('submission.json'), replies: read('replies.json') };
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { audio: { type: 'string' }, previous: { type: 'string' }, round: { type: 'string', default: '1' }, out: { type: 'string' } },
  });
  const [manifestPath] = positionals;
  if (!manifestPath || !values.out) {
    console.error('usage: render.mjs <manifest.json> --out <index.html> [--audio <audio/index.json>] [--previous <rounds/N>] [--round N]');
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const audioIndex = values.audio && existsSync(values.audio) ? JSON.parse(readFileSync(values.audio, 'utf8')) : {};
  const previous = values.previous ? readPrevious(values.previous) : null;
  writeFileSync(values.out, render(manifest, { audioIndex, previous, round: Number(values.round) }));
  console.log(`rendered ${manifest.sections.length} section(s) to ${values.out}`);
}
