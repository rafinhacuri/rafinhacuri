// Generates the stats and languages cards used in the profile README.
//
//   node scripts/profile-cards.mjs --out dist                 # fetch from the GitHub API (needs GITHUB_TOKEN)
//   node scripts/profile-cards.mjs --out dist --data x.json   # render from a saved data file
//
// Writes stats-{dark,light}.svg and languages-{dark,light}.svg into --out.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'dist' },
    data: { type: 'string' },
    login: { type: 'string', default: process.env.GITHUB_REPOSITORY_OWNER || 'rafinhacuri' },
  },
})

const W = 840
const PAD = 32
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`
const PALETTE = ['#22D3EE', '#6366F1', '#A855F7', '#F472B6', '#F59E0B', '#34D399']

const THEMES = {
  dark: {
    bg: '#0D1117',
    border: '#30363D',
    text: '#E6EDF3',
    muted: '#8B949E',
    track: '#21262D',
    glow: 0.16,
    accent: ['#22D3EE', '#6366F1', '#A855F7'],
    other: '#6E7681',
  },
  light: {
    bg: '#FFFFFF',
    border: '#D0D7DE',
    text: '#1F2328',
    muted: '#59636E',
    track: '#EAEEF2',
    glow: 0.1,
    accent: ['#0891B2', '#4F46E5', '#9333EA'],
    other: '#8C959F',
  },
}

// ─── data ──────────────────────────────────────────────────────────────────

const QUERY = `
query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      startedAt
      endedAt
      totalCommitContributions
      totalPullRequestContributions
      contributionCalendar {
        totalContributions
        weeks { firstDay contributionDays { contributionCount } }
      }
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name } }
        }
      }
    }
  }
}`

async function fetchData(login) {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error('GITHUB_TOKEN is not set')
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  })
  const body = await res.json()
  if (!res.ok || body.errors) throw new Error(`GraphQL request failed: ${JSON.stringify(body.errors ?? body)}`)

  const { contributionsCollection: c, repositories: repos } = body.data.user
  const days = c.contributionCalendar.weeks.flatMap(w => w.contributionDays)
  const langs = {}
  for (const repo of repos.nodes)
    for (const { size, node } of repo.languages.edges) langs[node.name] = (langs[node.name] || 0) + size

  return {
    login,
    range: { from: c.startedAt.slice(0, 10), to: c.endedAt.slice(0, 10) },
    total: c.contributionCalendar.totalContributions,
    activeDays: days.filter(d => d.contributionCount > 0).length,
    commits: c.totalCommitContributions,
    pullRequests: c.totalPullRequestContributions,
    repositories: repos.totalCount,
    weeks: c.contributionCalendar.weeks.map(w => ({
      start: w.firstDay,
      count: w.contributionDays.reduce((a, d) => a + d.contributionCount, 0),
    })),
    languages: Object.entries(langs).map(([name, size]) => ({ name, size })),
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

const esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
const num = n => n.toLocaleString('en-US')
const r1 = n => Math.round(n * 10) / 10
const date = iso =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const month = iso => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

function frame({ t, h, title, desc, defs = '', body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" fill="none" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>
  text { font-family: ${FONT}; }
  .label { font-size: 11px; font-weight: 600; letter-spacing: 1.4px; fill: ${t.muted}; }
  .muted { fill: ${t.muted}; }
  .rise { animation: rise .7s cubic-bezier(.22,1,.36,1) both; }
  .grow { transform-box: fill-box; transform-origin: 50% 100%; animation: grow .9s cubic-bezier(.22,1,.36,1) both; }
  @keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<defs>
  <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 0) scale(520 260)">
    <stop stop-color="${t.accent[0]}" stop-opacity="${t.glow}"/>
    <stop offset="1" stop-color="${t.accent[0]}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
    <stop stop-color="${t.accent[0]}"/><stop offset=".5" stop-color="${t.accent[1]}"/><stop offset="1" stop-color="${t.accent[2]}"/>
  </linearGradient>
  ${defs}
</defs>
<rect x=".5" y=".5" width="${W - 1}" height="${h - 1}" rx="14" fill="${t.bg}" stroke="${t.border}"/>
<rect x=".5" y=".5" width="${W - 1}" height="${h - 1}" rx="14" fill="url(#glow)"/>
${body}
</svg>
`
}

// ─── stats card ────────────────────────────────────────────────────────────

