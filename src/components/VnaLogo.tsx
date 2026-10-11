import React from 'react';

interface VnaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const VnaLogo: React.FC<VnaLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
}) => {
  const iconSizes = {
    sm: 24,
    md: 32,
    lg: 40,
    xl: 48,
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
  };

  const px = iconSizes[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* VNA Modern Geometric Cracker Burst Emblem */}
      <div
        className="shrink-0 flex items-center justify-center rounded bg-accent text-white shadow-subtle overflow-hidden"
        style={{ width: px, height: px }}
      >
        <svg
          viewBox="0 0 48 48"
          width={px}
          height={px}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Solid Flat Geometric Emblem for VNA */}
          <rect width="48" height="48" rx="6" fill="#C2410C" />
          {/* Modern stylised V monogram & spark star */}
          <path
            d="M12 14L24 36L36 14H30L24 26L18 14H12Z"
            fill="#FFFFFF"
          />
          {/* Golden/White fireworks spark accents */}
          <circle cx="24" cy="11" r="2.5" fill="#FFFFFF" />
          <path
            d="M24 16V19M21 17.5L22.5 19M27 17.5L25.5 19"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className={`font-black tracking-tight text-text ${textSizes[size]}`}>
              VNA CRACKERS
            </span>
          </div>
          <span className="text-[10px] uppercase font-semibold text-accent tracking-widest mt-0.5">
            Billing System
          </span>
        </div>
      )}
    </div>
  );
};
