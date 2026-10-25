// entities.ts: find an entity however it is named, walk its links, search every entity's text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EntityGraph, type EntityRef, fold, keyOf } from '../src/shared/entities.ts';

type E = EntityRef & { vendor?: string };
const phone: E = { kind: 'device', id: 'aa:bb:cc:00:00:01', name: 'Telemóvel do Diogo', aka: ['pixel-7'], vendor: 'Google' };
const tv: E = { kind: 'device', id: 'aa:bb:cc:00:00:02', name: 'Sala TV', vendor: 'Samsung' };
const laptop: E = { kind: 'device', id: 'aa:bb:cc:00:00:03', name: 'thinkpad' };
const google: E = { kind: 'domain', id: 'google.com', name: 'Google' };
const netflix: E = { kind: 'domain', id: 'netflix.com', name: 'Netflix' };
const graph = new EntityGraph<E>(
  [phone, tv, laptop, google, netflix],
  [
    { from: keyOf(phone), to: keyOf(google), rel: 'talks-to', weight: 500 },
    { from: keyOf(phone), to: keyOf(netflix), rel: 'talks-to', weight: 900 },
    { from: keyOf(tv), to: keyOf(netflix), rel: 'talks-to', weight: 9000 },
    { from: keyOf(laptop), to: keyOf(google), rel: 'talks-to', weight: 10 },
    { from: keyOf(laptop), to: 'device:gone', rel: 'talks-to' },
  ],
  (e) => e.vendor ?? '',
);

test('Found by key, id, name or other name, with case and accents aside, within a kind when asked', () => {
  assert.equal(graph.find('device:aa:bb:cc:00:00:02'), tv);
  assert.equal(graph.find('AA:BB:CC:00:00:02'), tv);
  assert.equal(graph.find('telemovel do diogo'), phone);
  assert.equal(graph.find('Pixel-7'), phone);
  assert.equal(graph.find('google'), graph.find('google.com'));
  assert.equal(graph.find('Google', 'domain'), google);
  assert.equal(graph.find('Google', 'device'), undefined);
});

test('Neighbours either way, heaviest first; a link to an entity not there is left out', () => {
  assert.deepEqual(
    graph.neighbours(keyOf(phone)).map((n) => [n.entity.id, n.out]),
    [
      ['netflix.com', true],
      ['google.com', true],
    ],
  );
  assert.deepEqual(
    graph.neighbours(keyOf(netflix)).map((n) => [n.entity.name, n.out]),
    [
      ['Sala TV', false],
      ['Telemóvel do Diogo', false],
    ],
  );
  assert.equal(graph.neighbours(keyOf(laptop)).length, 1);
  assert.equal(graph.allLinks().length, 4);
});

test('Linked: the links either way joined into one neighbour, weights added', () => {
  const g = new EntityGraph<E>(
    [phone, tv],
    [
      { from: keyOf(phone), to: keyOf(tv), rel: 'talks-to', weight: 10 },
      { from: keyOf(tv), to: keyOf(phone), rel: 'talks-to', weight: 5 },
    ],
  );
  assert.equal(g.neighbours(keyOf(phone)).length, 2);
  assert.deepEqual(
    g.linked(keyOf(phone)).map((n) => [n.entity.id, n.weight, n.out, n.in]),
    [[tv.id, 15, true, true]],
  );
});

test('Two steps: a device → the domains it talks to → the other devices that talk to them', () => {
  const others = graph.twoSteps(keyOf(phone));
  assert.deepEqual(
    others.map((o) => [o.entity.name, o.via.map((v) => v.id)]),
    [
      ['Sala TV', ['netflix.com']],
      ['thinkpad', ['google.com']],
    ],
  );
});

test('Search: every word, in names or the app’s text, with a line around it', () => {
  assert.deepEqual(
    graph.search('samsung').map((h) => h.entity.id),
    ['aa:bb:cc:00:00:02'],
  );
  assert.deepEqual(
    graph.search('telemovel google').map((h) => h.entity.name),
    ['Telemóvel do Diogo'],
  );
  assert.deepEqual(graph.search('  '), []);
  assert.equal(fold('Ç Á'), 'c a');
});
