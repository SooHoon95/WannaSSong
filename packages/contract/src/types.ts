export interface Track {
  videoId: string;
  title: string;
  author: string;
  thumb?: string;
}

export interface QueueItem extends Track {
  id: string;
  category?: string;
  requestedBy: { clientId: string } | null;
  requestedAt: number;
  source: 'request' | 'fallback';
}

export interface HistoryItem extends QueueItem {
  endedAt?: number;
  endReason?: 'ended' | 'skipped' | 'error' | 'start';
}

export interface Playback {
  position: number;
  duration: number;
  status: string;
  updatedAt: number;
}

export interface FallbackCategory {
  name: string;
  count: number;
}

export interface PublicState {
  nowPlaying: QueueItem | null;
  queue: QueueItem[];
  history: HistoryItem[];
  speakerOnline: boolean;
  cooldownSec: number;
  searchEnabled: boolean;
  authRequired: boolean;
  speakerKeyRequired: boolean;
  version: string;
  fallbackCount: number;
  fallbackCategory: string;
  fallbackCategories: FallbackCategory[];
  playback: Playback;
}

export interface PersistedState {
  queue: QueueItem[];
  history: HistoryItem[];
  lastRequestAt: Record<string, number>;
  fallbackCategory: string;
}

export interface FeedbackItem {
  id: string;
  text: string;
  at: string;
  clientId?: string | null;
}

export interface Heartbeat {
  speakerOnline: boolean;
  at: string;
}

export interface ItunesResult {
  artist: string;
  title: string;
  album?: string;
  artwork?: string;
  durationMs?: number;
}

export interface MeResponse {
  ok: boolean;
  authRequired?: boolean;
  cooldownRemainingMs?: number;
}

export interface AckResponse<T = unknown> {
  ok: boolean;
  error?: string;
  reason?: string;
  needKey?: boolean;
  cooldownRemainingMs?: number;
  item?: QueueItem;
  results?: ItunesResult[] | Track[];
}
