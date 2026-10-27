import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSync } from '@/sync/useSync';
import { syncService } from '@/sync/syncService';
import { useFullscreen } from '@/lib/fullscreen';
import { useToast } from '@/components/ui/Toast';
import { PlusCircle, Menu, RefreshCw, Maximize, Minimize, DownloadCloud } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { forceAppUpdate } from '@/lib/appUpdate';

import { VnaLogo } from '@/components/VnaLogo';

interface TopBarProps {
  onToggleMobileMenu: () => void;
  title: string;
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleMobileMenu, title }) => {
  const { state, pendingCount, retrySync } = useSync();
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isBilling = location.pathname === '/billing';

  const handleCloudRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await syncService.forceFreshPullFromSupabase();
      toast(res.message, 'success');
    } catch (err: any) {
      toast(err?.message || 'Refresh failed', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

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
    <header className="h-14 border-b border-border bg-surface px-3 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Menu trigger: shown on mobile, and ALSO on desktop when in billing mode so menu stays accessible */}
        <button
          onClick={onToggleMobileMenu}
          className={`p-2 -ml-1 rounded text-text-muted hover:text-text hover:bg-background ${
            isBilling ? '' : 'lg:hidden'
          } focus:outline-none focus:ring-2 focus:ring-accent`}
          aria-label="Open menu"
          title={isBilling ? 'Open Navigation Menu' : 'Open menu'}
        >
          <Menu size={20} />
        </button>
        <div className={`${isBilling ? '' : 'lg:hidden'}`}>
          <VnaLogo size="sm" showText={false} />
        </div>
        <h1 className="text-base sm:text-lg font-bold text-text truncate max-w-[160px] sm:max-w-none">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Connection status indicator */}
        <div aria-live="polite" className="hidden xs:block">
          {getStatusBadge()}
        </div>

        {/* Cloud Refresh Button: clears local cache and pulls fresh data from Supabase (hidden in new bill entry) */}
        {!isBilling && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCloudRefresh}
            disabled={isRefreshing}
            className="min-h-[36px] py-1 text-xs text-accent border-accent/40 hover:bg-accent-light gap-1.5 font-medium"
            title="Clear local cache & pull fresh data from Supabase cloud"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span className="hidden md:inline">{isRefreshing ? 'Refreshing...' : 'Refresh Cloud'}</span>
          </Button>
        )}

        {/* Force Application Update Button */}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            toast('Updating application to latest release...', 'info');
            forceAppUpdate();
          }}
          className="min-h-[36px] py-1 text-xs border-border hover:bg-background gap-1.5 font-medium text-text-muted hover:text-text"
          title="Force update application to latest version & reload"
        >
          <DownloadCloud size={14} className="text-accent" />
          <span className="hidden md:inline">Update App</span>
        </Button>

        {/* Fullscreen Toggle Button */}
        <button
          onClick={toggleFullscreen}
          className="px-2.5 py-1.5 rounded text-text-muted hover:text-text hover:bg-background border border-border text-xs flex items-center gap-1.5 min-h-[36px] transition-colors"
          title={isFullscreen ? 'Exit Fullscreen Mode' : 'Enter Fullscreen Mode'}
        >
          {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          <span className="hidden sm:inline font-medium">{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
        </button>

        {/* Global Quick Action: New Bill (if not already on billing screen) */}
        {!isBilling && (
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
