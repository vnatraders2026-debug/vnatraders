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
  Printer,
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

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email address and password');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.error) {
      setErrorMessage(result.error);
    } else {
      // Activate fullscreen mode immediately on login
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (fsErr) {
        console.warn('Fullscreen entry on login bypassed:', fsErr);
      }
      navigate('/billing', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        {/* VNA Brand Logo */}
        <VnaLogo size="xl" className="mb-2" />
        <p className="text-xs text-text-muted">
          Retail Point of Sale & Billing System
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-surface border border-border rounded shadow-subtle p-6 sm:p-8 space-y-6">
          <div className="text-center pb-2 border-b border-border">
            <h2 className="text-base font-bold text-text">Terminal Login</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Enter your credentials to access the billing terminal
            </p>
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
                  placeholder="admin@vnatraders.com"
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
