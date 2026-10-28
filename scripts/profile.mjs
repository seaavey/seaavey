#!/usr/bin/env node
/**
 * Regenerates the profile's live assets from the GitHub REST API:
 *   profile/banner-light.svg, profile/banner-dark.svg and the README tables.
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

/* Vocabulary, not data: a dependency only counts as a framework if it matches here.
   Presence and counts always come from the repository manifests. */
const FRAMEWORKS = {
  React: ['react', 'react-dom'],
  Vue: ['vue'],
  'TanStack Query': ['@tanstack/react-query', '@tanstack/vue-query'],
  'TanStack Router': ['@tanstack/react-router'],
  'TanStack Table': ['@tanstack/vue-table'],
  TailwindCSS: ['tailwindcss', '@tailwindcss/vite'],
  shadcn: ['shadcn', 'shadcn-vue'],
  'Radix UI': ['@radix-ui/react'],
  'Reka UI': ['reka-ui'],
  Motion: ['motion'],
  Supabase: ['@supabase/supabase-js'],
  Baileys: ['baileys', '@whiskeysockets/baileys'],
  Axum: ['axum'],
  Tokio: ['tokio'],
  SQLx: ['sqlx'],
  Ratatui: ['ratatui'],
  rmcp: ['rmcp'],
  genai: ['genai'],
};

export function parsePackageDeps(text) {
  return Object.keys(JSON.parse(text).dependencies || {});
}

export function parseCargoDeps(text) {
  const deps = [];
  let section = '';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      section = line.replace(/[[\]]/g, '').trim();
      if (section.startsWith('dependencies.') || section.startsWith('workspace.dependencies.')) {
        deps.push(section.split('.').pop());
      }
      continue;
    }
    if (section === 'dependencies' || section === 'workspace.dependencies') {
      deps.push(line.split('=')[0].trim());
    }
  }
  return deps;
}

export function detectFrameworks(repoDeps) {
  const hits = new Map();
  for (const { name, deps } of repoDeps) {
    for (const [label, needles] of Object.entries(FRAMEWORKS)) {
      const used = deps.some((d) => needles.some((n) => d === n || d.startsWith(`${n}/`) || d.startsWith(`${n}-`)));
      if (!used) continue;
      if (!hits.has(label)) hits.set(label, []);
      hits.get(label).push(name);
    }
  }
  return [...hits.entries()]
    .map(([name, repos]) => ({ name, repos: repos.sort() }))
    .sort((a, b) => b.repos.length - a.repos.length || a.name.localeCompare(b.name));
}

export function aggregateLanguages(perRepo) {
  const bytes = new Map();
  for (const languages of perRepo) {
    for (const [lang, count] of Object.entries(languages)) {
      bytes.set(lang, (bytes.get(lang) || 0) + count);
    }
  }
  const total = [...bytes.values()].reduce((sum, n) => sum + n, 0);
  return [...bytes.entries()]
    .map(([lang, count]) => ({ lang, bytes: count, share: (count / total) * 100 }))
    .sort((a, b) => b.bytes - a.bytes);
}

function table(head, rows) {
  const cols = Object.keys(head);
  const width = Object.fromEntries(
    cols.map((c) => [c, Math.max(head[c].length, ...rows.map((r) => r[c].length))]),
  );
  const line = (r) => `| ${cols.map((c) => r[c].padEnd(width[c])).join(' | ')} |`;
  const rule = `| ${cols.map((c) => ':'.padEnd(width[c], '-')).join(' | ')} |`;
  return [line(head), rule, ...rows.map(line)].join('\n');
}

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
  return table({ repo: 'REPOSITORY', lang: 'LANGUAGE', stars: 'STARS', forks: 'FORKS', updated: 'LAST PUSH' }, rows);
}

export function renderLanguagesTable(languages) {
  const rows = languages.slice(0, 8).map((l) => ({
    lang: l.lang,
    share: `${l.share.toFixed(1)}%`,
    bytes: l.bytes.toLocaleString('en-US'),
  }));
  return table({ lang: 'LANGUAGE', share: 'SHARE', bytes: 'BYTES' }, rows);
}

export function renderFrameworksTable(frameworks) {
  const rows = frameworks.map((f) => ({
    name: f.name,
    repos: String(f.repos.length),
    used: f.repos.join(', '),
  }));
  return table({ name: 'FRAMEWORK', repos: 'REPOS', used: 'USED IN' }, rows);
}

async function api(pathname, accept = 'application/vnd.github+json') {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': `${USER}-profile-assets` };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com${pathname}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${pathname} returned ${res.status} ${res.statusText}`);
  return accept.endsWith('raw') ? res.text() : res.json();
}

/* shortcut: only package.json and Cargo.toml are read, add go.mod and pyproject.toml when such a repo deserves a row */
async function repoDeps(name) {
  const tree = await api(`/repos/${USER}/${name}/git/trees/HEAD?recursive=1`);
  const manifests = tree.tree
    .map((entry) => entry.path)
    .filter((p) => !p.includes('node_modules') && ['package.json', 'Cargo.toml'].includes(path.basename(p)))
    .slice(0, 4);

  const contents = await Promise.all(
    manifests.map((m) => api(`/repos/${USER}/${name}/contents/${m}`, 'application/vnd.github.raw')),
  );

  const deps = new Set();
  manifests.forEach((m, i) => {
    const parsed = path.basename(m) === 'Cargo.toml' ? parseCargoDeps(contents[i]) : parsePackageDeps(contents[i]);
    parsed.forEach((d) => deps.add(d));
  });
  return { name, deps: [...deps] };
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

  const own = await Promise.all(
    repos
      .filter((r) => !r.fork && r.name !== USER)
      .map(async (r) => ({
        repo: r,
        languages: await api(`/repos/${USER}/${r.name}/languages`),
        deps: await repoDeps(r.name),
      })),
  );

  const stars = own.reduce((sum, r) => sum + r.repo.stargazers_count, 0);
  const payload = {
    wordmark: (user.name || user.login).toUpperCase(),
    role: (user.bio || '').toUpperCase().slice(0, 90),
    metrics: `${user.public_repos} PUBLIC REPOS · ${user.followers} FOLLOWERS · ${stars} STARS`,
    location: (user.location || '').toUpperCase(),
  };

  const regions = {
    REPOS: renderReposTable(repos, USER),
    LANGUAGES: renderLanguagesTable(aggregateLanguages(own.map((r) => r.languages))),
    FRAMEWORKS: renderFrameworksTable(detectFrameworks(own.map((r) => r.deps))),
  };

  let readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
  for (const [name, body] of Object.entries(regions)) readme = replaceRegion(readme, name, body);

  await Promise.all([
    writeFile(path.join(ROOT, 'profile/banner-light.svg'), renderBanner(COLORS.light, payload)),
    writeFile(path.join(ROOT, 'profile/banner-dark.svg'), renderBanner(COLORS.dark, payload)),
    writeFile(path.join(ROOT, 'README.md'), readme),
  ]);

  console.log(`Synced ${USER}: ${payload.metrics}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
