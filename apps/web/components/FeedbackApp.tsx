'use client';

import type { PublicState } from '@wannasong/contract';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useToast } from '@/hooks/useToast';
import { getClientId, getSpeakerKey, getStoredCode, setSpeakerKey, setStoredCode } from '@/lib/utils';

export default function FeedbackApp() {
  const clientId = useRef(getClientId()).current;
  const [code, setCode] = useState(getStoredCode);
  const [text, setText] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [list, setList] = useState<{ id: string; text: string; at: string }[]>([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [keyRowHidden, setKeyRowHidden] = useState(false);
  const { socket, state, me, identify } = useSocket(clientId, code);
  const { msg, err, visible, toast } = useToast();

  useEffect(() => {
    if (me?.authRequired && me.ok === false && code) toast('입장 코드가 틀렸습니다.', true);
  }, [me, code, toast]);

  const send = () => {
    const body = text.trim();
    if (body.length < 2) return toast('내용을 입력해 주세요.', true);
    if (state?.authRequired && !code.trim()) {
      toast('입장 코드를 입력해 주세요.', true);
      return;
    }
    identify();
    socket.current?.emit('feedback', { text: body }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        toast('보냈습니다. 감사합니다!');
        setText('');
        if (adminOpen) loadList();
      } else toast(res.error || '전송 실패', true);
    });
  };

  const loadList = async () => {
    const key = adminKey.trim() || getSpeakerKey();
    const r = await fetch(`/api/feedback?key=${encodeURIComponent(key)}`);
    if (r.status === 401) {
      setList([]);
      setKeyRowHidden(false);
      return;
    }
    if (key) setSpeakerKey(key);
    const data = await r.json();
    setList(data);
    setKeyRowHidden(true);
  };

  return (
    <div className="wrap">
      <header>
        <h1>📮 문의 / 건의사항</h1>
        <Link className="badge" href="/">← 신청곡으로</Link>
      </header>

      <section className="card">
        <h2>보내기</h2>
        {state?.authRequired && (
          <input
            placeholder="입장 코드"
            maxLength={64}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setStoredCode(e.target.value.trim());
            }}
            style={{ maxWidth: 160, marginBottom: 10 }}
          />
        )}
        <textarea rows={4} maxLength={500} placeholder="불편한 점, 추가되면 좋을 기능, 버그를 적어 주세요. 익명으로 접수됩니다." value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <span className="hint" style={{ margin: '0 auto 0 0' }}>{text.length} / 500</span>
          <button type="button" className="primary" onClick={send}>보내기</button>
        </div>
      </section>

      <section className="card">
        <details
          onToggle={(e) => {
            const open = (e.target as HTMLDetailsElement).open;
            setAdminOpen(open);
            if (open && getSpeakerKey()) loadList();
          }}
        >
          <summary>접수 목록 (관리자)</summary>
          {!keyRowHidden && (
            <div className="row" style={{ margin: '10px 0' }}>
              <input placeholder="관리 키 (SPEAKER_KEY)" type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadList()} />
              <button type="button" onClick={loadList}>보기</button>
            </div>
          )}
          <ul className="fb">
            {list.length ? (
              list.map((f) => (
                <li key={f.id}>
                  <div className="fb-text">{f.text}</div>
                  <div className="s">{new Date(f.at).toLocaleString('ko-KR')}</div>
                </li>
              ))
            ) : (
              <li className="empty">{keyRowHidden ? '아직 접수된 건의사항이 없습니다.' : '관리 키가 필요합니다.'}</li>
            )}
          </ul>
        </details>
      </section>

      <footer className="ver"><span>{state?.version ? `v${state.version}` : ''}</span></footer>
      <div className={`toast ${visible ? 'show' : ''} ${err ? 'err' : ''}`}>{msg}</div>
    </div>
  );
}
