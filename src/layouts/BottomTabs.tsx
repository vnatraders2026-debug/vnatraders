import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import {
  FilePlus2,
  Receipt,
  Boxes,
  LayoutDashboard,
  MoreHorizontal,
  BarChart3,
  Users2,
  ScrollText,
  Settings,
  LogOut,
  X,
} from 'lucide-react';

export const BottomTabs: React.FC = () => {
  const { user, logout } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const role = user?.role || 'staff';

  const staffTabs = [
    { to: '/billing', label: 'New Bill', icon: FilePlus2 },
    { to: '/bills', label: 'Bills', icon: Receipt },
    { to: '/products', label: 'Products', icon: Boxes },
  ];

  const adminTabs = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/billing', label: 'New Bill', icon: FilePlus2 },
    { to: '/bills', label: 'Bills', icon: Receipt },
  ];

  const baseTabs = role === 'admin' ? adminTabs : staffTabs;

  const adminMoreItems = [
    { to: '/products', label: 'Products', icon: Boxes },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/users', label: 'Users', icon: Users2 },
    { to: '/logs', label: 'Activity Logs', icon: ScrollText },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  const staffMoreItems = [
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  const moreItems = role === 'admin' ? adminMoreItems : staffMoreItems;

  return (
    <>
      {/* Fixed bottom navigation bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 h-16 bg-surface border-t border-border flex items-center justify-around z-30 px-2 pb-[env(safe-area-inset-bottom)]">
        {baseTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-xs font-medium transition-colors ${
                  isActive ? 'text-accent font-semibold' : 'text-text-muted hover:text-text'
                }`
              }
            >
              <Icon size={20} className="mb-0.5" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}

        {/* More Tab */}
        <button
          onClick={() => setIsMoreOpen(true)}
          className="flex flex-col items-center justify-center flex-1 h-full min-h-[44px] text-xs font-medium text-text-muted hover:text-text"
        >
          <MoreHorizontal size={20} className="mb-0.5" />
          <span>More</span>
        </button>
      </nav>

      {/* More Sheet */}
      {isMoreOpen && (
        <div className="sm:hidden fixed inset-0 z-50">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setIsMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed bottom-0 inset-x-0 bg-surface border-t border-border rounded-t-lg p-4 z-10 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-border">
              <span className="text-sm font-semibold text-text">More Options</span>
              <button
                onClick={() => setIsMoreOpen(false)}
                className="p-1.5 text-text-muted hover:text-text"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setIsMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 p-3 rounded border text-xs font-medium min-h-[44px] ${
                        isActive
                          ? 'border-accent bg-accent-light text-accent'
                          : 'border-border text-text hover:bg-background'
                      }`
                    }
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>

            <button
              onClick={() => {
                setIsMoreOpen(false);
                logout();
              }}
              className="w-full flex items-center justify-center gap-2 p-3 text-xs font-medium text-danger bg-danger-light border border-danger/30 rounded min-h-[44px]"
            >
              <LogOut size={16} />
              <span>Sign Out ({user?.full_name})</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
