import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foreignWords, scriptsFor, voiceLanguage } from '../scripts/tts/script.mjs';

test('foreignWords lists the words whose letters fall outside the voice scripts', () => {
  assert.deepEqual(foreignWords('presses "Σύγκριση δρομολογίων", then Γλυφάδα, Κηφισιά, Γλυφάδα', ['Latin']), ['Σύγκριση', 'δρομολογίων', 'Γλυφάδα', 'Κηφισιά']);
  assert.deepEqual(foreignWords('café, naïve, 4 oh 3 — slash api', ['Latin']), []);
  assert.deepEqual(foreignWords('Το κουμπί «Εφαρμογή» γράφει', ['Greek']), []);
  assert.deepEqual(foreignWords('Το κουμπί Apply γράφει', ['Greek']), ['Apply']);
  assert.deepEqual(foreignWords('', ['Latin']), []);
});

test('scriptsFor maps a voice language to the scripts it reads, Latin by default', () => {
  assert.deepEqual(scriptsFor('el_GR'), ['Greek']);
  assert.deepEqual(scriptsFor('en-US'), ['Latin']);
  assert.deepEqual(scriptsFor('ru_RU'), ['Cyrillic']);
  assert.deepEqual(scriptsFor('ja_JP'), ['Hiragana', 'Katakana', 'Han']);
  assert.deepEqual(scriptsFor('xx'), ['Latin']);
});

const listing = [
  'Jamie (Premium)     en_GB    # Hello! My name is Jamie.',
  'Melina              el_GR    # Χαίρετε! Το όνομά μου είναι «Μελίνα».',
  'Melina (Enhanced)   el_GR    # Χαίρετε! Το όνομά μου είναι «Μελίνα».',
  'Samantha (English (US)) en_US    # Hello! My name is Samantha.',
  'Samantha (Enhanced) en_US    # Hello! My name is Samantha.',
].join('\n');

test('voiceLanguage reads the language code of a voice from the say listing', () => {
  assert.equal(voiceLanguage(listing, 'Melina'), 'el_GR');
  assert.equal(voiceLanguage(listing, 'Jamie (Premium)'), 'en_GB');
  assert.equal(voiceLanguage(listing, 'Samantha'), 'en_US');
  assert.equal(voiceLanguage(listing, 'Nobody'), null);
});
