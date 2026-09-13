const data = JSON.parse(document.getElementById('review-data').textContent);
const { sections, decisions, audioIndex } = data;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const transport = {
  async loadDraft() {
    const res = await fetch('draft.json', { cache: 'no-store' });
    return res.ok ? res.json() : null;
  },
  saveDraft: (state) => fetch('/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) }),
  submit: (payload) => fetch('/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
};

let state = initialState(sections, decisions, data.prefill, data.previousResolutions, data.round);
let saveTimer = null;
let currentSection = null;
let submitted = false;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await transport.saveDraft(state);
      $('#autosave').textContent = `Saved ${new Date().toLocaleTimeString()}`;
    } catch {
      $('#autosave').textContent = 'Not saved: server unreachable';
    }
  }, 400);
}

function sync() {
  for (const card of $$('article.card')) {
    const s = state.sections[card.dataset.section];
    card.dataset.verdict = s.verdict ?? '';
    card.dataset.heard = String(s.heard);
    if (s.verdict !== 'approved') delete card.dataset.collapsed;
    for (const b of $$('footer.verdict button', card)) b.classList.toggle('active', b.dataset.verdict === s.verdict);
    let list = $('.comments', card);
    if (!list) {
      list = document.createElement('div');
      list.className = 'comments';
      $('footer.verdict', card).before(list);
    }
    list.innerHTML = state.comments
      .filter((c) => c.anchor.sectionId === card.dataset.section)
      .map((c) => `<div class="pin" data-comment="${c.id}" data-type="${escape(c.type)}"><b>${c.type === 'question' ? 'Question' : 'Change'}</b> ${c.anchor.scope === 'section' ? '<span class="scope">Section</span>' : `<q>${escape(c.anchor.quote)}</q>`} ${escape(c.text)} <button class="remove" data-comment="${c.id}" title="Remove">×</button></div>`)
      .join('');
  }
  for (const row of $$('.decision')) {
    const d = state.decisions[row.dataset.decision];
    row.dataset.resolved = String(Boolean(d.resolution));
  }
  for (const seg of $$('#progress .seg')) {
    const s = state.sections[seg.dataset.section];
    seg.dataset.verdict = s.verdict ?? '';
    $('.fill', seg).style.width = s.heard ? '100%' : '0';
  }
  const c = counters(sections, decisions, state);
  $('#count-approved').textContent = `${c.approved} approved`;
  $('#count-commented').textContent = `${c.commented} commented`;
  $('#count-questioned').textContent = `${c.questioned} questioned`;
  $('#count-decisions').textContent = `${c.openDecisions} open decision${c.openDecisions === 1 ? '' : 's'}`;
  $('#comment-count').textContent = `${state.comments.length} comment${state.comments.length === 1 ? '' : 's'}`;
  const blockers = submitBlockers(sections, decisions, state);
  $('#blockers').textContent = blockers.join(' · ');
  $('#submit').disabled = blockers.length > 0;
}

const escape = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

function setVerdict(sectionId, verdict) {
  if (submitted) return;
  state.sections[sectionId].verdict = state.sections[sectionId].verdict === verdict ? null : verdict;
  sync();
  persist();
}

// ---------- current section tracking ----------
function setCurrentSection(sectionId) {
  if (!sectionId || sectionId === currentSection) return;
  if (currentSection) delete document.getElementById(currentSection).dataset.current;
  currentSection = sectionId;
  document.getElementById(currentSection).dataset.current = 'true';
}

const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting);
  if (!visible.length) return;
  const topmost = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
  setCurrentSection(topmost.target.dataset.section);
}, { threshold: 0.5 });
for (const card of $$('article.card')) sectionObserver.observe(card);

// ---------- audio ----------
const queue = buildQueue(sections).filter((p) => audioIndex[p.id]);
const player = new Audio();
let cursor = -1;
let speaking = null;

const targetElement = (p) => document.getElementById(['summary', 'interfaces', 'decisions', 'risks', 'ui'].includes(p.target) ? `${p.sectionId}-${p.target}` : p.target);

