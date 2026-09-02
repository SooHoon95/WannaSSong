'use client';

import { useEffect } from 'react';

export function YouTubeScript() {
  useEffect(() => {
    if (window.YT?.Player) return;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      window.dispatchEvent(new Event('yt-api-ready'));
    };
    if (document.getElementById('yt-iframe-api')) return;
    const s = document.createElement('script');
    s.id = 'yt-iframe-api';
    s.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(s);
  }, []);
  return null;
}
