import { kv } from '@vercel/kv';
import { KV_KEYS, type FeedbackItem, type Heartbeat } from '@wannasong/contract';

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function getFeedback(): Promise<FeedbackItem[]> {
  if (!kvConfigured()) return [];
  try {
    const list = await kv.get<FeedbackItem[]>(KV_KEYS.feedback);
    return list ?? [];
  } catch {
    return [];
  }
}

export async function getHeartbeat(): Promise<Heartbeat | null> {
  if (!kvConfigured()) return null;
  try {
    return (await kv.get<Heartbeat>(KV_KEYS.heartbeat)) ?? null;
  } catch {
    return null;
  }
}