function playIndex(i) {
  if (i < 0 || i >= queue.length) return stop();
  cursor = i;
  const p = queue[i];
  player.src = `audio/${audioIndex[p.id].file}`;
  player.playbackRate = Number($('#speed').value);
  player.play();
  speaking?.classList.remove('speaking');
  speaking = targetElement(p);
  speaking?.classList.add('speaking');
  const card = document.getElementById(p.sectionId);
  delete card.dataset.collapsed;
  if (!interacting()) speaking?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setCurrentSection(p.sectionId);
  $('#now').textContent = $('h2', card).textContent;
  $('#toggle').textContent = '⏸';
  const own = queue.filter((q) => q.sectionId === p.sectionId);
  const done = own.indexOf(p);
  const seg = $$('#progress .seg').find((el) => el.dataset.section === p.sectionId);
  $('.fill', seg).style.width = `${(done / own.length) * 100}%`;
}

function stop() {
  player.pause();
  speaking?.classList.remove('speaking');
  speaking = null;
  $('#toggle').textContent = '▶';
  $('#now').textContent = 'Not playing';
}

player.addEventListener('ended', () => {
  const p = queue[cursor];
  const next = queue[cursor + 1];
  if (!next || next.sectionId !== p.sectionId) {
    state.sections[p.sectionId].heard = true;
    sync();
    persist();
  }
  playIndex(cursor + 1);
});

const playSection = (sectionId) => {
  const i = queue.findIndex((p) => p.sectionId === sectionId);
  if (i >= 0) playIndex(i);
  else document.getElementById(sectionId).scrollIntoView({ block: 'start', behavior: 'smooth' });
};

$('#toggle').addEventListener('click', () => {
  if (!player.paused) return stop();
  if (cursor >= 0 && player.src) {
    player.play();
    $('#toggle').textContent = '⏸';
    speaking = targetElement(queue[cursor]);
    speaking?.classList.add('speaking');
  } else playIndex(0);
});
$('#prev').addEventListener('click', () => playSection(sectionOrder(sections, currentSection, -1)));
$('#next').addEventListener('click', () => playSection(sectionOrder(sections, currentSection, 1)));
$('#speed').addEventListener('input', (e) => {
  player.playbackRate = Number(e.target.value);
  $('#speed-value').textContent = `${Number(e.target.value).toFixed(1)}×`;
});
for (const b of $$('button.play')) b.addEventListener('click', () => playSection(b.dataset.section));
for (const seg of $$('#progress .seg')) seg.addEventListener('click', () => playSection(seg.dataset.section));

// ---------- verdicts, decisions, cards ----------
function askForComment(sectionId, type, near) {
  if (submitted) return;
  if (commentOnSelection(sectionId, type)) return;
  const card = document.getElementById(sectionId);
  openPopover({ anchor: { sectionId, quote: $('h2', card).textContent.trim(), prefix: '', suffix: '', scope: 'section' }, near: near ?? $('footer.verdict', card), type });
}

for (const b of $$('footer.verdict button')) {
  b.addEventListener('click', () => {
    const sectionId = b.closest('article').dataset.section;
    if (b.dataset.verdict === 'approved') setVerdict(sectionId, 'approved');
    else askForComment(sectionId, b.dataset.verdict === 'questioned' ? 'question' : 'change', b);
  });
}
for (const input of $$('.decision input')) {
  input.addEventListener('change', () => {
    if (submitted) return;
    const id = input.closest('.decision').dataset.decision;
    state.decisions[id].resolution = input.value.trim() || null;
    sync();
    persist();
  });
}
for (const header of $$('article.card > header')) {
  header.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const card = header.parentElement;
    if (card.dataset.collapsed) delete card.dataset.collapsed;
    else if (state.sections[card.dataset.section].verdict === 'approved') card.dataset.collapsed = 'true';
  });
}
document.addEventListener('click', (e) => {
  if (submitted) return;
  const remove = e.target.closest('button.remove');
  if (remove) {
    const gone = state.comments.find((c) => c.id === remove.dataset.comment);
    state.comments = state.comments.filter((c) => c.id !== remove.dataset.comment);
    if (pending?.editing === remove.dataset.comment) closePopover();
    if (gone) refreshVerdict(gone.anchor.sectionId);
    sync();
    persist();
    return;
  }
  const pin = e.target.closest('.pin');
  if (pin) editComment(pin.dataset.comment);
});

