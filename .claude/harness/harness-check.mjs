#!/usr/bin/env node
// harness-check — WannaSong 하네스 정합성 검사기 (node 내장 모듈만 사용, 외부 의존성 없음. node_modules 없이도 동작)
//
// 이 저장소는 npm workspaces 모노레포다(apps/*, packages/*). 스택은 워크스페이스 단위로 다를 수 있고
// (예: apps/web 은 Next.js, 나중에 apps/api 가 Java/Go/Hono 로 붙을 수 있다) 검사기는 그 전부를 지문으로 잡는다.
//
// 검사 3종:
//   1. 스택 드리프트 : 루트(패키지 매니저·런타임·워크스페이스 선언·배포 파일·최상위 디렉터리) + 워크스페이스별
//                    (종류 node/java/go/... · 프레임워크 · 의존성 · scripts · 언어 · 배포 파일 · env 키) 지문을
//                    .claude/harness/stack-manifest.json 과 비교한다. 워크스페이스 추가/삭제는 HIGH.
//   2. stale 참조    : CLAUDE.md / .claude/skills/**.md / .claude/commands/*.md 본문의 백틱 토큰 중
//                    경로·env 키·라우트(Next.js App Router 디렉터리 포함)·소켓/KV 키·심볼·패키지명이 실제 코드에 있는지.
//   3. 레지스트리    : CLAUDE.md 의 스킬·커맨드 표가 .claude/skills, .claude/commands 실물과 일치하는지.
//
// 모드:
//   (기본)      사람이 읽는 리포트. 종료코드 0.
//   --strict    결과가 하나라도 있으면 종료코드 1 (커밋 전 게이트).
//   --json      JSON 출력.
//   --session   SessionStart 훅용 압축 출력 + 최근 lessons 제목 + 열린 todo 수.
//   --hook      PostToolUse 훅용(모든 도구 공통). 감시 대상 파일의 mtime 지문 또는 stdin 의 file_path 가 바뀌었을 때만
//               검사하고, 결과가 있으면 hookSpecificOutput.additionalContext 로 주입. 동일 결과 반복은 억제.
//   --update    현재 지문을 manifest 에 기록(하네스를 새 스택에 맞게 갱신한 뒤 "승인"하는 단계).
//   --selftest  검사기 자기 검증. 저장소를 임시 폴더에 복사해 드리프트·stale 참조·레지스트리 결함을 주입하고
//               검사기가 그것을 잡는지 확인한다. 검사기 로직을 고쳤을 때 실행.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(SELF), '../..');
const MANIFEST_REL = '.claude/harness/stack-manifest.json';
const STATE_FILE = path.join(ROOT, '.omc/state/harness-check-last.json');
const args = new Set(process.argv.slice(2));
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/') || '.';
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const isDir = (p) => { try { return fs.statSync(path.join(ROOT, p)).isDirectory(); } catch { return false; } };
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return null; } };
const uniq = (a) => [...new Set(a)].sort();

// ---------------------------------------------------------------- 상수
const NODE_FRAMEWORKS = ['next', 'react', 'react-dom', 'vue', 'nuxt', 'svelte', '@sveltejs/kit', 'astro', 'remix', '@remix-run/node', 'solid-js',
  'express', 'fastify', 'koa', 'hono', '@hono/node-server', 'nestjs', '@nestjs/core', 'elysia', 'socket.io', 'socket.io-client', 'ws',
  'prisma', '@prisma/client', 'drizzle-orm', 'mongoose', 'pg', 'mysql2', 'better-sqlite3', 'redis', 'ioredis', '@vercel/kv', '@upstash/redis',
  'vite', 'typescript', 'tsx', 'vitest', 'jest', 'mocha', 'playwright', '@playwright/test', 'eslint', 'prettier', 'biome', '@biomejs/biome',
  'tailwindcss', 'zod', 'trpc', '@trpc/server', 'graphql', 'apollo-server', 'zustand', 'jotai', '@tanstack/react-query', 'swr'];
// 노드가 아닌 워크스페이스 판별 마커 → 종류
const POLYGLOT_MARKERS = { 'build.gradle': 'java-gradle', 'build.gradle.kts': 'java-gradle', 'pom.xml': 'java-maven', 'go.mod': 'go', 'Cargo.toml': 'rust',
  'pyproject.toml': 'python', 'requirements.txt': 'python', 'Gemfile': 'ruby', 'mix.exs': 'elixir', 'composer.json': 'php', 'Package.swift': 'swift', '*.csproj': 'dotnet' };
// 마커 파일 본문에서 찍어 보는 프레임워크 식별자(비노드)
const POLYGLOT_FRAMEWORKS = ['spring-boot', 'org.springframework', 'netty-socketio', 'quarkus', 'micronaut', 'ktor', 'vertx', 'javalin', 'lettuce', 'jedis',
  'gin-gonic', 'labstack/echo', 'gofiber', 'chi', 'gorilla', 'actix', 'axum', 'tokio', 'fastapi', 'flask', 'django', 'starlette', 'socketio', 'rails', 'sinatra'];
