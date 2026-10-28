import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  aggregateLanguages,
  detectFrameworks,
  parseCargoDeps,
  parsePackageDeps,
  renderLanguagesTable,
  renderReposTable,
  replaceRegion,
} from './profile.mjs';

const repo = (over) => ({
  name: 'x',
  html_url: 'https://github.com/seaavey/x',
  fork: false,
  language: 'Rust',
  stargazers_count: 0,
  forks_count: 0,
  pushed_at: '2026-02-01T00:00:00Z',
  ...over,
});

test('replaceRegion swaps only the marked block', () => {
  const src = 'a\n<!-- AUTO:REPOS: x -->\nold\n<!-- /AUTO:REPOS -->\nb';
  assert.equal(replaceRegion(src, 'REPOS', 'new'), 'a\n<!-- AUTO:REPOS: x -->\nnew\n<!-- /AUTO:REPOS -->\nb');
});

test('replaceRegion throws when the markers are gone', () => {
  assert.throws(() => replaceRegion('no markers here', 'REPOS', 'new'), /AUTO:REPOS/);
});

test('replaceRegion is idempotent', () => {
  const src = '<!-- AUTO:REPOS -->\nold\n<!-- /AUTO:REPOS -->';
  const once = replaceRegion(src, 'REPOS', 'table');
  assert.equal(replaceRegion(once, 'REPOS', 'table'), once);
});

test('renderReposTable drops forks and the profile repo, orders by stars', () => {
  const table = renderReposTable(
    [
      repo({ name: 'zeta', stargazers_count: 2, forks_count: 1 }),
      repo({ name: 'seaavey' }),
      repo({ name: 'forked', fork: true }),
      repo({ name: 'alpha', stargazers_count: 9, language: null }),
    ],
    'seaavey',
  );
  const rows = table.split('\n').slice(2);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /\[alpha\]/);
  assert.match(rows[0], /\|\s+none\s+\|/);
  assert.match(rows[1], /\[zeta\]/);
  assert.ok(!table.includes('forked') && !table.includes('[seaavey]'));
});

test('renderReposTable prints the API push date as is', () => {
  const row = renderReposTable([repo({})], 'seaavey').split('\n')[2];
  assert.match(row, /\| 2026-02-01 \|$/);
});

test('parsePackageDeps reads dependencies, not devDependencies', () => {
  const deps = parsePackageDeps('{"dependencies":{"vue":"1"},"devDependencies":{"vitest":"2"}}');
  assert.deepEqual(deps, ['vue']);
});

test('parseCargoDeps reads the dependencies section only', () => {
  const toml = [
    '[package]',
    'name = "x"',
    '[dependencies]',
    'axum = "0.8"',
    'serde = { version = "1", features = ["derive"] }',
    '[dev-dependencies]',
    'criterion = "0.5"',
    '[dependencies.reqwest]',
    'version = "0.12"',
  ].join('\n');
  assert.deepEqual(parseCargoDeps(toml), ['axum', 'serde', 'reqwest']);
});

test('aggregateLanguages sums bytes across repos and ranks them', () => {
  const [first, second] = aggregateLanguages([{ Rust: 300, Shell: 100 }, { Rust: 600 }]);
  assert.equal(first.lang, 'Rust');
  assert.equal(first.bytes, 900);
  assert.equal(first.share, 90);
  assert.equal(second.share, 10);
});

test('detectFrameworks matches scoped packages and sorts by repo count', () => {
  const found = detectFrameworks([
    { name: 'a', deps: ['@radix-ui/react-dialog', 'vue'] },
    { name: 'b', deps: ['vue'] },
    { name: 'c', deps: ['serde'] },
  ]);
  assert.deepEqual(found[0], { name: 'Vue', repos: ['a', 'b'] });
  assert.deepEqual(found[1], { name: 'Radix UI', repos: ['a'] });
  assert.equal(found.length, 2);
});

test('renderLanguagesTable caps the table at eight rows', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ lang: `L${i}`, bytes: 100 - i, share: 1 }));
  assert.equal(renderLanguagesTable(rows).split('\n').length, 10);
});
