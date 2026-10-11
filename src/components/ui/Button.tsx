import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabledReason?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabledReason,
  className = '',
  disabled,
  title,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors select-none rounded focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 min-h-[44px]';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  const variantClasses = {
    primary:
      'bg-accent text-white hover:bg-accent-hover active:bg-accent-hover disabled:bg-accent/40 disabled:cursor-not-allowed',
    secondary:
      'bg-surface text-text border border-border hover:bg-background active:bg-background/80 disabled:bg-background disabled:text-text-muted/60 disabled:border-border/60 disabled:cursor-not-allowed',
    danger:
      'bg-danger text-white hover:bg-danger/90 active:bg-danger/90 disabled:bg-danger/40 disabled:cursor-not-allowed',
    ghost:
      'bg-transparent text-text hover:bg-background active:bg-background/80 disabled:text-text-muted/50 disabled:cursor-not-allowed',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      disabled={disabled}
      title={disabled ? (disabledReason || title) : title}
      {...props}
    >
      {children}
    </button>
  );
};
