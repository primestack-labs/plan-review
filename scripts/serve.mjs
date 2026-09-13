import { createServer } from 'node:http';
import { existsSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validate } from './lib/schema.mjs';
import { SUBMISSION_SCHEMA } from './validate.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.m4a': 'audio/mp4' };

const send = (res, status, type, body) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
};

const readBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => resolve(body));
  req.on('error', reject);
});

class InvalidJsonError extends Error {}

const readJson = async (req) => {
  const body = await readBody(req);
  try {
    return JSON.parse(body);
  } catch {
    throw new InvalidJsonError('invalid JSON body');
  }
};

const allowed = (rel) => rel === 'index.html' || rel === 'draft.json' || (rel.startsWith('audio/') && !rel.includes('..'));

export function createReviewServer({ dir, round, planHash, onSubmit }) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'POST' && url.pathname === '/draft') {
        const body = await readJson(req);
        await writeFile(join(dir, 'draft.json'), JSON.stringify(body));
        return send(res, 200, 'application/json', '{"ok":true}');
      }
      if (req.method === 'POST' && url.pathname === '/submit') {
        const submission = await readJson(req);
        const errors = validate(SUBMISSION_SCHEMA, submission);
        if (errors.length) return send(res, 400, 'text/plain', errors.join('\n'));
        if (submission.round !== round) return send(res, 409, 'text/plain', `this page is round ${round}, the submission says round ${submission.round}`);
        if (submission.planHash !== planHash) return send(res, 409, 'text/plain', 'the plan changed since this page was rendered; rerun /plan-review');
        const roundDir = join(dir, 'rounds', String(round));
        await mkdir(roundDir, { recursive: true });
        const path = join(roundDir, 'submission.json');
        await writeFile(path, `${JSON.stringify(submission, null, 2)}\n`);
        await copyFile(join(dir, 'manifest.json'), join(roundDir, 'manifest.json'));
        send(res, 200, 'application/json', JSON.stringify({ ok: true, path }));
        onSubmit?.(path);
        return;
      }
      if (req.method !== 'GET') return send(res, 405, 'text/plain', 'method not allowed');
      const rel = url.pathname === '/' ? 'index.html' : normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '');
      const path = join(dir, rel);
      if (!allowed(rel) || !existsSync(path)) return send(res, 404, 'text/plain', 'not found');
      return send(res, 200, TYPES[extname(path)] ?? 'application/octet-stream', await readFile(path));
    } catch (err) {
      if (err instanceof InvalidJsonError) return send(res, 400, 'text/plain', err.message);
      return send(res, 500, 'text/plain', err.message);
    }
  });
}

if (realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { dir: { type: 'string' }, round: { type: 'string' }, 'no-open': { type: 'boolean', default: false } } });
  if (!values.dir || !values.round) {
    console.error('usage: serve.mjs --dir <reviewDir> --round <n> [--no-open]');
    process.exit(2);
  }
  const manifest = JSON.parse(await readFile(join(values.dir, 'manifest.json'), 'utf8'));
  const server = createReviewServer({
    dir: values.dir,
    round: Number(values.round),
    planHash: manifest.plan.hash,
    onSubmit: (path) => {
      console.log(`submitted: ${path}`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1000).unref();
    },
  });
  server.listen(0, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${server.address().port}/`;
    console.log(`listening: ${url}`);
    if (!values['no-open']) spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
  });
}
