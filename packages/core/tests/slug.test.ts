// slug.ts and the pure parts of web.ts and llm.ts: slugs (old ids must keep working), which addresses the API agent
// may read, and a model's thinking left out of its answer. From Galen's tests/unit.test.ts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripThinking } from '../src/server/llm.ts';
import { legacySlugify, slugCandidates, slugify } from '../src/server/slug.ts';
import { isPublic } from '../src/server/web.ts';

test('Slugs: Latin titles keep the ids they always had; other scripts get ids of their own', () => {
  for (const title of ['Café au lait!', 'Differential forms', "Newton's laws", 'How the heart keeps time', 'Gödel']) {
    assert.equal(slugify(title), legacySlugify(title), title);
  }
  assert.equal(slugify('Ἀρετή'), 'αρετη');
  assert.equal(slugify('日本語の文法'), '日本語の文法');
  assert.equal(slugify('Москва — столица'), 'москва-столица');
  assert.equal(slugify('!!!'), 'untitled');
  assert.ok(slugify('x'.repeat(80)).length <= 48);
  // A title whose old id differs is still found under it; "untitled" is never a candidate for another script.
  assert.deepEqual(slugCandidates('Straße'), ['straße', 'stra-e']);
  assert.deepEqual(slugCandidates('Ἀρετή'), ['αρετη']);
});

test('The API agent reads only public addresses, and never sees a model’s thinking as its answer', () => {
  // Never this machine or the local network, so a page can't steer the agent into the app's own API or a router.
  for (const ip of ['127.0.0.1', '10.0.0.2', '192.168.1.1', '172.20.0.1', '169.254.1.1', '::1', 'fd00::1', '::ffff:127.0.0.1'])
    assert.equal(isPublic(ip), false, ip);
  assert.equal(isPublic('93.184.216.34'), true);
  assert.equal(isPublic('2606:4700::1111'), true);
  assert.equal(stripThinking('<think>hmm</think>  The answer.'), 'The answer.');
  assert.equal(stripThinking('The answer.'), 'The answer.');
});