const DEPLOY_FILES = ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'fly.toml', 'render.yaml', 'vercel.json', 'netlify.toml', 'Procfile',
  'railway.json', 'wrangler.toml', 'serverless.yml', 'app.yaml', 'Caddyfile', 'nginx.conf'];
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.omc', 'dist', 'build', 'coverage', '.next', '.turbo', '.vercel', 'out', 'target', '.gradle', '__pycache__', '.venv', 'venv', '.svelte-kit']);
const LOCK_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', 'deno.lock', 'gradle.lockfile', 'Cargo.lock', 'poetry.lock', 'Gemfile.lock']);
// 코퍼스(심볼/env/이벤트/라우트 실재 판정)에서 제외: 모든 .md · tasks/ · 하네스 문서(.claude/harness 의 코드는 포함) · 락파일.
// 문서가 문서를 만족시키면 검사가 무의미하다.
const inCorpus = (f) => !f.endsWith('.md') && !f.startsWith('tasks/') && (!f.startsWith('.claude/') || f.startsWith('.claude/harness/')) && !LOCK_FILES.has(path.basename(f))
  && f !== '.claude/harness/selftest-fixtures.json'; // 자기검증용 가짜 토큰이 '존재'로 판정되면 안 된다
const SOURCE_EXT = /\.(m?[jt]sx?|cjs|cts|html|css|scss|json|jsonc|toml|ya?ml|txt|example|java|kts?|gradle|go|rs|py|rb|sql|prisma|properties|xml|env)$/;
// 감시 대상(훅이 이 파일들의 변경에만 반응한다). 새 워크스페이스 디렉터리 출현은 별도로 감지.
const WATCH = ['package.json', '*/package.json', 'apps/*/package.json', 'packages/*/package.json', 'services/*/package.json',
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'pnpm-workspace.yaml', 'turbo.json', 'nx.json',
  '.nvmrc', '.node-version', '.tool-versions', '.mise.toml', 'mise.toml',
  '**/tsconfig.json', '**/tsconfig.*.json', '**/next.config.*', '**/vite.config.*', '**/eslint.config.*', '**/biome.json',
  '**/Dockerfile', '**/docker-compose.yml', '**/fly.toml', '**/render.yaml', '**/vercel.json', '**/netlify.toml', '**/Procfile', '**/wrangler.toml',
  '**/.env.example', '**/.env.*.example', '**/build.gradle', '**/build.gradle.kts', '**/pom.xml', '**/go.mod', '**/Cargo.toml', '**/pyproject.toml', '**/requirements.txt',
  'CLAUDE.md', '.claude/settings.json', '.claude/skills/**', '.claude/commands/**', '.claude/harness/**', '.github/workflows/**'];

