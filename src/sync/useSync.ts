import { useState, useEffect } from 'react';
import { syncService, SyncStatusState } from './syncService';

export function useSync() {
  const [status, setStatus] = useState<{
    state: SyncStatusState;
    pendingCount: number;
    lastError?: string;
  }>({
    state: navigator.onLine ? 'online' : 'offline',
    pendingCount: 0,
  });

  useEffect(() => {
    const unsubscribe = syncService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  return {
    ...status,
    retrySync: () => syncService.triggerSync(),
  };
}
