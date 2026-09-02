'use client';

import { useCallback, useState } from 'react';

export function useToast() {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState(false);
  const [visible, setVisible] = useState(false);

  const toast = useCallback((text: string, isErr = false) => {
    setMsg(text);
    setErr(isErr);
    setVisible(true);
    window.clearTimeout((window as unknown as { _toast?: number })._toast);
    (window as unknown as { _toast?: number })._toast = window.setTimeout(() => setVisible(false), 2600);
  }, []);

  return { msg, err, visible, toast };
}