// ---------- comments ----------
const popover = $('#popover');
let pending = null;
let popoverType = 'change';
const highlights = window.Highlight && window.CSS?.highlights ? CSS.highlights : null;
const sectionIndex = new Map(sections.map((s, i) => [s.id, i]));

const interacting = () => !popover.hidden || !(window.getSelection()?.isCollapsed ?? true);
const markRange = (range) => { if (highlights && range) highlights.set('review-selection', new Highlight(range)); };
const clearMark = () => highlights?.delete('review-selection');
const orderedComments = () => [...state.comments].sort((a, b) => (sectionIndex.get(a.anchor.sectionId) - sectionIndex.get(b.anchor.sectionId)) || (Number(a.id.slice(1)) - Number(b.id.slice(1))));

function setPopoverType(type) {
  popoverType = type;
  for (const b of $$('#comment-types button')) b.classList.toggle('active', b.dataset.type === type);
}

function placePopover(near) {
  const rect = near.getBoundingClientRect();
  popover.style.top = `${window.scrollY + rect.bottom + 8}px`;
  popover.style.left = `${Math.max(16, Math.min(window.scrollX + rect.left, window.scrollX + window.innerWidth - 340))}px`;
}

function updatePopoverNav() {
  const list = orderedComments();
  const i = pending?.editing ? list.findIndex((c) => c.id === pending.editing) : -1;
  $('#comment-prev').disabled = i <= 0;
  $('#comment-next').disabled = i < 0 || i >= list.length - 1;
}

function openPopover({ anchor, near, type = 'change', text = '', editing = null }) {
  pending = { anchor, editing };
  setPopoverType(type);
  $('#comment-text').value = text;
  $('#comment-save').textContent = editing ? 'Save' : 'Add comment';
  popover.hidden = false;
  placePopover(near);
  updatePopoverNav();
  $('#comment-text').focus();
}

function closePopover() {
  popover.hidden = true;
  pending = null;
  clearMark();
  window.getSelection()?.removeAllRanges();
}

function refreshVerdict(sectionId) {
  const own = state.comments.filter((c) => c.anchor.sectionId === sectionId);
  const section = state.sections[sectionId];
  if (own.some((c) => c.type === 'question')) section.verdict = 'questioned';
  else if (own.length) section.verdict = 'commented';
  else if (section.verdict !== 'approved') section.verdict = null;
}

function saveComment() {
  if (submitted || !pending) return;
  const text = $('#comment-text').value.trim();
  if (!text) return;
  const { anchor, editing } = pending;
  if (editing) {
    const c = state.comments.find((x) => x.id === editing);
    c.type = popoverType;
    c.text = text;
  } else state.comments.push({ id: `c${state.nextComment++}`, type: popoverType, text, anchor });
  refreshVerdict(anchor.sectionId);
  closePopover();
  sync();
  persist();
}

function anchorFromRange(range) {
  const card = range.commonAncestorContainer.parentElement?.closest('article.card');
  if (!card) return null;
  const before = document.createRange();
  before.selectNodeContents(card);
  before.setEnd(range.startContainer, range.startOffset);
  const after = document.createRange();
  after.selectNodeContents(card);
  after.setStart(range.endContainer, range.endOffset);
  const anchor = { sectionId: card.dataset.section, ...anchorFromSelection({ text: range.toString().trim(), before: before.toString(), after: after.toString() }), scope: 'text' };
  const block = range.commonAncestorContainer.parentElement?.closest('details.block');
  if (block) anchor.blockId = block.id;
  const ui = range.commonAncestorContainer.parentElement?.closest('figure.mockup');
  if (ui) anchor.uiId = ui.dataset.ui;
  return anchor;
}

