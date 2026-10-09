// Demo transport: the draft lives in localStorage and Submit shows the submission instead of handing it to Claude.
(() => {
  const KEY = 'plan-review-demo-draft';
  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const write = (value) => { try { localStorage.setItem(KEY, value); } catch {} };
  const reset = () => { try { localStorage.removeItem(KEY); } catch {} location.reload(); };
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === 'draft.json') { const draft = read(); return draft ? json(JSON.parse(draft)) : Promise.resolve(new Response('', { status: 404 })); }
    if (url === '/draft' && init.method === 'POST') { write(init.body); return json({ ok: true }); }
    if (url === '/submit' && init.method === 'POST') { setTimeout(() => showSubmission(init.body), 0); return json({ ok: true }); }
    return nativeFetch(input, init);
  };

  function showSubmission(body) {
    const submission = JSON.parse(body);
    const pretty = JSON.stringify(submission, null, 2);
    const dialog = document.createElement('dialog');
    dialog.id = 'demo-submission';
    dialog.innerHTML = `
      <h2>What Claude receives</h2>
      <p>On a real review this JSON lands in the plan's review folder and the <code>plan-review-respond</code> skill answers every comment, resolves the decisions, revises the plan and opens round 2 with the changed sections badged.</p>
      <pre></pre>
      <div class="actions"><a download="submission.json">Download JSON</a><button type="button" class="again">Start over</button><button type="button" class="close">Close</button></div>`;
    dialog.querySelector('pre').textContent = pretty;
    dialog.querySelector('a').href = URL.createObjectURL(new Blob([`${pretty}\n`], { type: 'application/json' }));
    dialog.querySelector('.again').addEventListener('click', reset);
    dialog.querySelector('.close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
    dialog.showModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('demo-reset')?.addEventListener('click', (e) => { e.preventDefault(); reset(); });
  });
})();
