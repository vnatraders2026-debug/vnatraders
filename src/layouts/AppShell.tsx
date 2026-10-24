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
    needRefresh: [needRefresh],
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
    return 'VNA Traders';
  };

  const isBilling = location.pathname === '/billing';

  return (
    <div className="min-h-screen bg-background text-text flex">
      {/* Sidebar navigation: permanent bar hidden on /billing so New Bill gets 100% full screen width */}
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        hidePermanent={isBilling}
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col min-w-0 ${isBilling ? 'pb-0' : 'pb-16 sm:pb-0'}`}>
        {/* Mandatory PWA Update Modal: Blocks stale cached app execution */}
        {needRefresh && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
            <div className="bg-surface border-2 border-accent rounded-lg shadow-2xl p-6 max-w-md w-full text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="w-14 h-14 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto">
                <RefreshCw size={28} className="animate-spin" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-text">
                  Mandatory Update Required
                </h2>
                <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
                  A critical system update is ready with the latest bill formatting, Scan &amp; Pay QR code, and printing fixes. Please update now to continue.
                </p>
              </div>
              <Button
                variant="primary"
                fullWidth
                size="md"
                onClick={() => updateServiceWorker(true)}
                className="py-3 text-sm font-bold bg-accent hover:bg-accent/90 text-white shadow-md gap-2"
              >
                <RefreshCw size={16} />
                <span>Update &amp; Reload Application</span>
              </Button>
            </div>
          </div>
        )}

        <TopBar
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
          title={getPageTitle(location.pathname)}
        />

        <main className={`flex-1 ${isBilling ? 'p-1 sm:p-3' : 'p-4 sm:p-6'} overflow-y-auto`}>
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (hidden in POS billing mode) */}
      {!isBilling && <BottomTabs />}
    </div>
  );
};
