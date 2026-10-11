import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { TopBar } from './TopBar';
import { Sidebar } from './Sidebar';
import { BottomTabs } from './BottomTabs';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const AppShell: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // PWA update hook
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error: any) {
      console.warn('SW registration error:', error);
    },
  });

  const getPageTitle = (pathname: string): string => {
    if (pathname.startsWith('/dashboard')) return 'Dashboard';
    if (pathname.startsWith('/billing')) return 'New Bill';
    if (pathname.startsWith('/bills')) return 'Bills';
    if (pathname.startsWith('/products')) return 'Products';
    if (pathname.startsWith('/reports')) return 'Reports';
    if (pathname.startsWith('/users')) return 'Users';
    if (pathname.startsWith('/logs')) return 'Activity Logs';
    if (pathname.startsWith('/settings')) return 'Settings';
    return 'Crackers Billing';
  };

  return (
    <div className="min-h-screen bg-background text-text flex">
      {/* Sidebar navigation */}
      <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 sm:pb-0">
        {/* PWA Update Banner */}
        {needRefresh && (
          <div className="bg-accent text-white px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-medium sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <RefreshCw size={16} />
              <span>An application update is available.</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="bg-white text-accent hover:bg-white/90 min-h-[32px] py-1 text-xs"
                onClick={() => updateServiceWorker(true)}
              >
                Update
              </Button>
              <button
                onClick={() => setNeedRefresh(false)}
                className="text-white hover:text-white/80 text-xs px-2 py-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <TopBar
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          title={getPageTitle(location.pathname)}
        />

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomTabs />
    </div>
  );
};