function rangeFromAnchor(card, anchor) {
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
  const nodes = [];
  const starts = [];
  let text = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n);
    starts.push(text.length);
    text += n.data;
  }
  const exact = text.indexOf(anchor.prefix + anchor.quote + anchor.suffix);
  const offset = exact >= 0 ? exact + anchor.prefix.length : text.indexOf(anchor.quote);
  if (offset < 0 || !anchor.quote) return null;
  const locate = (pos) => {
    let i = starts.findLastIndex((s) => s <= pos);
    if (i < 0) i = 0;
    return [nodes[i], Math.min(pos - starts[i], nodes[i].data.length)];
  };
  const range = document.createRange();
  range.setStart(...locate(offset));
  range.setEnd(...locate(offset + anchor.quote.length));
  return range;
}

const rangeBox = (range) => ({ getBoundingClientRect: () => range.getBoundingClientRect() });

function commentOnSelection(sectionId = null, type = 'change') {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return false;
  const range = sel.getRangeAt(0);
  const anchor = anchorFromRange(range);
  if (!anchor || (sectionId && anchor.sectionId !== sectionId)) return false;
  markRange(range);
  openPopover({ anchor, near: range.getBoundingClientRect().height ? rangeBox(range) : range.startContainer.parentElement, type });
  return true;
}

function editComment(id) {
  if (submitted) return;
  const c = state.comments.find((x) => x.id === id);
  if (!c) return;
  const card = document.getElementById(c.anchor.sectionId);
  delete card.dataset.collapsed;
  clearMark();
  let near = $('footer.verdict', card);
  const range = c.anchor.scope === 'section' ? null : rangeFromAnchor(card, c.anchor);
  if (range) {
    markRange(range);
    near = rangeBox(range);
    range.startContainer.parentElement?.scrollIntoView({ block: 'center' });
  } else card.scrollIntoView({ block: 'center' });
  openPopover({ anchor: c.anchor, near, type: c.type, text: c.text, editing: id });
}

function moveComment(delta) {
  const list = orderedComments();
  const i = list.findIndex((c) => c.id === pending?.editing);
  const target = list[i + delta];
  if (!target) return;
  if ($('#comment-text').value.trim()) saveComment();
  else closePopover();
  editComment(target.id);
}

document.addEventListener('mouseup', (e) => {
  if (submitted) return;
  if (!(e.target instanceof Element) || popover.contains(e.target) || e.target.closest('button, input, select, textarea')) return;
  setTimeout(() => { if (popover.hidden) commentOnSelection(); }, 0);
});
for (const b of $$('button.comment-ui')) {
  b.addEventListener('click', () => {
    if (submitted) return;
    const figure = b.closest('figure.mockup');
    openPopover({ anchor: { sectionId: b.closest('article').dataset.section, quote: $('figcaption', figure).firstChild.textContent.trim(), prefix: '', suffix: '', scope: 'section', uiId: b.dataset.ui }, near: b, type: 'change' });
  });
}
for (const b of $$('#comment-types button')) b.addEventListener('click', () => setPopoverType(b.dataset.type));
$('#comment-prev').addEventListener('click', () => moveComment(-1));
$('#comment-next').addEventListener('click', () => moveComment(1));
$('#comment-cancel').addEventListener('click', closePopover);
$('#comment-save').addEventListener('click', saveComment);

