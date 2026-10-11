import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Flame } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email and password');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.error) {
      setErrorMessage(result.error);
    } else {
      navigate('/billing', { replace: true });
    }
  };

  const handleQuickDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('demo12345');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm bg-surface border border-border rounded p-6">
        {/* App Title */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded bg-accent flex items-center justify-center text-white">
            <Flame size={18} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text leading-tight">Crackers Billing</h1>
            <p className="text-xs text-text-muted">Offline-First Retail System</p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 border border-danger rounded bg-danger-light text-danger text-xs font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@crackers.com"
            autoComplete="email"
            autoFocus
            required
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />

          <Button type="submit" variant="primary" fullWidth disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        {/* Demo Quick Fills for Instant Testing */}
        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-xs text-text-muted mb-2 font-medium">Quick Demo Accounts:</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleQuickDemo('admin@crackers.local')}
            >
              Fill Admin
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleQuickDemo('staff@crackers.local')}
            >
              Fill Staff
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
