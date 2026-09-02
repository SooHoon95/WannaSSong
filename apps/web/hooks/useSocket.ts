'use client';

import type { MeResponse, PublicState } from '@wannasong/contract';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL || '';

export function useSocket(clientId: string, code: string) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<PublicState | null>(null);
  const [playback, setPlayback] = useState<PublicState['playback']>({
    position: 0,
    duration: 0,
    status: 'idle',
    updatedAt: Date.now(),
  });
  const [me, setMe] = useState<MeResponse | null>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  const identify = () => {
    socketRef.current?.emit('identify', { clientId, code: codeRef.current.trim() });
  };

  useEffect(() => {
    if (!REALTIME_URL) {
      setConnected(false);
      return;
    }
    const socket = io(REALTIME_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      identify();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('state', (s: PublicState) => {
      setState(s);
      setPlayback({ ...s.playback, updatedAt: Date.now() });
    });
    socket.on('tick', (p: PublicState['playback']) => {
      setPlayback({ ...p, updatedAt: Date.now() });
    });
    socket.on('me', (m: MeResponse) => setMe(m));

    return () => {
      socket.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (connected) identify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, connected]);

  return { socket: socketRef, connected, state, playback, setPlayback, me, identify, hasRealtime: Boolean(REALTIME_URL) };
}
