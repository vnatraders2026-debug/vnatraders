import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  actionLabel,
  onAction,
  icon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-surface border border-border rounded min-h-[180px]">
      {icon && <div className="text-text-muted mb-2">{icon}</div>}
      <p className="text-sm text-text-muted mb-4">{message}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

export const ErrorState: React.FC<{
  message?: string;
  onRetry: () => void;
}> = ({ message = 'An error occurred while loading data', onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-surface border border-danger/30 rounded min-h-[180px]">
      <p className="text-sm text-danger mb-4 font-medium">{message}</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
};
