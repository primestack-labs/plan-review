import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../scripts/lib/schema.mjs';

const schema = {
  type: 'object',
  required: ['id', 'tags'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { enum: ['a', 'b'] },
    tags: { type: 'array', minItems: 1, items: { type: 'string' } },
    meta: { type: 'object', additionalProperties: { type: 'number' } },
    version: { const: 1 },
  },
};

test('accepts a conforming value', () => {
  assert.deepEqual(validate(schema, { id: 'x', kind: 'a', tags: ['t'], meta: { n: 1 }, version: 1 }), []);
});

test('reports missing required, bad enum, short array, unexpected key, in that order', () => {
  assert.deepEqual(validate(schema, { kind: 'c', tags: [], extra: 1 }), [
    '$.id: required',
    '$.kind: expected one of a, b',
    '$.tags: at least 1 item(s)',
    '$.extra: unexpected property',
  ]);
});

test('reports nested paths and const', () => {
  assert.deepEqual(validate(schema, { id: '', tags: [1], meta: { n: 'no' }, version: 2 }), [
    '$.id: must be at least 1 character(s)',
    '$.tags[0]: expected string, got number',
    '$.meta.n: expected number, got string',
    '$.version: expected 1',
  ]);
});

test('a type mismatch stops descending into that value', () => {
  assert.deepEqual(validate(schema, { id: 'x', tags: 'nope' }), ['$.tags: expected array, got string']);
});
