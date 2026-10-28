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

function yearRange(created, pushed) {
  const from = new Date(created).getUTCFullYear();
  const to = new Date(pushed).getUTCFullYear();
  return from === to ? `${from}` : `${from}—${to}`;
}

export function renderReposTable(repos, user) {
  const rows = repos
    .filter((r) => !r.fork && r.name !== user)
    .sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at))
    .map((r, i) => ({
      id: `A—${String(i + 1).padStart(2, '0')}`,
      repo: `[${r.name} ↗](${r.html_url})`,
      lang: (r.language || '—').toUpperCase(),
      state: `★ ${r.stargazers_count} · ⑂ ${r.forks_count}`,
      year: yearRange(r.created_at, r.pushed_at),
    }));

  const head = { id: 'ID', repo: 'REPOSITORY', lang: 'LANG', state: 'STATE', year: 'YEAR' };
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
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': `${USER}-profile-assets`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${pathname} → ${res.status} ${res.statusText}`);
  return res.json();
}

function renderBanner(c, metrics) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300" viewBox="0 0 1200 300" role="img" aria-labelledby="bannerTitle bannerDesc">
  <title id="bannerTitle">( SEAVX ) — Muhammad Adriansyah, full stack website developer &amp; building designer</title>
  <desc id="bannerDesc">Monochrome brutalist banner: paper canvas, 1px hairline frame, technical telemetry strips, and a blueprint schematic panel.</desc>

  <style>
    .bg { fill: ${c.paper}; }
    .hair { fill: none; stroke: ${c.hair}; stroke-width: 1; }
    .fg { fill: ${c.ink}; }
    .dim { fill: ${c.muted}; }
    .mono {
      font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
    }
    .micro { font-size: 10px; }
    .bold { font-weight: 700; }
    .hero {
      font-family: "Plus Jakarta Sans", Inter, "Helvetica Neue", Arial, sans-serif;
      font-size: 82px;
      font-weight: 800;
      letter-spacing: -3.6px;
    }
    .gridfill { fill: url(#blueprint); }
    .ring { fill: none; stroke: ${c.hair}; stroke-width: 1; opacity: 0.28; }
    .axis { fill: none; stroke: ${c.hair}; stroke-width: 1; opacity: 0.35; stroke-dasharray: 2 5; }
  </style>

  <defs>
    <pattern id="blueprint" width="22" height="22" patternUnits="userSpaceOnUse">
      <path d="M22 0V22H0" fill="none" stroke="#808080" stroke-opacity="0.13" stroke-width="1" />
    </pattern>
  </defs>

  <rect class="bg" x="0" y="0" width="1200" height="300" />
  <rect class="hair" x="0.5" y="0.5" width="1199" height="299" />

  <!-- FIG 00.A — blueprint schematic panel -->
  <rect class="gridfill" x="760" y="36" width="440" height="240" />
  <g>
    <circle class="ring" cx="980" cy="156" r="20" />
    <circle class="ring" cx="980" cy="156" r="30" />
    <circle class="ring" cx="980" cy="156" r="40" />
    <circle class="ring" cx="980" cy="156" r="50" />
    <circle class="ring" cx="980" cy="156" r="60" />
    <circle class="ring" cx="980" cy="156" r="70" />
    <circle class="ring" cx="980" cy="156" r="80" />
    <circle class="ring" cx="980" cy="156" r="90" />
    <circle class="ring" cx="980" cy="156" r="100" />
    <circle class="ring" cx="980" cy="156" r="110" />
    <line class="axis" x1="776" y1="156" x2="1184" y2="156" />
    <line class="axis" x1="980" y1="52" x2="980" y2="260" />
    <circle class="fg" cx="980" cy="156" r="3" />
  </g>

  <!-- Structural rules -->
  <line class="hair" x1="0" y1="36" x2="1200" y2="36" />
  <line class="hair" x1="760" y1="36" x2="760" y2="276" />
  <line class="hair" x1="0" y1="240" x2="760" y2="240" />
  <line class="hair" x1="0" y1="276" x2="1200" y2="276" />

  <!-- Top strip -->
  <text class="mono fg" x="20" y="24">[ SECTION 00 // PROFILE MANIFEST ]</text>
  <text class="mono dim" x="1180" y="24" text-anchor="end">@${USER.toUpperCase()}</text>

  <!-- Studio badge -->
  <rect class="hair" x="20" y="52" width="180" height="22" />
  <text class="mono micro dim" x="30" y="67">STUDIO //</text>
  <text class="mono bold fg" x="100" y="67">( SEAVX )</text>

  <!-- Wordmark -->
  <text class="hero fg" x="20" y="150">MUHAMMAD</text>
  <text class="hero fg" x="20" y="224">ADRIANSYAH</text>

  <!-- Telemetry -->
  <text class="mono micro dim" x="20" y="260">+ DISCIPLINE // FULL STACK WEB &amp; BUILDING / SYSTEMS DESIGN</text>
  <text class="mono micro dim" x="740" y="260" text-anchor="end">[ COORDS: 6.9175° S, 107.6191° E ]</text>

  <!-- Bottom strip -->
  <text class="mono micro fg" x="20" y="294">${metrics}</text>
  <text class="mono micro dim" x="1180" y="294" text-anchor="end">BANDUNG, ID (UTC/GMT +7)</text>

  <!-- Panel captions -->
  <text class="mono micro dim" x="776" y="56">FIG 00.A — SCHEMATIC</text>
  <text class="mono micro dim" x="1184" y="256" text-anchor="end">SCALE 1:1 // SVG</text>
</svg>
`;
}

export function replaceRegion(source, name, body) {
  const region = new RegExp(`(<!-- AUTO:${name}[^>]*-->)[\\s\\S]*?(<!-- /AUTO:${name} -->)`);
  if (!region.test(source)) throw new Error(`README is missing the AUTO:${name} markers`);
  return source.replace(region, `$1\n${body}\n$2`);
}

async function main() {
  const [user, repos] = await Promise.all([api(`/users/${USER}`), api(`/users/${USER}/repos?per_page=100&type=owner&sort=pushed`)]);

  const stars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
  const metrics = `${user.public_repos} PUBLIC REPOS · ${user.followers} FOLLOWERS · ${stars} STARS`;

  const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
  const banner = { light: renderBanner(COLORS.light, metrics), dark: renderBanner(COLORS.dark, metrics) };

  await Promise.all([
    writeFile(path.join(ROOT, 'profile/banner-light.svg'), banner.light),
    writeFile(path.join(ROOT, 'profile/banner-dark.svg'), banner.dark),
    writeFile(path.join(ROOT, 'README.md'), replaceRegion(readme, 'REPOS', renderReposTable(repos, USER))),
  ]);

  console.log(`Synced ${USER}: ${metrics}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}