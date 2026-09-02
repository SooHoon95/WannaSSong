// REST API smoke test. dev 서버가 떠 있어야 함: npm run dev
const BASE = process.env.BASE || 'http://localhost:3000';
const results = [];
const check = (name, cond, extra = '') => results.push([cond ? 'PASS' : 'FAIL', name, extra]);

const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
check('GET /api/health ok', health.ok === true, JSON.stringify(health));

const info = await fetch(`${BASE}/api/info`).then((r) => r.json());
check('GET /api/info version', typeof info.version === 'string', info.version);

const suggest = await fetch(`${BASE}/api/suggest`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ q: 'BTS' }),
}).then((r) => r.json());
check('POST /api/suggest', suggest.ok === true && Array.isArray(suggest.results), String(suggest.results?.length));

const fb401 = await fetch(`${BASE}/api/feedback`);
check('GET /api/feedback without key', fb401.status === 401 || fb401.status === 200, String(fb401.status));

const yt = await fetch(`${BASE}/api/ytsearch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ q: 'test' }),
}).then((r) => r.json());
check('POST /api/ytsearch responds', yt.ok === true || /API 키|한도/.test(yt.error || ''), yt.error || 'ok');

for (const [st, name, extra] of results) console.log(`${st}  ${name}${extra ? '  — ' + extra : ''}`);
const fails = results.filter((x) => x[0] === 'FAIL').length;
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
