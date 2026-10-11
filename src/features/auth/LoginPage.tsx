import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Button } from '@/components/ui/Button';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Zap,
  WifiOff,
  Printer,
  ArrowRight,
  UserCheck,
} from 'lucide-react';

import { VnaLogo } from '@/components/VnaLogo';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLoginSubmit = async (e?: React.FormEvent, directEmail?: string, directPassword?: string) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    const targetEmail = directEmail || email;
    const targetPassword = directPassword || password;

    if (!targetEmail.trim() || !targetPassword) {
      setErrorMessage('Please enter email and password');
      return;
    }

    setLoading(true);
    const result = await login(targetEmail, targetPassword);
    setLoading(false);

    if (result.error) {
      setErrorMessage(result.error);
    } else {
      navigate('/billing', { replace: true });
    }
  };

  const handleQuickRoleSelect = (roleEmail: string) => {
    setEmail(roleEmail);
    setPassword('demo12345');
    handleLoginSubmit(undefined, roleEmail, 'demo12345');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        {/* VNA Brand Logo */}
        <VnaLogo size="xl" className="mb-2" />
        <p className="text-xs text-text-muted">
          Offline-First Retail Point of Sale & Inventory
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <div className="bg-surface border border-border rounded shadow-subtle p-6 sm:p-8 space-y-6">
          {/* Quick Account Switcher Header */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Fast Offline Access
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-success-light text-success">
                <WifiOff size={10} />
                <span>IndexedDB Ready</span>
              </span>
            </div>

            {/* Quick Login Role Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('admin@crackers.local')}
                className="group relative flex flex-col p-3 rounded border border-border bg-background text-left transition-colors hover:border-accent hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xs font-bold text-text group-hover:text-accent">
                    Admin Manager
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-accent text-white">
                    ADMIN
                  </span>
                </div>
                <p className="text-[11px] text-text-muted leading-tight">
                  Full access, analytics, targets, reports & logs
                </p>
                <div className="mt-2.5 flex items-center text-[11px] font-semibold text-accent gap-1">
                  <span>Enter as Admin</span>
                  <ArrowRight size={12} />
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickRoleSelect('staff@crackers.local')}
                className="group relative flex flex-col p-3 rounded border border-border bg-background text-left transition-colors hover:border-accent hover:bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-xs font-bold text-text group-hover:text-accent">
                    Cashier Staff
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-surface border border-border text-text">
                    STAFF
                  </span>
                </div>
                <p className="text-[11px] text-text-muted leading-tight">
                  Fast sub-10ms billing, stock catalogue & receipts
                </p>
                <div className="mt-2.5 flex items-center text-[11px] font-semibold text-accent gap-1">
                  <span>Enter as Cashier</span>
                  <ArrowRight size={12} />
                </div>
              </button>
            </div>
          </div>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-border" />
            <span className="flex-shrink mx-3 text-xs text-text-muted font-medium uppercase">
              Or Sign In With Email
            </span>
            <div className="flex-grow border-t border-border" />
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 border border-danger rounded bg-danger-light text-danger text-xs font-medium flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Standard Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@crackers.local"
                  autoComplete="email"
                  required
                  className="w-full pl-9 pr-3 min-h-[44px] text-base sm:text-sm bg-surface text-text border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-text mb-1">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-9 pr-10 min-h-[44px] text-base sm:text-sm bg-surface text-text border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-colors font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={loading}
              className="mt-2"
            >
              <UserCheck size={16} />
              <span>{loading ? 'Authenticating...' : 'Sign In to Terminal'}</span>
            </Button>
          </form>

          {/* Retail System Highlights */}
          <div className="pt-4 border-t border-border grid grid-cols-3 gap-2 text-center text-[10px] text-text-muted">
            <div className="flex flex-col items-center gap-1">
              <Zap size={14} className="text-accent" />
              <span>Sub-10ms Search</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Printer size={14} className="text-text" />
              <span>80mm Thermal POS</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <ShieldCheck size={14} className="text-success" />
              <span>10m Edit Window</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