// ---------- keyboard ----------
document.addEventListener('keydown', (e) => {
  if (submitted) return;
  if (e.target.closest('input, textarea, select')) return;
  const current = currentSection ?? sectionOrder(sections, null, 1);
  const go = (delta) => {
    setCurrentSection(sectionOrder(sections, currentSection, delta));
    document.getElementById(currentSection).scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  if (e.key === 'j') go(1);
  else if (e.key === 'k') go(-1);
  else if (e.key === ' ') { e.preventDefault(); $('#toggle').click(); }
  else if (e.key === 'c') { if (!commentOnSelection()) $('#blockers').textContent = 'Select some text first.'; }
  else if (e.key === 'a') setVerdict(current, 'approved');
  else if (e.key === 'q') askForComment(current, 'question');
  else if (e.key === '?') $('#help').hidden = !$('#help').hidden;
  else if (e.key === 'Escape') { closePopover(); $('#help').hidden = true; }
});

// ---------- submit ----------
$('#submit').addEventListener('click', async () => {
  const payload = buildSubmission({ round: data.round, planHash: data.planHash, sections, decisions, state, now: new Date().toISOString() });
  $('#submit').disabled = true;
  try {
    const res = await transport.submit(payload);
    if (!res.ok) throw new Error(await res.text());
    stop();
    submitted = true;
    $('#blockers').textContent = `Review submitted (${payload.outcome}). You can close this tab.`;
    $('#blockers').classList.add('done');
    $('#submit').hidden = true;
    for (const el of $$('button, input, textarea, select')) el.disabled = true;
  } catch (err) {
    $('#blockers').textContent = `Submit failed: ${err.message}`;
    $('#submit').disabled = false;
  }
});

// ---------- task map: pan, zoom, fullscreen ----------
let fitTaskMap = () => {};
const taskmap = $('#taskmap');
if (taskmap) {
  const view = $('.taskmap-view', taskmap);
  const canvas = $('.taskmap-canvas', taskmap);
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let drag = null;
  const apply = () => { canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
  fitTaskMap = () => {
    const cw = canvas.scrollWidth || 1;
    const ch = canvas.scrollHeight || 1;
    scale = Math.min(view.clientWidth / cw, view.clientHeight / ch, 2);
    tx = (view.clientWidth - cw * scale) / 2;
    ty = (view.clientHeight - ch * scale) / 2;
    apply();
  };
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = view.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const next = Math.min(6, Math.max(0.2, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    tx = px - (px - tx) * (next / scale);
    ty = py - (py - ty) * (next / scale);
    scale = next;
    apply();
  }, { passive: false });
  view.addEventListener('pointerdown', (e) => { drag = { x: e.clientX - tx, y: e.clientY - ty }; view.setPointerCapture(e.pointerId); });
  view.addEventListener('pointermove', (e) => { if (!drag) return; tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); });
  view.addEventListener('pointerup', () => { drag = null; });
  view.addEventListener('pointercancel', () => { drag = null; });
  $('[data-taskmap="fit"]', taskmap).addEventListener('click', fitTaskMap);
  $('[data-taskmap="full"]', taskmap).addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : taskmap.requestFullscreen()));
  document.addEventListener('fullscreenchange', () => setTimeout(fitTaskMap, 60));
}

// ---------- boot ----------
for (const md of $$('script[type="text/markdown"]')) {
  const target = $(`.md[data-md="${md.id.slice(3)}"]`);
  if (target && window.marked) target.innerHTML = marked.parse(md.textContent);
}
if (window.hljs) for (const code of $$('details.block pre code, .md pre code')) hljs.highlightElement(code);
if (window.mermaid) {
  mermaid.initialize({ startOnLoad: false, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default', flowchart: { useMaxWidth: false } });
  mermaid.run().then(fitTaskMap);
}
window.addEventListener('scroll', () => { state.scroll = window.scrollY; persist(); }, { passive: true });

(async () => {
  try { state = mergeDraft(state, await transport.loadDraft()); } catch {}
  sync();
  for (const row of $$('.decision')) {
    const value = state.decisions[row.dataset.decision].resolution;
    if (!value) continue;
    for (const input of $$('input', row)) {
      if (input.type === 'radio') input.checked = input.value === value;
      else input.value = value;
    }
  }
  if (state.scroll) window.scrollTo(0, state.scroll);
})();
