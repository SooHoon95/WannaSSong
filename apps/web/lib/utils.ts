export function fmt(sec: number) {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export function getClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('jb.clientId');
  if (!id) {
    id = crypto.randomUUID?.() || `${Math.random()}`.slice(2) + Date.now();
    localStorage.setItem('jb.clientId', id);
  }
  return id;
}

export function getStoredCode() {
  return typeof window !== 'undefined' ? localStorage.getItem('jb.code') || '' : '';
}

export function setStoredCode(code: string) {
  localStorage.setItem('jb.code', code);
}

export function getSpeakerKey() {
  return typeof window !== 'undefined' ? localStorage.getItem('jb.speakerKey') || '' : '';
}

export function setSpeakerKey(key: string) {
  localStorage.setItem('jb.speakerKey', key);
}

export function wasSpeaker() {
  return typeof window !== 'undefined' && localStorage.getItem('jb.wasSpeaker') === '1';
}

export function setWasSpeaker(on: boolean) {
  if (on) localStorage.setItem('jb.wasSpeaker', '1');
  else localStorage.removeItem('jb.wasSpeaker');
}

export const isMobile =
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));

export function who(item: { requestedBy?: { clientId: string } | null; category?: string; source?: string }, clientId: string) {
  if (item.requestedBy) return item.requestedBy.clientId === clientId ? '내 신청곡' : '신청곡';
  return `자동 재생${item.category ? ` · ${item.category}` : ''}`;
}