function statsCard(data, t) {
  const h = 240
  const metrics = [
    ['Commits', data.commits],
    ['Pull requests', data.pullRequests],
    ['Active days', data.activeDays],
    ['Public repos', data.repositories],
  ]
  const metricsSvg = metrics
    .map(([label, value], i) => {
      const x = 372 + i * 112
      return `<g class="rise" style="animation-delay:${120 + i * 70}ms">
  <text x="${x}" y="76" font-size="26" font-weight="700" fill="${t.text}">${num(value)}</text>
  <circle cx="${x + 3}" cy="96" r="3" fill="${PALETTE[i]}"/>
  <text x="${x + 12}" y="100" font-size="12" class="muted">${label}</text>
</g>`
    })
    .join('\n')

  // weekly bars
  const weeks = data.weeks
  const x0 = PAD, x1 = W - PAD, base = 196, maxH = 58
  const slot = (x1 - x0) / weeks.length
  const bw = Math.max(2, slot - 4)
  const max = Math.max(1, ...weeks.map(w => w.count))
  let lastMonth = ''
  let lastLabelX = -Infinity
  const bars = []
  const labels = []
  weeks.forEach((w, i) => {
    const x = r1(x0 + i * slot + (slot - bw) / 2)
    const bh = w.count ? r1(6 + Math.sqrt(w.count / max) * (maxH - 6)) : 3
    const fill = w.count ? 'url(#bars)' : t.track
    bars.push(
      `<rect class="grow" style="animation-delay:${200 + i * 12}ms" x="${x}" y="${r1(base - bh)}" width="${r1(bw)}" height="${bh}" rx="2" fill="${fill}"><title>${esc(`Week of ${date(w.start)}: ${w.count} contribution${w.count === 1 ? '' : 's'}`)}</title></rect>`,
    )
    const m = month(w.start)
    if (m !== lastMonth && i > 0 && x - lastLabelX > 40) {
      labels.push(`<text x="${x}" y="218" font-size="10" class="muted">${m}</text>`)
      lastLabelX = x
    }
    lastMonth = m
  })

  return frame({
    t,
    h,
    title: `${data.login}'s GitHub activity`,
    desc: `${data.total} contributions between ${date(data.range.from)} and ${date(data.range.to)}.`,
    defs: `<linearGradient id="bars" x1="${x0}" y1="0" x2="${x1}" y2="0" gradientUnits="userSpaceOnUse">
    <stop stop-color="${t.accent[0]}"/><stop offset=".5" stop-color="${t.accent[1]}"/><stop offset="1" stop-color="${t.accent[2]}"/>
  </linearGradient>`,
    body: `<g class="rise">
  <text x="${PAD}" y="42" class="label">CONTRIBUTIONS · LAST 12 MONTHS</text>
  <text x="${PAD - 2}" y="94" font-size="50" font-weight="800" letter-spacing="-1" fill="url(#accent)">${num(data.total)}</text>
  <text x="${PAD}" y="118" font-size="12" class="muted">${date(data.range.from)} – ${date(data.range.to)}</text>
</g>
${metricsSvg}
<line x1="${x0}" y1="${base + 0.5}" x2="${x1}" y2="${base + 0.5}" stroke="${t.border}" stroke-dasharray="2 4"/>
${bars.join('\n')}
${labels.join('\n')}`,
  })
}

// ─── languages card ────────────────────────────────────────────────────────

function languagesCard(data, t) {
  const sorted = [...data.languages].sort((a, b) => b.size - a.size)
  const total = sorted.reduce((a, l) => a + l.size, 0) || 1
  // Up to five languages with at least 1% each; everything else is grouped as "Other" when that adds up to 1%.
  const shown = sorted.slice(0, 5).filter(l => l.size / total >= 0.01)
  const top = shown.map((l, i) => ({ ...l, color: PALETTE[i] }))
  const rest = total - shown.reduce((a, l) => a + l.size, 0)
  if (rest / total >= 0.01) top.push({ name: 'Other', size: rest, color: t.other })
  const items = top.map(l => ({ ...l, pct: (l.size / total) * 100 }))

  const x0 = PAD, width = W - PAD * 2, y = 62, bh = 12
  let cursor = x0
  const segments = items
    .map((l, i) => {
      const w = (l.pct / 100) * width
      const seg = `<rect x="${r1(cursor)}" y="${y}" width="${r1(Math.max(0, w - (i < items.length - 1 ? 2 : 0)))}" height="${bh}" fill="${l.color}"/>`
      cursor += w
      return seg
    })
    .join('\n  ')

  const cols = items.length === 4 ? 4 : 3, colW = width / cols
  const legend = items
    .map((l, i) => {
      const lx = r1(x0 + (i % cols) * colW)
      const ly = 112 + Math.floor(i / cols) * 30
      return `<g class="rise" style="animation-delay:${300 + i * 60}ms">
  <circle cx="${lx + 5}" cy="${ly - 5}" r="5" fill="${l.color}"/>
  <text x="${lx + 18}" y="${ly}" font-size="14" font-weight="600" fill="${t.text}">${esc(l.name)}<tspan dx="8" font-size="13" font-weight="400" class="muted">${l.pct.toFixed(1)}%</tspan></text>
</g>`
    })
    .join('\n')

  const h = 112 + Math.ceil(items.length / cols) * 30 + 6
  return frame({
    t,
    h,
    title: `${data.login}'s most used languages`,
    desc: items.map(l => `${l.name} ${l.pct.toFixed(1)}%`).join(', '),
    defs: `<clipPath id="bar"><rect x="${x0}" y="${y}" width="${width}" height="${bh}" rx="${bh / 2}">
    <animate attributeName="width" from="0" to="${width}" dur="1.1s" calcMode="spline" keySplines=".22 1 .36 1" keyTimes="0;1" fill="freeze"/>
  </rect></clipPath>`,
    body: `<text x="${PAD}" y="42" class="label rise">MOST USED LANGUAGES</text>
<text x="${W - PAD}" y="42" font-size="11" text-anchor="end" class="muted rise">by code size · public repos</text>
<rect x="${x0}" y="${y}" width="${width}" height="${bh}" rx="${bh / 2}" fill="${t.track}"/>
<g clip-path="url(#bar)">
  ${segments}
</g>
${legend}`,
  })
}

// ─── main ──────────────────────────────────────────────────────────────────

const data = args.data ? JSON.parse(readFileSync(args.data, 'utf8')) : await fetchData(args.login)
mkdirSync(args.out, { recursive: true })
for (const [name, t] of Object.entries(THEMES)) {
  writeFileSync(join(args.out, `stats-${name}.svg`), statsCard(data, t))
  writeFileSync(join(args.out, `languages-${name}.svg`), languagesCard(data, t))
}
console.log(`Wrote cards for ${data.login} to ${args.out}`)