// ---------------------------------------------------------------- 파일 목록
let fileCache = null;
function listFiles() {
  if (fileCache) return fileCache;
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of entries) {
      if (d.isDirectory()) { if (!EXCLUDE_DIRS.has(d.name)) walk(path.join(dir, d.name)); }
      else if (d.isFile()) out.push(rel(path.join(dir, d.name)));
    }
  };
  walk(ROOT);
  return (fileCache = out.sort());
}
// 글롭 → 정규식. `**/` 는 0개 이상의 디렉터리, 끝의 `**` 는 나머지 전부, `*` 는 한 세그먼트 안.
const globToRe = (g) => new RegExp('^' + g.split('**/').map((part) =>
  part.split('**').map((seg) => seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('.*'),
).join('(?:.*/)?') + '$');
const matchesAny = (globs, f) => globs.some((g) => globToRe(g).test(f));

// ---------------------------------------------------------------- 1. 스택 지문
function topDirs() {
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !EXCLUDE_DIRS.has(d.name)).map((d) => d.name).sort();
}
// 워크스페이스 선언: package.json workspaces(npm/yarn/bun) 또는 pnpm-workspace.yaml packages(pnpm)
function declaredWorkspaces(pkg) {
  const fromPkg = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces?.packages || []);
  const yaml = read('pnpm-workspace.yaml');
  const fromPnpm = yaml ? [...yaml.matchAll(/^\s*-\s*['"]?([^'"\n#]+?)['"]?\s*$/gm)].map((m) => m[1].trim()) : [];
  return uniq([...fromPkg, ...fromPnpm]);
}
function workspaceDirs() {
  const pkg = readJson('package.json') || {};
  const globs = uniq([...declaredWorkspaces(pkg), 'apps/*', 'packages/*', 'services/*']);
  const dirs = new Set();
  for (const g of globs) {
    if (!g.includes('*')) { if (isDir(g)) dirs.add(g.replace(/\/$/, '')); continue; }
    const parent = g.split('*')[0].replace(/\/$/, '');
    if (!parent || !isDir(parent)) continue;
    for (const d of fs.readdirSync(path.join(ROOT, parent), { withFileTypes: true }))
      if (d.isDirectory() && !d.name.startsWith('.') && !EXCLUDE_DIRS.has(d.name)) dirs.add(`${parent}/${d.name}`);
  }
  // 최상위에 마커를 가진 디렉터리(예: 루트 바로 아래 Java 서버)도 워크스페이스로 본다
  for (const d of topDirs()) if (markersIn(d).length || (exists(`${d}/package.json`) && d !== '.')) dirs.add(d);
  return [...dirs].sort();
}
function markersIn(dir) {
  const out = [];
  for (const m of Object.keys(POLYGLOT_MARKERS)) {
    if (m.includes('*')) { try { if (fs.readdirSync(path.join(ROOT, dir)).some((f) => globToRe(m).test(f))) out.push(m); } catch {} }
    else if (exists(`${dir}/${m}`)) out.push(m);
  }
  return out;
}
function envKeysIn(dir) {
  const prefix = dir === '.' ? '' : dir + '/';
  const files = listFiles().filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/') && /^\.env(\..+)?\.example$/.test(path.basename(f)));
  return uniq(files.flatMap((f) => [...read(f).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1])));
}
function detectRuntime(pkg) {
  const dockerFrom = (read('Dockerfile').match(/^FROM\s+(\S+)/m) || [])[1];
  const nvm = (read('.nvmrc') || read('.node-version')).trim();
  const tool = (read('.tool-versions').match(/^node(?:js)?\s+(\S+)/m) || [])[1];
  const mise = ((read('.mise.toml') || read('mise.toml')).match(/^\s*node(?:js)?\s*=\s*"?([^"\n]+)"?/m) || [])[1];
  if (exists('deno.json') || exists('deno.jsonc')) return 'deno';
  const v = pkg.engines?.node ? `node ${pkg.engines.node}` : nvm ? `node ${nvm}` : tool ? `node ${tool}` : mise ? `node ${mise}` : dockerFrom ? dockerFrom : 'node (미고정)';
  return v;
}
function nodeWorkspace(dir, pkg) {
  const deps = Object.keys(pkg.dependencies || {}).sort();
  const devDeps = Object.keys(pkg.devDependencies || {}).sort();
  const hasTs = exists(`${dir}/tsconfig.json`) || listFiles().some((f) => f.startsWith(dir + '/') && /\.(m?ts|tsx)$/.test(f));
  return {
    kind: 'node', name: pkg.name || '', language: hasTs ? 'typescript' : 'javascript', moduleType: pkg.type || 'commonjs',
    frameworks: [...deps, ...devDeps].filter((d) => NODE_FRAMEWORKS.includes(d)).sort(),
    deps, devDeps, scripts: pkg.scripts || {},
  };
}
function polyglotWorkspace(dir, markers) {
  const text = markers.filter((m) => !m.includes('*')).map((m) => read(`${dir}/${m}`)).join('\n');
  return { kind: POLYGLOT_MARKERS[markers[0]], markers, frameworks: POLYGLOT_FRAMEWORKS.filter((f) => text.includes(f)).sort() };
}
function fingerprint() {
  const pkg = readJson('package.json') || {};
  const lock = ['pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'package-lock.json', 'deno.lock'].find(exists);
  const packageManager = { 'pnpm-lock.yaml': 'pnpm', 'yarn.lock': 'yarn', 'bun.lockb': 'bun', 'bun.lock': 'bun', 'package-lock.json': 'npm', 'deno.lock': 'deno' }[lock] || 'unknown';
  const workspaces = {};
  for (const dir of workspaceDirs()) {
    const wpkg = readJson(`${dir}/package.json`);
    const markers = markersIn(dir);
    const base = wpkg ? nodeWorkspace(dir, wpkg) : markers.length ? polyglotWorkspace(dir, markers) : { kind: 'unknown', frameworks: [] };
    workspaces[dir] = { ...base, deploy: DEPLOY_FILES.filter((f) => exists(`${dir}/${f}`)), envKeys: envKeysIn(dir) };
  }
  return {
    packageManager, runtime: detectRuntime(pkg), moduleType: pkg.type || 'commonjs',
    packageManagerPinned: pkg.packageManager || '', workspacesDeclared: declaredWorkspaces(pkg),
    rootDeps: Object.keys(pkg.dependencies || {}).sort(), rootDevDeps: Object.keys(pkg.devDependencies || {}).sort(), rootScripts: pkg.scripts || {},
    deploy: [...DEPLOY_FILES.filter(exists), ...(isDir('.github/workflows') ? ['.github/workflows'] : [])],
    dirs: topDirs(), envKeys: envKeysIn('.'), workspaces,
  };
}

const HIGH_LEAF = new Set(['runtime', 'language', 'moduleType', 'packageManager', 'packageManagerPinned', 'frameworks', 'deploy', 'kind', 'markers', 'workspacesDeclared', 'dirs']);
const HIGH_SCRIPTS = new Set(['dev', 'build', 'start', 'test', 'lint']);
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out); else out[key] = v;
  }
  return out;
}
function sevFor(key) {
  const parts = key.split('.'); const leaf = parts.at(-1);
  if (parts.some((p) => /scripts$/i.test(p))) return HIGH_SCRIPTS.has(leaf) ? 'HIGH' : 'LOW';
  return HIGH_LEAF.has(leaf) ? 'HIGH' : 'LOW';
}
function diffStack(expected, actual) {
  const out = [];
  const eWs = Object.keys(expected?.workspaces || {}); const aWs = Object.keys(actual.workspaces || {});
  const added = aWs.filter((w) => !eWs.includes(w)); const removed = eWs.filter((w) => !aWs.includes(w));
  for (const w of added) out.push({ kind: 'stack', sev: 'HIGH', key: `workspaces.${w}`, msg: `워크스페이스 추가: ${w} (kind=${actual.workspaces[w].kind}${actual.workspaces[w].frameworks?.length ? ', ' + actual.workspaces[w].frameworks.join('/') : ''})` });
  for (const w of removed) out.push({ kind: 'stack', sev: 'HIGH', key: `workspaces.${w}`, msg: `워크스페이스 삭제: ${w}` });
  const skip = (key) => [...added, ...removed].some((w) => key.startsWith(`workspaces.${w}.`));
  const e = flatten(expected || {}); const a = flatten(actual);
  for (const key of uniq([...Object.keys(e), ...Object.keys(a)])) {
    if (skip(key)) continue;
    const av = a[key]; const ev = e[key];
    if (Array.isArray(av) || Array.isArray(ev)) {
      const A = av || []; const E = ev || [];
      const plus = A.filter((x) => !E.includes(x)); const minus = E.filter((x) => !A.includes(x));
      if (plus.length || minus.length) out.push({ kind: 'stack', sev: sevFor(key), key, msg: `${key}: ${plus.map((x) => `+${x}`).concat(minus.map((x) => `-${x}`)).join(' ')}` });
    } else if (av !== ev) out.push({ kind: 'stack', sev: sevFor(key), key, msg: `${key}: ${JSON.stringify(ev)} → ${JSON.stringify(av)}` });
  }
  return out;
}

