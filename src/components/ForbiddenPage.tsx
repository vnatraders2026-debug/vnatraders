import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from './ui/Button';

export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-surface border border-border rounded min-h-[360px] max-w-lg mx-auto mt-12">
      <div className="w-12 h-12 rounded bg-danger-light text-danger flex items-center justify-center mb-4">
        <ShieldAlert size={28} />
      </div>
      <h1 className="text-lg font-bold text-text mb-2">403 Access Denied</h1>
      <p className="text-sm text-text-muted mb-6">
        You do not have permission to access this screen. This feature is restricted to administrator accounts.
      </p>
      <div className="flex gap-3">
        <Button variant="primary" size="sm" onClick={() => navigate('/billing')}>
          Go to New Bill
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    </div>
  );
};
