export const ERR_CODES = [
  'COOLDOWN',
  'DUPLICATE',
  'NOT_FOUND',
  'BAD_URL',
  'UNAVAILABLE',
  'NO_API_KEY',
  'QUOTA_EXCEEDED',
  'AUTH_REQUIRED',
  'RATE_LIMITED',
  'FEEDBACK_EMPTY',
  'QUEUE_FULL',
  'TOO_MANY_PENDING',
] as const;

export type ErrCode = (typeof ERR_CODES)[number];

export const ERR_MSG: Record<ErrCode, string> = {
  COOLDOWN: '아직 쿨다운 중입니다.',
  DUPLICATE: '이미 대기열에 있는 곡입니다.',
  NOT_FOUND: 'YouTube에서 해당 곡을 찾지 못했습니다.',
  BAD_URL: 'YouTube 링크를 인식할 수 없습니다.',
  UNAVAILABLE: '재생할 수 없는 영상입니다(비공개/삭제).',
  NO_API_KEY: 'YouTube API 키가 설정되지 않아 검색은 불가합니다. 링크를 붙여넣어 주세요.',
  QUOTA_EXCEEDED: '오늘 YouTube 검색 한도를 모두 썼습니다. 링크 붙여넣기는 계속 됩니다.',
  AUTH_REQUIRED: '입장 코드가 틀렸거나 입력되지 않았습니다.',
  RATE_LIMITED: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
  FEEDBACK_EMPTY: '내용을 입력해 주세요.',
  QUEUE_FULL: '대기열이 가득 찼습니다. 잠시 후 다시 신청해 주세요.',
  TOO_MANY_PENDING: '대기 중인 내 신청곡이 이미 최대치입니다. 재생된 뒤 다시 신청해 주세요.',
};

export function errMsg(code: string | undefined, maxPending = 3): string {
  if (code === 'TOO_MANY_PENDING') {
    return `대기 중인 내 신청곡이 이미 ${maxPending}곡입니다. 재생된 뒤 다시 신청해 주세요.`;
  }
  return ERR_MSG[code as ErrCode] || '처리 중 오류가 났습니다. 다시 시도해 주세요.';
}
