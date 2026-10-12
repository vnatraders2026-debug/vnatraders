import { useState, useEffect } from 'react';

/**
 * Checks if the browser is currently in fullscreen mode
 */
export function isFullscreenActive(): boolean {
  return typeof document !== 'undefined' && Boolean(document.fullscreenElement);
}

/**
 * Requests browser fullscreen mode on documentElement
 */
export async function enterFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
      return true;
    } catch (err) {
      console.warn('Fullscreen request bypassed:', err);
      return false;
    }
  }
  return true;
}

/**
 * Exits browser fullscreen mode
 */
export async function exitFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (document.fullscreenElement && document.exitFullscreen) {
    try {
      await document.exitFullscreen();
      return true;
    } catch (err) {
      console.warn('Exit fullscreen bypassed:', err);
      return false;
    }
  }
  return true;
}

/**
 * Toggles browser fullscreen mode
 */
export async function toggleFullscreen(): Promise<boolean> {
  if (isFullscreenActive()) {
    return await exitFullscreen();
  } else {
    return await enterFullscreen();
  }
}

/**
 * React hook to observe and control fullscreen state
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(isFullscreenActive());

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(isFullscreenActive());
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  return {
    isFullscreen,
    toggleFullscreen,
    enterFullscreen,
    exitFullscreen,
  };
}
