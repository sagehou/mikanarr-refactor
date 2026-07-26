const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePattern, parsePositiveId } = require('../server/patternValidation');

const validPattern = Object.freeze({
  remote: 'https://mikanani.me/RSS/Bangumi?bangumiId=1',
  pattern: '\\[Group\\] Show - (?<episode>\\d+)',
  series: 'Show',
  season: '1',
  language: 'Chinese',
  quality: 'WEBDL 1080p',
  offset: 0,
  releasegroup: 'Group'
});

test('normalizes input and removes client-owned metadata', () => {
  const result = validatePattern({
    ...validPattern,
    id: 99,
    created_at: 'forged',
    last_matched_at: 'forged',
    match_count: 900,
    series: '  Show  '
  });
  assert.deepEqual(result, { ...validPattern, series: 'Show' });
});

test('rejects a regular expression without the named episode group', () => {
  assert.throws(() => validatePattern({ ...validPattern, pattern: '(\\d+)' }));
  assert.throws(() => validatePattern({ ...validPattern, pattern: '[(?<episode>)]+' }));
});

test('rejects invalid regular expression syntax', () => {
  assert.throws(() => validatePattern({ ...validPattern, pattern: '(?<episode>' }));
});

test('rejects a nested-quantifier regular expression', () => {
  assert.throws(() => validatePattern({ ...validPattern, pattern: '(?<episode>(a+)+)' }));
});

test('rejects Mikan URLs containing userinfo', () => {
  assert.throws(() => validatePattern({ ...validPattern, remote: 'https://user:secret@mikanani.me/RSS/Bangumi' }));
});

test('rejects a hostname that only starts with the Mikan hostname', () => {
  assert.throws(() => validatePattern({ ...validPattern, remote: 'https://mikanani.me.attacker.example/RSS/Bangumi' }));
});

test('rejects non-integer and out-of-range offsets', () => {
  for (const offset of [1.5, Number.NaN, 100001, -100001]) {
    assert.throws(() => validatePattern({ ...validPattern, offset }), String(offset));
  }
});

test('rejects fields over their maximum lengths', () => {
  for (const [field, length] of [
    ['pattern', 1001], ['series', 201], ['season', 9], ['remote', 2049],
    ['language', 101], ['quality', 101], ['releasegroup', 101]
  ]) {
    assert.throws(() => validatePattern({ ...validPattern, [field]: 'x'.repeat(length) }), field);
  }
});

test('applies optional field defaults and accepts an empty remote', () => {
  assert.deepEqual(validatePattern({
    pattern: '(?<episode>\\d+)', series: 'Show', season: '1'
  }), {
    remote: '', pattern: '(?<episode>\\d+)', series: 'Show', season: '1',
    language: 'Chinese', quality: 'WEBDL 1080p', offset: 0, releasegroup: ''
  });
});

test('parses only positive integer resource IDs', () => {
  assert.equal(parsePositiveId('12'), 12);
  for (const id of ['', '0', '-1', '1.5', '1x', String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.throws(() => parsePositiveId(id), id);
  }
});
