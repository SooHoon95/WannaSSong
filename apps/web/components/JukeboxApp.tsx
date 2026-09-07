'use client';

import type { ItunesResult, PublicState, QueueItem, Track } from '@wannasong/contract';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { YouTubeScript } from '@/components/YouTubeScript';
import { useSocket } from '@/hooks/useSocket';
import { useToast } from '@/hooks/useToast';
import {
  fmt,
  getClientId,
  getSpeakerKey,
  getStoredCode,
  isMobile,
  setSpeakerKey,
  setStoredCode,
  setWasSpeaker,
  wasSpeaker,
  who,
} from '@/lib/utils';

const STALL_MS = 45_000;

type Tab = 'song' | 'yt';
type Role = 'viewer' | 'speaker';

export default function JukeboxApp() {
  const clientId = useRef(getClientId()).current;
  const [code, setCode] = useState(getStoredCode);
  const { socket, connected, state, playback, setPlayback, me, identify, hasRealtime } = useSocket(clientId, code);
  const { msg, err, visible, toast } = useToast();

  const [role, setRole] = useState<Role>('viewer');
  const [tab, setTab] = useState<Tab>('song');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrls, setShareUrls] = useState<string[]>([]);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [wakeStatus, setWakeStatus] = useState('');

  const [q, setQ] = useState('');
  const [suggestResults, setSuggestResults] = useState<ItunesResult[]>([]);
  const [ytq, setYtq] = useState('');
  const [ytResults, setYtResults] = useState<Track[]>([]);
  const [ytLoading, setYtLoading] = useState(false);

  const playerRef = useRef<YT.Player | null>(null);
  const playerReady = useRef(false);
  const loadedVideoId = useRef<string | null>(null);
  const ytApiReady = useRef(false);
  const autoResume = useRef(wasSpeaker());
  const needGesture = useRef(false);
  const everPlayed = useRef(false);
  const wd = useRef({ lastPos: -1, lastProgressAt: 0, loadedAt: 0, retried: false });
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const suggestTimer = useRef<number>(0);

  // URL ?key= 처리
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('key');
    if (key) {
      setSpeakerKey(key);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (me?.cooldownRemainingMs !== undefined) {
      setCooldownUntil(Date.now() + Math.max(0, me.cooldownRemainingMs));
    }
    if (me?.authRequired && me.ok === false && code) toast('입장 코드가 틀렸습니다.', true);
  }, [me, code, toast]);

  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then((info) => {
        let urls = [window.location.origin];
        if (info.publicUrl) urls = [info.publicUrl];
        else if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && info.lanUrls?.length) {
          urls = info.lanUrls;
        }
        setShareUrls(urls);
      })
      .catch(() => setShareUrls([window.location.origin]));
  }, []);

  const ensurePlayer = useCallback(() => {
    if (playerRef.current || !ytApiReady.current || !window.YT?.Player) return;
    playerRef.current = new window.YT.Player('yt', {
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, controls: 1, origin: window.location.origin },
      events: {
        onReady: () => {
          playerReady.current = true;
          syncPlayer();
        },
        onStateChange: (e) => {
          if (role !== 'speaker' || !state?.nowPlaying) return;
          if (e.data === YT.PlayerState.ENDED) {
            socket.current?.emit('speaker:ended', { videoId: state.nowPlaying.videoId });
          }
          if (e.data === YT.PlayerState.CUED) playerRef.current?.playVideo();
        },
        onError: (e) => {
          if (role === 'speaker' && state?.nowPlaying) {
            socket.current?.emit('speaker:error', { videoId: state.nowPlaying.videoId, code: e.data });
          }
        },
      },
    });
  }, [role, state?.nowPlaying, socket]);

  const syncPlayer = useCallback(() => {
    if (role !== 'speaker' || !playerRef.current || !playerReady.current || !state) return;
    const np = state.nowPlaying;
    if (!np) {
      if (loadedVideoId.current) {
        playerRef.current.stopVideo();
        loadedVideoId.current = null;
      }
      return;
    }
    if (np.videoId !== loadedVideoId.current) {
      loadedVideoId.current = np.videoId;
      wd.current = { lastPos: -1, lastProgressAt: Date.now(), loadedAt: Date.now(), retried: false };
      playerRef.current.loadVideoById(np.videoId);
      playerRef.current.playVideo();
    }
  }, [role, state]);

  useEffect(() => {
    const onReady = () => {
      ytApiReady.current = true;
      if (role === 'speaker') ensurePlayer();
    };
    if (window.YT?.Player) onReady();
    else window.addEventListener('yt-api-ready', onReady);
    return () => window.removeEventListener('yt-api-ready', onReady);
  }, [role, ensurePlayer]);

  useEffect(() => {
    syncPlayer();
  }, [syncPlayer, state?.nowPlaying?.videoId]);

  const stopLocalPlayback = () => {
    document.body.classList.remove('is-speaker');
    if (playerRef.current && playerReady.current) {
      try {
        playerRef.current.stopVideo();
      } catch {
        /* ignore */
      }
    }
    loadedVideoId.current = null;
    try {
      wakeLockRef.current?.release();
    } catch {
      /* ignore */
    }
    wakeLockRef.current = null;
  };

  const keepAwake = async () => {
    if (!('wakeLock' in navigator)) {
      setWakeStatus('화면 꺼짐 방지 미지원 — PC 절전을 꺼 두세요');
      return;
    }
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setWakeStatus('화면 꺼짐 방지 켜짐');
      wakeLockRef.current.addEventListener('release', () => setWakeStatus('화면 꺼짐 방지 해제됨'));
    } catch {
      setWakeStatus('화면 꺼짐 방지 거부됨 — PC 절전을 꺼 두세요');
    }
  };

  const claim = (silent = false) => {
    const key = getSpeakerKey();
    socket.current?.emit('speaker:claim', { key }, (res: { ok: boolean; reason?: string; needKey?: boolean }) => {
      if (!res.ok && res.needKey && !silent) {
        const k = prompt('스피커 키를 입력하세요 (관리자에게 문의)');
        if (k) {
          setSpeakerKey(k.trim());
          return claim();
        }
      }
      if (!res.ok) {
        if (role === 'speaker') {
          setRole('viewer');
          stopLocalPlayback();
        }
        if (!silent) toast(res.reason || '스피커 연결 실패', true);
        return;
      }
      setRole('speaker');
      setWasSpeaker(true);
      document.body.classList.add('is-speaker');
      keepAwake();
      ensurePlayer();
      syncPlayer();
      setShareOpen(true);
    });
  };

  useEffect(() => {
    if (!connected) return;
    if (role === 'speaker' || autoResume.current) {
      autoResume.current = false;
      claim(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const release = () => {
    socket.current?.emit('speaker:release');
    setWasSpeaker(false);
    setRole('viewer');
    stopLocalPlayback();
  };

  const request = (payload: Record<string, unknown>) => {
    if (state?.authRequired && !code.trim()) {
      toast('입장 코드를 입력해 주세요.', true);
      return;
    }
    identify();
    socket.current?.emit('request', payload, (res: { ok: boolean; error?: string; item?: QueueItem; cooldownRemainingMs?: number }) => {
      if (res.ok && res.item) {
        toast(`신청 완료: ${res.item.title}`);
        setCooldownUntil(Date.now() + (res.cooldownRemainingMs || 0));
        setSuggestResults([]);
        setQ('');
        setYtResults([]);
      } else {
        toast(res.error || '신청 실패', true);
        if (res.cooldownRemainingMs) setCooldownUntil(Date.now() + res.cooldownRemainingMs);
      }
    });
  };

  // 1초 tick
  useEffect(() => {
    const id = window.setInterval(() => {
      let p = pos;
      let d = dur;
      if (role === 'speaker' && playerRef.current && playerReady.current) {
        const st = playerRef.current.getPlayerState?.();
        const status =
          st === YT.PlayerState.PLAYING
            ? 'playing'
            : st === YT.PlayerState.PAUSED
              ? 'paused'
              : st === YT.PlayerState.BUFFERING
                ? 'buffering'
                : 'loading';
        p = playerRef.current.getCurrentTime?.() || 0;
        d = playerRef.current.getDuration?.() || 0;
        if (state?.nowPlaying) {
          const now = Date.now();
          socket.current?.emit('speaker:tick', { position: p, duration: d, status });
          if (st === YT.PlayerState.PLAYING) {
            everPlayed.current = true;
            if (needGesture.current) needGesture.current = false;
            if (p !== wd.current.lastPos) {
              wd.current.lastPos = p;
              wd.current.lastProgressAt = now;
            }
          } else if (st === YT.PlayerState.PAUSED) {
            wd.current.lastProgressAt = now;
          } else {
            if (!everPlayed.current && !needGesture.current && now - wd.current.loadedAt > 8_000) {
              needGesture.current = true;
            }
            if (everPlayed.current && now - wd.current.lastProgressAt > STALL_MS) {
              wd.current.lastProgressAt = now;
              if (!wd.current.retried) {
                wd.current.retried = true;
                playerRef.current.loadVideoById(state.nowPlaying.videoId);
                playerRef.current.playVideo();
              } else {
                socket.current?.emit('speaker:error', { videoId: state.nowPlaying.videoId, code: 'stalled' });
              }
            }
          }
          if (d > 0 && p >= d - 0.5 && st !== YT.PlayerState.PLAYING && now - wd.current.lastProgressAt > 5_000) {
            wd.current.lastProgressAt = now;
            socket.current?.emit('speaker:ended', { videoId: state.nowPlaying.videoId });
          }
        }
      } else {
        p = playback.position + (playback.status === 'playing' ? (Date.now() - playback.updatedAt) / 1000 : 0);
        d = playback.duration || 0;
      }
      setPos(p);
      setDur(d);
    }, 1000);
    return () => clearInterval(id);
  }, [role, state?.nowPlaying, playback, socket]);

  useEffect(() => {
    const h = () => {
      if (document.visibilityState === 'visible' && role === 'speaker') keepAwake();
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [role]);

  const onSuggestInput = (value: string) => {
    setQ(value);
    clearTimeout(suggestTimer.current);
    if (!value.trim()) {
      setSuggestResults([]);
      return;
    }
    suggestTimer.current = window.setTimeout(async () => {
      try {
        const r = await fetch('/api/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: value.trim() }),
        });
        const res = await r.json();
        if (!res.ok) return toast(res.error, true);
        setSuggestResults(res.results || []);
      } catch {
        toast('검색 중 오류', true);
      }
    }, 350);
  };

  const ytSearch = async () => {
    const term = ytq.trim();
    if (!term) return;
    setYtLoading(true);
    try {
      const r = await fetch('/api/ytsearch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: term }),
      });
      const res = await r.json();
      if (!res.ok) return toast(res.error, true);
      setYtResults(res.results || []);
    } catch {
      toast('검색 중 오류', true);
    } finally {
      setYtLoading(false);
    }
  };

  const np = state?.nowPlaying;
  const gestureNeeded = role === 'speaker' && needGesture.current;
  const noKey = state?.speakerKeyRequired && !getSpeakerKey() && role !== 'speaker';
  const showClaim =
    !((state?.speakerOnline && role !== 'speaker' && !gestureNeeded) || noKey);

  let badgeText = '연결 중…';
  let badgeClass = 'badge';
  if (!hasRealtime) {
    badgeText = '실시간 서버 미설정';
    badgeClass = 'badge off';
  } else if (!connected) {
    badgeText = '서버 연결 끊김';
    badgeClass = 'badge off';
  } else if (role === 'speaker') {
    badgeText = '🔊 이 기기에서 재생 중';
    badgeClass = 'badge on';
  } else if (state?.speakerOnline) {
    badgeText = '다른 기기에서 재생 중';
    badgeClass = 'badge on';
  } else {
    badgeText = '재생 중인 기기 없음';
    badgeClass = 'badge off';
  }

  const viewerMsg = gestureNeeded
    ? '브라우저가 자동재생을 막았어요. 한 번 눌러 주면 이후로는 자동으로 이어집니다'
    : state?.speakerOnline
      ? '스피커에 연결된 다른 기기가 재생하고 있어요'
      : noKey
        ? '재생은 스피커 키가 등록된 PC에서만 할 수 있어요'
        : '스피커에 연결된 PC에서 이 버튼을 눌러 주세요';

  const cooldownRem = cooldownUntil - Date.now();
  const searchEnabled = state ? state.searchEnabled : true;

  return (
    <>
      <YouTubeScript />
      <div className="wrap wide">
        <header>
          <h1>🎶 WannaSong</h1>
          <div className="row">
            {state?.authRequired && (
              <input
                placeholder="입장 코드"
                maxLength={64}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setStoredCode(e.target.value.trim());
                }}
                style={{ maxWidth: 150, padding: '7px 12px', borderColor: me?.authRequired && me.ok === false ? 'var(--accent)' : undefined }}
              />
            )}
            <span className={badgeClass}>{badgeText}</span>
          </div>
        </header>

        <div className="main-grid">
          <section className="col">
            <div className="card">
              <div className="video">
                <div id="yt" />
                {(role !== 'speaker' || gestureNeeded) && (
                  <div className="viewer">
                    {np?.thumb && <img src={np.thumb} alt="" />}
                    <div className="viewer-overlay">
                      {showClaim && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            if (role === 'speaker') {
                              needGesture.current = false;
                              playerRef.current?.playVideo();
                              return;
                            }
                            if (isMobile && !confirm('모바일은 화면이 꺼지거나 다른 앱으로 나가면 재생이 멈춥니다. 스피커에 연결된 PC에서 여는 것을 권장합니다.\n그래도 이 기기에서 재생할까요?')) return;
                            claim();
                          }}
                        >
                          {gestureNeeded ? '▶ 재생 재개' : '🔊 이 기기에서 재생'}
                        </button>
                      )}
                      <p>{viewerMsg}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="np">
                <div className="title">{np ? np.title : state?.fallbackCount ? '대기 중…' : '아직 재생 중인 곡이 없습니다'}</div>
                <div className="sub">{np ? `${np.author} · ${who(np, clientId)}` : ''}</div>
                <div className="progress">
                  <div style={{ width: dur ? `${Math.min(100, (pos / dur) * 100)}%` : '0%' }} />
                </div>
                <div className="time">
                  <span>{fmt(pos)}</span>
                  <span>{fmt(dur)}</span>
                </div>
              </div>
              {role === 'speaker' && (
                <div className="row speaker-controls">
                  <button type="button" onClick={() => socket.current?.emit('speaker:skip')}>⏭ 다음 곡</button>
                  <button type="button" onClick={release}>스피커 해제</button>
                  {(state?.fallbackCategories?.length || 0) > 1 && (
                    <label className="cat-pick">
                      자동 재생{' '}
                      <select
                        value={state?.fallbackCategory || ''}
                        onChange={(e) => {
                          socket.current?.emit('fallback:set', { name: e.target.value }, (res: { ok?: boolean }) => {
                            if (res?.ok) toast(`자동 재생을 "${e.target.value}" 로 바꿨어요. 다음 자동 재생 곡부터 적용됩니다.`);
                            else toast('카테고리를 바꿀 수 없습니다.', true);
                          });
                        }}
                      >
                        {state?.fallbackCategories?.map((c) => (
                          <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <span className="hint" style={{ margin: 0 }}>{wakeStatus}</span>
                </div>
              )}
              <details className="share-box" open={shareOpen || role === 'speaker'} onToggle={(e) => setShareOpen((e.target as HTMLDetailsElement).open)}>
                <summary>📱 폰으로 접속 (QR · 주소)</summary>
                <div className="share">
                  <div id="qr">{shareUrls[0] && <QRCodeSVG value={shareUrls[0]} size={120} />}</div>
                  <div>
                    <p className="hint" style={{ margin: '0 0 6px' }}>QR을 찍거나 아래 주소로 접속하면 바로 신청할 수 있어요</p>
                    <div className="urls">{shareUrls.map((u) => <code key={u}>{u}</code>)}</div>
                  </div>
                </div>
              </details>
            </div>

            <div className="card">
              <details>
                <summary>최근 재생 기록</summary>
                <ul className="list" style={{ marginTop: 10 }}>
                  {state?.history?.length ? (
                    state.history.map((h) => (
                      <li key={h.id}>
                        <span className="n">·</span>
                        <img src={h.thumb} alt="" />
                        <div>
                          <div className="t">{h.title}</div>
                          <div className="s">{h.author} · {who(h, clientId)}</div>
                        </div>
                        <span />
                      </li>
                    ))
                  ) : (
                    <li className="empty" style={{ display: 'block' }}>기록 없음</li>
                  )}
                </ul>
              </details>
            </div>
          </section>

          <section className="col">
            <div className="card">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <h2 style={{ margin: 0 }}>신청하기</h2>
                <span className={`badge cooldown ${cooldownRem > 0 ? 'off' : 'on'}`}>
                  {cooldownRem > 0 ? `다음 신청까지 ${fmt(cooldownRem / 1000)}` : '신청 가능'}
                </span>
              </div>
              <div className="tabs">
                <button type="button" className={tab === 'song' ? 'active' : ''} onClick={() => setTab('song')}>곡 검색</button>
                {searchEnabled && (
                  <button type="button" className={tab === 'yt' ? 'active' : ''} onClick={() => setTab('yt')}>YouTube 검색</button>
                )}
              </div>
              {tab === 'song' && (
                <div>
                  <input placeholder="곡 제목이나 가수 (예: 뉴진스 Hype Boy)" autoComplete="off" value={q} onChange={(e) => onSuggestInput(e.target.value)} />
                  <ul className="list results">
                    {suggestResults.map((r, i) => (
                      <li key={`${r.artist}-${r.title}-${i}`}>
                        <img src={r.artwork} alt="" />
                        <div>
                          <div className="t">{r.title}</div>
                          <div className="s">{r.artist} · {r.album || ''}</div>
                        </div>
                        <button type="button" className="primary" onClick={() => request({ kind: 'itunes', artist: r.artist, title: r.title })}>신청</button>
                      </li>
                    ))}
                    {q && !suggestResults.length && (
                      <li className="empty" style={{ display: 'block' }}>
                        {searchEnabled ? '결과 없음 — YouTube 검색 탭을 써 보세요' : '결과 없음'}
                      </li>
                    )}
                  </ul>
                  <p className="hint">
                    {searchEnabled
                      ? '곡 후보는 iTunes에서 무료로 찾고, 신청을 누를 때만 YouTube에서 1번 검색합니다.'
                      : '서버에 YouTube API 키가 없어 신청·YouTube 검색을 쓸 수 없습니다.'}
                  </p>
                </div>
              )}
              {tab === 'yt' && searchEnabled && (
                <div>
                  <div className="row">
                    <input placeholder="YouTube에서 직접 검색 (라이브, 커버 등)" value={ytq} onChange={(e) => setYtq(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ytSearch()} />
                    <button type="button" onClick={ytSearch} disabled={ytLoading}>검색</button>
                  </div>
                  <ul className="list results">
                    {ytResults.map((r, i) => (
                      <li key={`${r.videoId}-${i}`}>
                        <img src={r.thumb} alt="" />
                        <div>
                          <div className="t">{r.title}</div>
                          <div className="s">{r.author}</div>
                        </div>
                        <button type="button" className="primary" onClick={() => request({ kind: 'video', ...r })}>신청</button>
                      </li>
                    ))}
                    {ytq && !ytResults.length && !ytLoading && <li className="empty" style={{ display: 'block' }}>결과 없음</li>}
                  </ul>
                  <p className="hint">하루 검색 한도가 있어요(기본 100회). 곡 검색에서 안 나올 때만 써 주세요.</p>
                </div>
              )}
            </div>

            <div className="card">
              <h2>대기열 {state?.queue?.length ? <span className="badge">{state.queue.length}곡</span> : null}</h2>
              <ul className="list">
                {state?.queue?.length ? (
                  state.queue.map((item, i) => (
                    <li key={item.id}>
                      <span className="n">{i + 1}</span>
                      <img src={item.thumb} alt="" />
                      <div>
                        <div className="t">{item.title}</div>
                        <div className="s">{item.author} · {who(item, clientId)}</div>
                      </div>
                      {item.requestedBy?.clientId === clientId ? (
                        <button
                          type="button"
                          className="x"
                          title="취소"
                          onClick={() =>
                            socket.current?.emit('remove', { id: item.id }, (res: { ok: boolean }) => {
                              if (res.ok) {
                                toast('신청을 취소했습니다.');
                                setCooldownUntil(0);
                              }
                            })
                          }
                        >
                          ✕
                        </button>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))
                ) : (
                  <li className="empty" style={{ display: 'block' }}>
                    대기열이 비어 있어요.
                    {state?.fallbackCount ? ` 자동 재생${state.fallbackCategory ? ` · ${state.fallbackCategory}` : ''} 목록이 나옵니다.` : ''}
                  </li>
                )}
              </ul>
            </div>
          </section>
        </div>

        <footer className="ver">
          <span>{state?.version ? `v${state.version}` : ''}</span> · <Link href="/feedback">문의 / 건의사항</Link>
        </footer>
      </div>
      <div className={`toast ${visible ? 'show' : ''} ${err ? 'err' : ''}`}>{msg}</div>
    </>
  );
}
