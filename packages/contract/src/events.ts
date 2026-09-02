/** 클라이언트 → 서버 Socket.IO 이벤트 (Java realtime 서버 구현 대상) */
export const CLIENT_EVENTS = {
  identify: 'identify',
  suggest: 'suggest',
  ytsearch: 'ytsearch',
  request: 'request',
  remove: 'remove',
  speakerClaim: 'speaker:claim',
  speakerTick: 'speaker:tick',
  speakerEnded: 'speaker:ended',
  speakerError: 'speaker:error',
  speakerSkip: 'speaker:skip',
  fallbackSet: 'fallback:set',
  speakerRelease: 'speaker:release',
  feedback: 'feedback',
} as const;

/** 서버 → 클라이언트 Socket.IO 이벤트 */
export const SERVER_EVENTS = {
  state: 'state',
  tick: 'tick',
  me: 'me',
} as const;

/** identify: 20/min, suggest: 40/min (Next.js REST로 이전), ytsearch: 5/min (REST), request: 10/min */
export const RATE_LIMITS = {
  identify: { max: 20, windowMs: 60_000 },
  suggest: { max: 40, windowMs: 60_000 },
  ytsearch: { max: 5, windowMs: 60_000 },
  request: { max: 10, windowMs: 60_000 },
  claim: { max: 10, windowMs: 60_000 },
  feedback: { max: 3, windowMs: 10 * 60_000 },
} as const;

export const HISTORY_MAX = 200;
export const FEEDBACK_MAX = 1000;
export const POOL_MAX_PER_CATEGORY = 500;
