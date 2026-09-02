declare namespace YT {
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface PlayerOptions {
    width?: string | number;
    height?: string | number;
    videoId?: string;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (e: { target: Player }) => void;
      onStateChange?: (e: { data: number; target: Player }) => void;
      onError?: (e: { data: number }) => void;
    };
  }

  class Player {
    constructor(el: string | HTMLElement, opts: PlayerOptions);
    loadVideoById(videoId: string): void;
    playVideo(): void;
    stopVideo(): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): number;
  }
}

interface Window {
  YT?: { Player: typeof YT.Player; PlayerState: typeof YT.PlayerState };
  onYouTubeIframeAPIReady?: () => void;
}
