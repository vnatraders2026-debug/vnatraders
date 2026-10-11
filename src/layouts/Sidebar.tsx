import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import {
  LayoutDashboard,
  FilePlus2,
  Receipt,
  Boxes,
  BarChart3,
  Users2,
  ScrollText,
  Settings,
  LogOut,
  Flame,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const role = user?.role || 'staff';

  const staffNavItems = [
    { to: '/billing', label: 'New Bill', icon: FilePlus2 },
    { to: '/bills', label: 'Bills', icon: Receipt },
    { to: '/products', label: 'Products', icon: Boxes },
  ];

  const adminNavItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/billing', label: 'New Bill', icon: FilePlus2 },
    { to: '/bills', label: 'Bills', icon: Receipt },
    { to: '/products', label: 'Products', icon: Boxes },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/users', label: 'Users', icon: Users2 },
    { to: '/logs', label: 'Activity Logs', icon: ScrollText },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  const navItems = role === 'admin' ? adminNavItems : staffNavItems;

  const content = (
    <div className="flex flex-col h-full bg-surface border-r border-border select-none">
      {/* Brand header */}
      <div className="h-14 border-b border-border px-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-accent flex items-center justify-center text-white shrink-0">
          <Flame size={18} />
        </div>
        <div className="overflow-hidden">
          <h2 className="text-sm font-semibold text-text truncate">Crackers Billing</h2>
          <span className="text-[10px] uppercase font-bold text-accent tracking-wider">
            {role}
          </span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors min-h-[44px] ${
                  isActive
                    ? 'bg-accent-light text-accent border-l-[3px] border-accent font-semibold'
                    : 'text-text hover:bg-background border-l-[3px] border-transparent'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User profile & logout footer */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-text truncate">{user?.full_name}</p>
            <p className="text-[11px] text-text-muted truncate capitalize">{user?.role} account</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-muted hover:text-danger hover:bg-danger-light rounded transition-colors min-h-[44px] focus:outline-none focus:ring-2 focus:ring-danger"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop fixed sidebar (240px) */}
      <aside className="hidden lg:block w-60 shrink-0 h-screen sticky top-0 z-30">
        {content}
      </aside>

      {/* Tablet icon rail (72px) */}
      <aside className="hidden sm:block lg:hidden w-16 shrink-0 h-screen sticky top-0 z-30 bg-surface border-r border-border">
        <div className="flex flex-col h-full items-center py-3">
          <div className="w-8 h-8 rounded bg-accent flex items-center justify-center text-white mb-6">
            <Flame size={18} />
          </div>
          <div className="flex-1 space-y-2 w-full px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  className={({ isActive }) =>
                    `flex items-center justify-center w-full h-11 rounded transition-colors ${
                      isActive
                        ? 'bg-accent-light text-accent border-l-[3px] border-accent'
                        : 'text-text-muted hover:text-text hover:bg-background border-l-[3px] border-transparent'
                    }`
                  }
                >
                  <Icon size={20} />
                </NavLink>
              );
            })}
          </div>
          <button
            onClick={logout}
            title="Sign Out"
            className="w-11 h-11 flex items-center justify-center rounded text-text-muted hover:text-danger hover:bg-danger-light"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Mobile drawer overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-64 max-w-[80vw] z-50">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
