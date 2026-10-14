import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunksWithin, splitSentences } from '../scripts/tts/split.mjs';

const byWords = async (text) => text.split(/\s+/).length;

test('splitSentences splits after a spoken file name and keeps dotted abbreviations together', () => {
  assert.deepEqual(splitSentences('It lives in proposal run dot j s. It produces leg key. Done.'), ['It lives in proposal run dot j s.', 'It produces leg key.', 'Done.']);
  assert.deepEqual(splitSentences('The U.S. Army marched. Then e.g. this one.'), ['The U.S. Army marched.', 'Then e.g. this one.']);
  assert.deepEqual(splitSentences('Is it done? Yes! Quite.'), ['Is it done?', 'Yes!', 'Quite.']);
  assert.deepEqual(splitSentences('He said "stop." Then left.'), ['He said "stop."', 'Then left.']);
  assert.deepEqual(splitSentences('  one\n\ntwo  '), ['one two']);
});

test('chunksWithin keeps sentences under the limit whole', async () => {
  assert.deepEqual(await chunksWithin('One two three. Four five.', byWords, 3), ['One two three.', 'Four five.']);
});

test('chunksWithin falls back to clauses, then commas, packing as many as fit', async () => {
  const text = 'a b; c d; e f; g h.';
  assert.deepEqual(await chunksWithin(text, byWords, 4), ['a b; c d;', 'e f; g h.']);
  assert.deepEqual(await chunksWithin('a b, c d, e f.', byWords, 4), ['a b, c d,', 'e f.']);
  assert.deepEqual(await chunksWithin('a b: c, d e, f g; h i.', byWords, 4), ['a b:', 'c, d e,', 'f g;', 'h i.']);
});

test('chunksWithin refuses a clause that cannot fit', async () => {
  await assert.rejects(() => chunksWithin('one two three four five.', byWords, 3), /exceeds the Kokoro limit of 3 phoneme tokens \(5\): "one two three four five\."/);
});
