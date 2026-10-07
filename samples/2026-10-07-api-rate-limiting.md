# Add per-key rate limiting to the public API

## Context

The public REST API (`src/api/`, Express 4, Redis already in the stack for sessions) has no request limits. Two partners hit the search endpoint hard last month and the database saturated for everyone. Keys are issued per partner in `src/keys/service.js` and carry a `plan` field (`free`, `pro`).

## Approach

A token-bucket limiter keyed by API key, stored in Redis so every instance shares the count. Limits come from the key's plan, with a per-key override an admin can set in the console. Clients get the standard `RateLimit-*` headers on every response and a `429` with `Retry-After` when the bucket is empty. Nothing changes for unauthenticated routes.

Assume the Redis instance has room for one small hash per active key; it currently holds sessions only and runs at a few percent of its memory limit.

## Steps

### 1. Limiter module

Create `src/ratelimit/bucket.js` exporting `take(redis, key, { capacity, refillPerSecond })`, which runs a Lua script atomically (read bucket, refill by elapsed time, take one token, write back with a TTL of twice the refill window) and returns `{ allowed, remaining, resetSeconds }`.

```js
// src/ratelimit/bucket.js
const SCRIPT = `
local tokens = tonumber(redis.call('HGET', KEYS[1], 'tokens') or ARGV[1])
local updated = tonumber(redis.call('HGET', KEYS[1], 'updated') or ARGV[3])
local refill = (tonumber(ARGV[3]) - updated) * tonumber(ARGV[2])
tokens = math.min(tonumber(ARGV[1]), tokens + refill)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'updated', ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return { allowed, math.floor(tokens) }
`;

export async function take(redis, key, { capacity, refillPerSecond }) {
  const now = Date.now() / 1000;
  const ttl = Math.ceil((capacity / refillPerSecond) * 2);
  const [allowed, remaining] = await redis.eval(SCRIPT, 1, `rl:${key}`, capacity, refillPerSecond, now, ttl);
  return { allowed: allowed === 1, remaining, resetSeconds: Math.ceil((capacity - remaining) / refillPerSecond) };
}
```

Tests in `tests/ratelimit/bucket.test.js` against the test Redis: a fresh key allows `capacity` requests then refuses; tokens come back after the refill interval; two instances sharing the key share the count.

```js
// tests/ratelimit/bucket.test.js
import { test, expect } from 'vitest';
import { take } from '../../src/ratelimit/bucket.js';

test('a fresh key allows capacity requests then refuses', async () => { /* ... */ });
test('tokens refill with elapsed time', async () => { /* ... */ });
test('two callers sharing a key share the bucket', async () => { /* ... */ });
```

### 2. Middleware and plan limits

Create `src/ratelimit/middleware.js`: reads `req.apiKey` (set by the existing auth middleware in `src/auth/api-key.js`), resolves the limit from `src/ratelimit/limits.js` (`free`: 60 per minute, `pro`: 600 per minute, override from the key record when set), calls `take`, sets `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on every response, and answers `429` with `Retry-After` when refused. Mount it in `src/app.js` after auth, before the routers. Unauthenticated routes are not mounted behind it.

Confirm the default limits with the partner team before release: 60 and 600 per minute are placeholders from the incident post-mortem.

```js
// src/ratelimit/middleware.js
import { take } from './bucket.js';
import { limitFor } from './limits.js';

export function rateLimit(redis) {
  return async (req, res, next) => {
    const limit = limitFor(req.apiKey);
    const result = await take(redis, req.apiKey.id, limit);
    res.set('RateLimit-Limit', String(limit.capacity));
    res.set('RateLimit-Remaining', String(result.remaining));
    res.set('RateLimit-Reset', String(result.resetSeconds));
    if (!result.allowed) {
      res.set('Retry-After', String(result.resetSeconds));
      return res.status(429).json({ error: 'rate_limited' });
    }
    next();
  };
}
```

If Redis is unreachable the middleware lets the request through and logs once per minute; a Redis outage must not take the API down with it.

### 3. Admin override in the console

Add a `rateLimitPerMinute` integer field to the key record (`src/keys/schema.js`, migration `migrations/20261007-key-rate-limit.js`) and expose it on the key detail page of the admin console (`console/pages/keys/[id].vue`): a numeric input "Requests per minute" with the plan default shown as placeholder, a Save button, and a line "Overrides the pro plan limit of 600" when a value is set. Blank restores the plan default.

Open question: should the override also be settable through the keys API (`PATCH /admin/keys/:id`), or console only for now?

## Verification

- `npm test` green, including the three bucket tests and a middleware test that asserts the headers and the 429 body.
- Run `scripts/hammer.sh <key>` against a local instance: the 61st request within a minute on a free key returns 429 with `Retry-After`, and the headers count down on the earlier ones.
- Stop Redis, send a request, confirm it passes and one warning is logged.
