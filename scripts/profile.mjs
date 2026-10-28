#!/usr/bin/env node
/**
 * Regenerates the profile's live assets from the GitHub REST API:
 *   profile/banner-light.svg, profile/banner-dark.svg and the README repository table.
 * Runs in .github/workflows/profile-stats.yml; locally: GITHUB_TOKEN=... node scripts/profile.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const USER = process.env.GITHUB_REPOSITORY_OWNER || 'seaavey';

const COLORS = {
  light: { paper: '#f7f7f5', ink: '#0a0a0a', muted: '#525250', hair: '#0a0a0a' },
  dark: { paper: '#0a0a0a', ink: '#f7f7f5', muted: '#969692', hair: '#2a2a2a' },
};

export function renderReposTable(repos, user) {
  const rows = repos
    .filter((r) => !r.fork && r.name !== user)
    .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at))
    .map((r) => ({
      repo: `[${r.name}](${r.html_url})`,
      lang: r.language || 'none',
      stars: String(r.stargazers_count),
      forks: String(r.forks_count),
      updated: r.pushed_at.slice(0, 10),
    }));

  const head = { repo: 'REPOSITORY', lang: 'LANGUAGE', stars: 'STARS', forks: 'FORKS', updated: 'LAST PUSH' };
  const cols = Object.keys(head);
  const width = Object.fromEntries(
    cols.map((c) => [c, Math.max(head[c].length, ...rows.map((r) => r[c].length))]),
  );
  const line = (r) => `| ${cols.map((c) => r[c].padEnd(width[c])).join(' | ')} |`;
  const rule = `| ${cols.map((c) => ':'.padEnd(width[c], '-')).join(' | ')} |`;

  return [line(head), rule, ...rows.map(line)].join('\n');
}

async function api(pathname) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': `${USER}-profile-assets`,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com${pathname}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${pathname} returned ${res.status} ${res.statusText}`);
  return res.json();
}

function renderBanner(c, { wordmark, role, metrics, location }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="210" viewBox="0 0 1200 210" role="img" aria-labelledby="bannerTitle bannerDesc">
  <title id="bannerTitle">${wordmark} on GitHub</title>
  <desc id="bannerDesc">${role}. ${metrics}. ${location}.</desc>

  <style>
    .bg { fill: ${c.paper}; }
    .hair { fill: none; stroke: ${c.hair}; stroke-width: 1; }
    .fg { fill: ${c.ink}; }
    .dim { fill: ${c.muted}; }
    .mono {
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.06em;
    }
    .word {
      font-family: "Plus Jakarta Sans", Inter, "Helvetica Neue", Arial, sans-serif;
      font-size: 120px;
      font-weight: 800;
      letter-spacing: -5px;
    }
  </style>

  <rect class="bg" x="0" y="0" width="1200" height="210" />
  <rect class="hair" x="0.5" y="0.5" width="1199" height="209" />

  <text class="mono dim" x="24" y="28">${role}</text>
  <line class="hair" x1="0" y1="40" x2="1200" y2="40" />

  <text class="word fg" x="20" y="134">${wordmark}</text>

  <line class="hair" x1="0" y1="156" x2="1200" y2="156" />
  <text class="mono fg" x="24" y="184">${metrics}</text>
  <text class="mono dim" x="1176" y="184" text-anchor="end">${location}</text>
</svg>
`;
}

export function replaceRegion(source, name, body) {
  const region = new RegExp(`(<!-- AUTO:${name}[^>]*-->)[\\s\\S]*?(<!-- /AUTO:${name} -->)`);
  if (!region.test(source)) throw new Error(`README is missing the AUTO:${name} markers`);
  return source.replace(region, `$1\n${body}\n$2`);
}

async function main() {
  const [user, repos] = await Promise.all([
    api(`/users/${USER}`),
    api(`/users/${USER}/repos?per_page=100&type=owner&sort=pushed`),
  ]);

  const stars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
  const payload = {
    wordmark: (user.name || user.login).toUpperCase(),
    role: (user.bio || '').toUpperCase().slice(0, 90),
    metrics: `${user.public_repos} PUBLIC REPOS · ${user.followers} FOLLOWERS · ${stars} STARS`,
    location: (user.location || '').toUpperCase(),
  };

  const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');

  await Promise.all([
    writeFile(path.join(ROOT, 'profile/banner-light.svg'), renderBanner(COLORS.light, payload)),
    writeFile(path.join(ROOT, 'profile/banner-dark.svg'), renderBanner(COLORS.dark, payload)),
    writeFile(path.join(ROOT, 'README.md'), replaceRegion(readme, 'REPOS', renderReposTable(repos, USER))),
  ]);

  console.log(`Synced ${USER}: ${payload.wordmark} · ${payload.metrics}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