// ---------------------------------------------------------------- 2. stale 참조
let corpus = null;
function sourceCorpus() {
  if (corpus !== null) return corpus;
  corpus = listFiles().filter((f) => inCorpus(f) && (SOURCE_EXT.test(f) || /(^|\/)(Dockerfile|Procfile|Caddyfile)$/.test(f) || /\.env(\..+)?\.example$/.test(path.basename(f))))
    .map((f) => { try { return fs.statSync(path.join(ROOT, f)).size < 1_000_000 ? read(f) : ''; } catch { return ''; } }).join('\n');
  return corpus;
}
const inSource = (needle) => sourceCorpus().includes(needle);
const quotedInSource = (s) => inSource(`'${s}'`) || inSource(`"${s}"`) || inSource(`\`${s}\``);

// Next.js App Router 라우트: app/**/(route|page).(ts|tsx|js|jsx) 디렉터리 → URL. 라우트 그룹 (x) 은 제거.
let routeCache = null;
function appRoutes() {
  if (routeCache) return routeCache;
  const routes = new Set();
  for (const f of listFiles()) {
    const m = f.match(/^(.*?)(?:^|\/)(?:src\/)?app\/(.*?)(?:\/)?(route|page)\.(m?[jt]sx?)$/);
    if (!m) continue;
    const segs = m[2].split('/').filter((s) => s && !/^\(.*\)$/.test(s));
    routes.add('/' + segs.join('/'));
  }
  return (routeCache = routes);
}
function gitignorePatterns() {
  const pats = [];
  for (const f of listFiles().filter((f) => path.basename(f) === '.gitignore')) {
    const dir = path.posix.dirname(f);
    for (const raw of read(f).split('\n')) {
      let l = raw.trim(); if (!l || l.startsWith('#')) continue;
      const negate = l.startsWith('!'); if (negate) l = l.slice(1);
      const anchored = l.startsWith('/'); const pat = l.replace(/^\//, '').replace(/\/$/, '');
      pats.push({ pat, dir: dir === '.' ? '' : dir + '/', anchored: anchored || pat.includes('/'), negate });
    }
  }
  return pats;
}
function isIgnored(bare, pats) {
  const hit = (list) => list.some(({ pat, dir, anchored }) => {
    if (dir && !bare.startsWith(dir)) return false;
    const local = dir ? bare.slice(dir.length) : bare;
    if (anchored) return local === pat || local.startsWith(pat + '/') || (pat.includes('*') && globToRe(pat).test(local));
    // 슬래시 없는 패턴은 어느 깊이의 파일/디렉터리 이름에도 매칭
    return local.split('/').some((seg, i, arr) => seg === pat || (pat.includes('*') && globToRe(pat).test(seg)) || arr.slice(0, i + 1).join('/') === pat);
  });
  return hit(pats.filter((p) => !p.negate)) && !hit(pats.filter((p) => p.negate));
}
// 외부 문서(사용자 문서·스펙): manifest.refDocs 글롭. 하네스 문서와 같은 stale 참조 검사를 받되 리포트에 (외부 문서) 표기.
const DEFAULT_REF_DOCS = ['README.md', 'docs/**/*.md', 'packages/*/README.md'];
function externalDocFiles(manifest) {
  const globs = manifest.refDocs || DEFAULT_REF_DOCS;
  return listFiles().filter((f) => f.endsWith('.md') && !f.startsWith('.claude/') && f !== 'CLAUDE.md' && matchesAny(globs, f));
}
// 현재 패키지 매니저와 다른 매니저의 명령이 문서 코드 펜스·백틱에 남아 있으면 플래그 (npm → pnpm 전환에서 14곳이 검사를 통과한 실사고)
const PM_CMD_RE = /(^|[\s`(])((?:npm|pnpm|yarn|bun)\s+(?:run|install|i|add|remove|exec|dlx|test|dev|build|start|lint|ci)\b|npx\s+\S)/g;
function checkPackageManagerCmds(pm, docs) {
  if (!pm || pm === 'unknown') return [];
  const findings = [];
  for (const doc of docs) {
    const text = read(doc); const seen = new Set();
    for (const m of text.matchAll(PM_CMD_RE)) {
      const cmd = m[2]; const mgr = cmd.startsWith('npx') ? 'npx' : cmd.split(/\s+/)[0];
      const ok = mgr === pm || (mgr === 'npx' && pm === 'npm');
      if (ok || seen.has(cmd)) continue; seen.add(cmd);
      const line = text.slice(0, m.index).split('\n').length;
      findings.push({ kind: 'ref', sev: 'LOW', doc: `${doc}:${line}`, msg: `패키지 매니저 명령 불일치(현재 ${pm}): ${cmd}` });
    }
  }
  return findings;
}
function docFiles() {
  const out = ['CLAUDE.md'].filter(exists);
  for (const d of ['.claude/skills', '.claude/commands']) {
    if (!isDir(d)) continue;
    const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((e) => {
      const p = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) out.push(p);
    });
    walk(d);
  }
  return out;
}
function checkRefs(manifest) {
  const ignore = new Set(manifest.refIgnore || []);
  const external = new Set(externalDocFiles(manifest));
  const tops = new Set(topDirs());
  const pats = gitignorePatterns();
  const commands = new Set((isDir('.claude/commands') ? fs.readdirSync(path.join(ROOT, '.claude/commands')) : []).filter((f) => f.endsWith('.md')).map((f) => '/' + f.replace(/\.md$/, '')));
  const routes = appRoutes();
  const files = listFiles();
  const findings = [];
  for (const doc of [...docFiles(), ...external]) {
    const text = read(doc);
    const seen = new Set();
    const tag = external.has(doc) ? ' (외부 문서)' : '';
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const tok = m[1].trim().replace(/[:,;]$/, '');
      if (seen.has(tok) || ignore.has(tok)) continue; seen.add(tok);
      if (/\s|https?:|=|\$|^--|^-[a-z]|^['"]/.test(tok)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      const flag = (what) => findings.push({ kind: 'ref', sev: 'LOW', doc: `${doc}:${line}${tag}`, msg: `${what}: \`${tok}\`` });
      const bare = tok.replace(/\/$/, '');
      if (tag && !(bare.includes('/') && tops.has(bare.split('/')[0]))) continue; // 외부 문서는 저장소 내부 경로만 본다
      if (/^\/(tmp|private|var|etc|usr|opt|home|Users)\//.test(tok)) continue; // 로컬 절대경로 예시
      if (bare.startsWith('~') || bare.startsWith('..') || bare.startsWith('.git/') || bare.startsWith('.omc/')) continue; // git 내부·OMC 로컬 상태는 항상 있다고 본다
      if (/^\.[a-z0-9]+$/.test(tok)) continue; // 확장자만 쓴 토큰 (.mjs)
      if (/<[^>]+>/.test(tok)) continue; // 자리표시자 (<name>)
      if (/^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/.test(tok) && inSource(tok)) continue; // 점 표기 심볼 (NextResponse.json)
      // 패키지명·경로 별칭 (@scope/name, @/lib/x) — 소스에 문자열로 존재해야 함
      if (/^@[\w.-]*\/[\w./*-]+$/.test(tok)) { if (!inSource(tok)) flag('패키지/별칭 미발견'); continue; }
      // ENV_KEY/하위경로 — 키의 실재만 본다
      if (/^[A-Z][A-Z0-9_]+\//.test(tok)) { if (!inSource(tok.split('/')[0])) flag('env 키 미발견(경로 접두)'); continue; }
      // URL 글롭 (/api/* 같은 프록시 경로) — 라우트 접두가 실재하면 OK, 아니면 인프라 서술로 보고 넘어간다
      if (tok.startsWith('/') && tok.includes('*')) { const pre = tok.split('*')[0].replace(/\/$/, ''); if (pre && ![...routes].some((r) => r.startsWith(pre)) && !quotedInSource(pre)) { /* 인프라 경로 */ } continue; }
      // 슬래시 커맨드 또는 HTTP 라우트 (App Router 디렉터리·소스 문자열·커맨드 파일 중 하나면 OK)
      if (/^\/([a-z][a-z0-9-]*(\/[a-z0-9\[\]:.-]+)*)?$/.test(tok)) {
        const base = tok.replace(/\?.*$/, '');
        if (commands.has(base) || routes.has(base) || quotedInSource(base)) continue;
        flag('커맨드/라우트 없음'); continue;
      }
      // 경로 (글롭 포함)
      if (/\//.test(bare) || /\.(m?[jt]sx?|cjs|json|md|html|css|toml|ya?ml|txt|example|lock|java|kts?|gradle|go|rs|py|xml|properties|sql|prisma)$/.test(bare) || /^(Dockerfile|Procfile|Caddyfile)$/.test(bare)) {
        if (isIgnored(bare, pats)) continue; // 런타임 생성물/로컬 상태
        if (bare.includes('*')) { if (files.some((f) => globToRe(bare).test(f)) || isDir(bare.split('*')[0].replace(/\/$/, ''))) continue; flag('글롭에 매칭되는 파일 없음'); continue; }
        if (exists(bare)) continue;
        if (!bare.includes('/') && files.some((f) => path.basename(f) === bare)) continue; // 파일명만 쓴 참조
        if (quotedInSource(tok)) continue; // 모듈 지정자 (next/script 등) — import 문자열로 존재
        flag('경로 없음'); continue;
      }
      // 환경변수 키 / 상수 (밑줄 포함 대문자)
      if (/^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(tok)) { if (!inSource(tok)) flag('env 키/상수 미발견'); continue; }
      // 네임스페이스 키 (소켓 이벤트 ns:event · KV 키 wannasong:state)
      if (/^[a-z]+:[a-z][a-z-]*$/.test(tok)) { if (!quotedInSource(tok)) flag('이벤트/키 미발견'); continue; }
      // 심볼: `fn()` 형태 또는 8자 이상 camelCase/PascalCase 식별자
      const sym = tok.replace(/\(\)$/, '');
      if ((/\(\)$/.test(tok) || (/^[a-z]+[A-Z]\w{3,}$/.test(sym) && sym.length >= 8) || (/^[A-Z][a-z]+[A-Z]\w{3,}$/.test(sym) && sym.length >= 8)) && /^[A-Za-z_$][\w$]*$/.test(sym)) {
        if (!inSource(sym)) flag('심볼 미발견');
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------- 3. 레지스트리
function checkRegistry() {
  const findings = [];
  const claude = read('CLAUDE.md');
  if (!claude) return [{ kind: 'registry', sev: 'HIGH', msg: 'CLAUDE.md 없음' }];
  const skillsDir = path.join(ROOT, '.claude/skills');
  const skills = fs.existsSync(skillsDir) ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
  for (const d of skills) {
    const sk = read(`.claude/skills/${d.name}/SKILL.md`);
    if (!sk) { findings.push({ kind: 'registry', sev: 'LOW', msg: `스킬 디렉터리에 SKILL.md 없음: ${d.name}` }); continue; }
    const fm = sk.match(/^---\n([\s\S]*?)\n---/);
    const name = (fm?.[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
    if (!fm || !name || !/^description:\s*\S/m.test(fm[1])) findings.push({ kind: 'registry', sev: 'LOW', msg: `SKILL.md frontmatter(name/description) 불완전: ${d.name}` });
    if (name && name !== d.name) findings.push({ kind: 'registry', sev: 'LOW', msg: `스킬 name(${name}) ≠ 디렉터리명(${d.name})` });
    if (d.name !== 'omc-reference' && !claude.includes(`\`${d.name}\``)) findings.push({ kind: 'registry', sev: 'LOW', msg: `CLAUDE.md 스킬 표에 누락: ${d.name}` });
  }
  const skillNames = new Set(skills.map((d) => d.name));
  for (const n of uniq([...claude.matchAll(/`(wannasong-[a-z0-9-]+)`/g)].map((m) => m[1]))) if (!skillNames.has(n)) findings.push({ kind: 'registry', sev: 'LOW', msg: `CLAUDE.md 가 가리키는 스킬이 없음(유령): ${n}` });
  const cmdDir = path.join(ROOT, '.claude/commands');
  const cmds = new Set();
  for (const f of fs.existsSync(cmdDir) ? fs.readdirSync(cmdDir).filter((f) => f.endsWith('.md')) : []) {
    const cmd = '/' + f.replace(/\.md$/, ''); cmds.add(cmd);
    if (!claude.includes(`\`${cmd}\``)) findings.push({ kind: 'registry', sev: 'LOW', msg: `CLAUDE.md 커맨드 표에 누락: ${cmd}` });
  }
  const routes = appRoutes();
  for (const c of uniq([...claude.matchAll(/`(\/[a-z][a-z0-9-]*)`/g)].map((m) => m[1]))) if (!cmds.has(c) && !routes.has(c) && !quotedInSource(c)) findings.push({ kind: 'registry', sev: 'LOW', msg: `CLAUDE.md 가 가리키는 커맨드가 없음(유령): ${c}` });
  const size = Buffer.byteLength(claude);
  if (size > 15 * 1024) findings.push({ kind: 'registry', sev: 'LOW', msg: `CLAUDE.md 가 15KB 상한 초과 (${(size / 1024).toFixed(1)}KB) — 세부는 스킬로 내릴 것` });
  const settings = readJson('.claude/settings.json');
  const hookCmds = JSON.stringify(settings?.hooks || {});
  if (settings && !hookCmds.includes('harness-check.mjs')) findings.push({ kind: 'registry', sev: 'HIGH', msg: '.claude/settings.json 훅이 harness-check.mjs 를 호출하지 않음 — 자동 동기화가 꺼진 상태' });
  return findings;
}

// ---------------------------------------------------------------- 실행
function run() {
  const manifest = readJson(MANIFEST_REL);
  const actual = fingerprint();
  const findings = [];
  if (!manifest) findings.push({ kind: 'stack', sev: 'HIGH', msg: `${MANIFEST_REL} 없음 — \`node .claude/harness/harness-check.mjs --update\` 로 생성` });
  else findings.push(...diffStack(manifest.stack, actual));
  findings.push(...checkRefs(manifest || {}), ...checkPackageManagerCmds(actual.packageManager, [...docFiles(), ...externalDocFiles(manifest || {})]), ...checkRegistry());
  return { actual, findings, manifest };
}
function recentLessons(n = 3) { return [...read('tasks/lessons.md').matchAll(/^## (.+)$/gm)].map((m) => m[1]).slice(-n); }
function openTodos() { return (read('tasks/todo.md').match(/^\s*- \[ \]/gm) || []).length; }
function formatHuman({ findings }) {
  if (!findings.length) return '[harness-check] OK — 스택 지문 일치 · stale 참조 0 · 레지스트리 정합';
  const lines = [`[harness-check] ${findings.length}건`];
  const by = (k) => findings.filter((f) => f.kind === k);
  if (by('stack').length) { lines.push('■ 스택 드리프트 (manifest 대비) → `wannasong-harness-sync` 절차로 스킬/CLAUDE.md 갱신 후 `--update`'); by('stack').forEach((f) => lines.push(`  [${f.sev}] ${f.msg}`)); }
  if (by('ref').length) { lines.push('■ stale 참조 (문서가 가리키는 대상이 코드에 없음)'); by('ref').forEach((f) => lines.push(`  [${f.sev}] ${f.doc} ${f.msg}`)); }
  if (by('registry').length) { lines.push('■ 레지스트리'); by('registry').forEach((f) => lines.push(`  [${f.sev}] ${f.msg}`)); }
  return lines.join('\n');
}
function writeManifest(prev, actual) {
  const next = { $comment: 'WannaSong 스택 지문(루트 + 워크스페이스별). harness-check.mjs 가 생성·비교한다. 손으로 고치지 말고 하네스를 새 스택에 맞게 갱신한 뒤 --update 로 승인할 것. refIgnore 만 수기 편집.',
    updatedAt: new Date().toISOString(), stack: actual, refIgnore: prev.refIgnore || [] };
  fs.mkdirSync(path.join(ROOT, path.dirname(MANIFEST_REL)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, MANIFEST_REL), JSON.stringify(next, null, 2) + '\n');
}

if (args.has('--update')) {
  const prev = readJson(MANIFEST_REL) || {};
  const actual = fingerprint();
  const changed = prev.stack ? diffStack(prev.stack, actual) : [];
  writeManifest(prev, actual);
  console.log(changed.length ? `manifest 갱신 (${changed.length}건 반영):\n` + changed.map((c) => `  ${c.msg}`).join('\n') : prev.stack ? 'manifest 갱신 (지문 변화 없음)' : 'manifest 생성');
  process.exit(0);
}

if (args.has('--hook')) {
  let input = {}; try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
  const fp = input?.tool_input?.file_path || input?.tool_input?.path || '';
  const relPath = fp ? rel(path.resolve(ROOT, fp)) : '';
  // 도구 무관 감지: 감시 대상 파일들의 mtime/size + 워크스페이스 디렉터리 집합을 서명으로 삼는다 (Bash 로 편집해도 잡힌다)
  const watched = listFiles().filter((f) => matchesAny(WATCH, f));
  const sigSrc = watched.map((f) => { try { const st = fs.statSync(path.join(ROOT, f)); return `${f}:${st.mtimeMs}:${st.size}`; } catch { return f; } }).join('\n') + '|' + workspaceDirs().join(',') + '|' + topDirs().join(',');
  const sig = crypto.createHash('sha1').update(sigSrc).digest('hex');
  const last = readJson('.omc/state/harness-check-last.json') || {};
  const pathWatched = relPath && matchesAny(WATCH, relPath);
  if (last.sig === sig && !pathWatched) process.exit(0);
  const save = (extra) => { try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify({ sig, at: Date.now(), ...extra })); } catch {} };
  const result = run();
  if (!result.findings.length) { save({ hash: null }); process.exit(0); }
  const hash = crypto.createHash('sha1').update(JSON.stringify(result.findings)).digest('hex');
  if (last.hash === hash) { save({ hash }); process.exit(0); } // 같은 결과 반복 주입 억제
  save({ hash });
  const trigger = relPath || (input?.tool_name ? `${input.tool_name} 실행 후 감시 파일 변경` : '감시 파일 변경');
  const ctx = formatHuman(result) + `\n(트리거: ${trigger}. 스택 드리프트·stale 참조가 있으면 이번 작업을 마무리하면서 wannasong-harness-sync 스킬 절차대로 하네스를 갱신·검증하고 --update 로 승인하라. 사용자에게 미루지 말 것.)`;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: ctx } }));
  process.exit(0);
}

if (args.has('--selftest')) {
  // 저장소를 임시 폴더에 복사(node_modules 등 제외)하고 결함을 주입해 검사기가 잡는지 본다. 원본은 건드리지 않는다.
  const results = [];
  const FX = readJson('.claude/harness/selftest-fixtures.json') || {};
  const mkCopy = () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wannasong-harness-selftest-'));
    for (const f of listFiles()) { const dst = path.join(tmp, f); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), dst); }
    return tmp;
  };
  const runIn = (tmp, extra = ['--json']) => JSON.parse(execFileSync(process.execPath, [SELF, ...extra], { env: { ...process.env, CLAUDE_PROJECT_DIR: tmp }, encoding: 'utf8' }));
  const w = (tmp, f, text) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), text); };
  const check = (name, cond, extra = '') => results.push([cond ? 'PASS' : 'FAIL', name, extra]);
  const firstSkill = (tmp) => fs.readdirSync(path.join(tmp, '.claude/skills')).map((d) => `.claude/skills/${d}/SKILL.md`).find((p) => fs.existsSync(path.join(tmp, p)));
  const cases = [
    ['기준선 0건', (tmp) => {}, (f) => f.length === 0, (f) => f.map((x) => x.msg).join(' | ')],
    ['워크스페이스 추가(apps/api, gradle+spring) → HIGH', (tmp) => w(tmp, 'apps/api/build.gradle', FX.gradle),
      (f) => f.some((x) => x.kind === 'stack' && x.sev === 'HIGH' && /워크스페이스 추가: apps\/api.*java-gradle.*org\.springframework/.test(x.msg))],
    ['워크스페이스 프레임워크 추가(hono) → HIGH', (tmp) => { const p = JSON.parse(fs.readFileSync(path.join(tmp, 'apps/web/package.json'), 'utf8')); p.dependencies.hono = '^4'; w(tmp, 'apps/web/package.json', JSON.stringify(p)); },
      (f) => f.some((x) => x.kind === 'stack' && x.sev === 'HIGH' && x.key === 'workspaces.apps/web.frameworks' && /\+hono/.test(x.msg))],
    ['워크스페이스 언어 변경(tsconfig 삭제) → HIGH', (tmp) => { fs.rmSync(path.join(tmp, 'apps/web/tsconfig.json')); for (const f of listFiles().filter((f) => f.startsWith('apps/web/') && /\.tsx?$/.test(f))) fs.rmSync(path.join(tmp, f), { force: true }); },
      (f) => f.some((x) => x.kind === 'stack' && x.sev === 'HIGH' && x.key === 'workspaces.apps/web.language')],
    ['env 키 추가 → LOW', (tmp) => fs.appendFileSync(path.join(tmp, 'apps/web/.env.example'), FX.envLine),
      (f) => f.some((x) => x.kind === 'stack' && x.sev === 'LOW' && x.key === 'workspaces.apps/web.envKeys' && /\+SELFTEST_NEW_KEY/.test(x.msg))],
    ['배포 파일 추가(루트 Dockerfile) → HIGH', (tmp) => w(tmp, 'Dockerfile', FX.dockerfile),
      (f) => f.some((x) => x.kind === 'stack' && x.sev === 'HIGH' && x.key === 'deploy' && /\+Dockerfile/.test(x.msg))],
    ['stale 참조 5종(경로·env·심볼·라우트·이벤트)', (tmp) => fs.appendFileSync(path.join(tmp, firstSkill(tmp)), FX.staleRefs),
      (f) => FX.staleRefKinds.every((w) => f.some((x) => x.kind === 'ref' && x.msg.startsWith(w))), (f) => f.filter((x) => x.kind === 'ref').map((x) => x.msg).join(' | ')],
    ['실존 App Router 라우트는 통과', (tmp) => fs.appendFileSync(path.join(tmp, firstSkill(tmp)), FX.existingRoutes),
      (f) => !f.some((x) => x.kind === 'ref' && /\/api\/health|\/feedback|\/player/.test(x.msg))],
    ['레지스트리: 표에 없는 스킬 + name 불일치', (tmp) => w(tmp, '.claude/skills/wannasong-ghost/SKILL.md', FX.ghostSkill),
      (f) => f.some((x) => x.kind === 'registry' && /누락: wannasong-ghost/.test(x.msg)) && f.some((x) => x.kind === 'registry' && /wannasong-phantom/.test(x.msg))],
    ['pnpm-workspace.yaml 삭제 → workspacesDeclared HIGH', (tmp) => fs.rmSync(path.join(tmp, 'pnpm-workspace.yaml'), { force: true }),
      (f) => f.some((x) => x.kind === 'stack' && x.sev === 'HIGH' && x.key === 'workspacesDeclared')],
    ['패키지 매니저 명령 불일치(npm run in skill) → LOW', (tmp) => fs.appendFileSync(path.join(tmp, firstSkill(tmp)), FX.npmCmd),
      (f) => f.some((x) => x.kind === 'ref' && /패키지 매니저 명령 불일치/.test(x.msg) && /npm run/.test(x.msg))],
    ['외부 문서: 저장소 내부 stale 경로는 플래그, 타 시스템 심볼은 통과', (tmp) => w(tmp, 'docs/selftest-spec.md', FX.externalDoc),
      (f) => f.some((x) => x.kind === 'ref' && /외부 문서/.test(x.doc) && /apps\/web\/lib\/ghost-file\.ts/.test(x.msg)) && !f.some((x) => /외부 문서/.test(x.doc || '') && /ghostBackendSymbol|GHOST_BACKEND_ENV/.test(x.msg))],
    ['레지스트리: 훅 제거 → HIGH', (tmp) => w(tmp, '.claude/settings.json', JSON.stringify({ hooks: {} })),
      (f) => f.some((x) => x.kind === 'registry' && x.sev === 'HIGH' && /훅이 harness-check/.test(x.msg))],
    ['훅: 감시 외 변경은 무출력, 감시 파일 변경은 주입', (tmp) => {
      const hook = (fp) => execFileSync(process.execPath, [SELF, '--hook'], { env: { ...process.env, CLAUDE_PROJECT_DIR: tmp }, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(tmp, fp) } }) });
      const a = hook('README.md'); // 감시 대상 아님, 서명은 최초라 검사는 돌지만 0건 → 무출력
      w(tmp, 'apps/api/go.mod', FX.goMod);
      const b = execFileSync(process.execPath, [SELF, '--hook'], { env: { ...process.env, CLAUDE_PROJECT_DIR: tmp }, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'mkdir apps/api' } }) });
      const c = execFileSync(process.execPath, [SELF, '--hook'], { env: { ...process.env, CLAUDE_PROJECT_DIR: tmp }, encoding: 'utf8', input: '{}' }); // 같은 결과 반복 → 억제
      w(tmp, '.selftest-hook.json', JSON.stringify({ a, b, c }));
    }, (f, tmp) => { const r = JSON.parse(fs.readFileSync(path.join(tmp, '.selftest-hook.json'), 'utf8')); return r.a === '' && /워크스페이스 추가: apps\/api.*go/.test(r.b) && r.c === ''; }],
  ];
  for (const [name, mutate, expect, detail] of cases) {
    const tmp = mkCopy();
    try { mutate(tmp); const f = runIn(tmp).findings; const ok = expect(f, tmp); check(name, ok, ok ? '' : (detail ? detail(f) : f.map((x) => x.msg).join(' | ')).slice(0, 400)); }
    catch (e) { check(name, false, String(e.message || e).slice(0, 400)); }
    finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  for (const [st, name, extra] of results) console.log(`${st}  ${name}${extra ? '  — ' + extra : ''}`);
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log(fails ? `\n[harness-check --selftest] ${fails} FAILED` : '\n[harness-check --selftest] ALL PASS');
  process.exit(fails ? 1 : 0);
}

const result = run();
if (args.has('--json')) console.log(JSON.stringify({ findings: result.findings, stack: result.actual }, null, 2));
else if (args.has('--session')) {
  console.log(formatHuman(result));
  const lessons = recentLessons();
  if (lessons.length) console.log('최근 lessons (tasks/lessons.md): ' + lessons.map((l) => `「${l}」`).join(' · '));
  const open = openTodos();
  if (open) console.log(`열린 todo ${open}건 (tasks/todo.md)`);
} else console.log(formatHuman(result));
process.exit(args.has('--strict') && result.findings.length ? 1 : 0);
