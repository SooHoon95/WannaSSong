// Java realtime 서버 보안·권한 확인. suggest/ytsearch는 Next.js REST로 이전됨.
//   ACCESS_CODE=secret SPEAKER_KEY=spk PORT=3001 COOLDOWN_SEC=0 MAX_PENDING_PER_USER=1 (Java 서버)
//   URL=http://localhost:3001 npm test
import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:3001';
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
const once = (s, ev) => new Promise((r) => s.once(ev, r));
const results = [];
const check = (name, cond, extra = '') => results.push([cond ? 'PASS' : 'FAIL', name, extra]);

const s = io(URL, { transports: ['websocket'] });
await once(s, 'connect');

s.emit('identify', { clientId: 't1' });
let me = await once(s, 'me');
check('코드 없으면 인증 실패', me.ok === false && me.authRequired === true, JSON.stringify(me));
let r = await emit(s, 'request', { kind: 'url', url: 'https://www.youtube.com/watch?v=TW9d8vYrVFQ' });
check('미인증 신청 거부', r.ok === false && /입장 코드/.test(r.error), r.error);

s.emit('identify', { clientId: 't1', code: 'wrong' });
me = await once(s, 'me');
check('틀린 코드 거부', me.ok === false);

s.emit('identify', { clientId: 't1', code: 'secret' });
me = await once(s, 'me');
check('맞는 코드 인증', me.ok === true);
r = await emit(s, 'request', { kind: 'url', url: 'https://www.youtube.com/watch?v=TW9d8vYrVFQ' });
check('인증 후 신청 성공', r.ok === true, r.error || r.item?.title);

r = await emit(s, 'request', { kind: 'url', url: 'https://www.youtube.com/watch?v=K4DyBUG242c' });
check('두 번째 신청 성공', r.ok === true, r.error || r.item?.title);
r = await emit(s, 'request', { kind: 'url', url: 'https://www.youtube.com/watch?v=jK2aIUmmdP4' });
check('대기 상한 → 세 번째 신청 거부', r.ok === false && /이미.*곡/.test(r.error), r.error);

r = await emit(s, 'speaker:claim', {});
check('키 없이 스피커 claim 거부', r.ok === false && r.needKey === true, r.reason);
r = await emit(s, 'speaker:claim', { key: 'spk' });
check('맞는 키로 스피커 claim', r.ok === true, r.reason);

const s2 = io(URL, { transports: ['websocket'] });
await once(s2, 'connect');
r = await emit(s2, 'speaker:claim', { key: 'spk' });
check('두 번째 스피커 거부', r.ok === false && /이미/.test(r.reason), r.reason);

const getState = () =>
  new Promise((resolve) => {
    const t = io(URL, { transports: ['websocket'] });
    t.once('state', (st) => {
      t.close();
      resolve(st);
    });
  });
const before = await getState();
s2.emit('identify', { clientId: 't2', code: 'secret' });
s2.emit('speaker:skip');
s2.emit('speaker:release');
s2.emit('speaker:ended', { videoId: before.nowPlaying?.videoId });
s2.emit('speaker:error', { videoId: before.nowPlaying?.videoId, code: 150 });
await new Promise((res) => setTimeout(res, 2500));
const afterState = await getState();
check(
  '비스피커 skip/release/ended/error 무시',
  afterState.speakerOnline === true && afterState.nowPlaying?.videoId === before.nowPlaying?.videoId,
  `${before.nowPlaying?.videoId} → ${afterState.nowPlaying?.videoId}`,
);

const s3 = io(URL, { transports: ['websocket'] });
await once(s3, 'connect');
r = await emit(s3, 'feedback', { text: '미인증 건의' });
check('미인증 건의 거부', r.ok === false, r.error);
s3.emit('identify', { clientId: 't3', code: 'secret' });
await once(s3, 'me');
r = await emit(s3, 'feedback', { text: '테스트 건의사항입니다' });
check('건의사항 접수', r.ok === true, r.error);
for (let i = 0; i < 3; i++) r = await emit(s3, 'feedback', { text: '스팸 ' + i });
check('건의 4회째 레이트 리밋', /너무 잦/.test(r.error), r.error);

const WEB = process.env.WEB || 'http://localhost:3000';
const fbRes = await fetch(`${WEB}/api/feedback`);
check('키 없이 건의 목록 조회 거부', fbRes.status === 401, String(fbRes.status));
const fbList = await (await fetch(`${WEB}/api/feedback?key=spk`)).json();
check('키로 건의 목록 조회', Array.isArray(fbList) && fbList.some((f) => f.text === '테스트 건의사항입니다'), `${fbList.length}건`);

for (const [st, name, extra] of results) console.log(`${st}  ${name}${extra ? '  — ' + extra : ''}`);
const fails = results.filter((x) => x[0] === 'FAIL').length;
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
s.close();
s2.close();
s3.close();
process.exit(fails ? 1 : 0);
