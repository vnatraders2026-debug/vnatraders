import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { initLocalDatabase } from './db';
import { syncService } from './sync/syncService';

// Initialize Dexie offline database and background sync service
initLocalDatabase()
  .then(() => {
    syncService.init();
  })
  .catch((err) => {
    console.error('Database initialization note:', err);
  });

import { ErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
