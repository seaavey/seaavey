import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderReposTable, replaceRegion } from './profile.mjs';

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
