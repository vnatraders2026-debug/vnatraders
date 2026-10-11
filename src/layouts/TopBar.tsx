import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSync } from '@/sync/useSync';
import { PlusCircle, Menu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface TopBarProps {
  onToggleMobileMenu: () => void;
  title: string;
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleMobileMenu, title }) => {
  const { state, pendingCount, retrySync } = useSync();
  const navigate = useNavigate();
  const location = useLocation();

  const getStatusBadge = () => {
    switch (state) {
      case 'online':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border rounded text-xs text-text font-medium">
            <span className="w-2 h-2 rounded-full bg-success inline-block" />
            <span>Online</span>
          </div>
        );
      case 'syncing':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-accent/40 rounded text-xs text-accent font-medium">
            <span className="w-2 h-2 rounded-full bg-accent inline-block animate-pulse" />
            <span>Syncing ({pendingCount} pending)</span>
          </div>
        );
      case 'error':
        return (
          <button
            onClick={retrySync}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-danger/40 rounded text-xs text-danger font-medium hover:bg-danger-light focus:outline-none focus:ring-2 focus:ring-danger"
            title="Tap to retry sync"
          >
            <span className="w-2 h-2 rounded-full bg-danger inline-block" />
            <span>Sync error (tap to retry)</span>
            <RefreshCw size={12} className="ml-1" />
          </button>
        );
      case 'offline':
      default:
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border rounded text-xs text-text-muted font-medium">
            <span className="w-2 h-2 rounded-full bg-text-muted inline-block" />
            <span>Offline</span>
            {pendingCount > 0 && <span className="text-xs">({pendingCount} pending)</span>}
          </div>
        );
    }
  };

  return (
    <header className="h-14 border-b border-border bg-surface px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <button
          onClick={onToggleMobileMenu}
          className="p-2 -ml-2 rounded text-text-muted hover:text-text hover:bg-background lg:hidden focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-base sm:text-lg font-semibold text-text">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Connection status indicator */}
        <div aria-live="polite">{getStatusBadge()}</div>

        {/* Global Quick Action: New Bill (if not already on billing screen) */}
        {location.pathname !== '/billing' && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => navigate('/billing')}
            className="hidden sm:inline-flex"
          >
            <PlusCircle size={16} />
            <span>New Bill</span>
          </Button>
        )}
      </div>
    </header>
  );
};
