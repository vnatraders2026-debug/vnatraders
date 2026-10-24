import React, { useState } from 'react';
import { VNA_LOGO_DATA_URI, VNA_LOGO_SRC } from '@/assets/vnaLogoDataUri';

interface VnaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  imageClassName?: string;
}

export const VnaLogo: React.FC<VnaLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
  imageClassName = '',
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(VNA_LOGO_DATA_URI);

  const iconSizes = {
    sm: 28,
    md: 36,
    lg: 44,
    xl: 60,
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
      {/* Official VNA Shield Emblem Logo */}
      <div
        className="shrink-0 flex items-center justify-center rounded-lg bg-white overflow-hidden shadow-subtle border border-slate-200/80"
        style={{ width: px, height: px }}
      >
        <img
          src={currentSrc}
          alt="VNA Traders Logo"
          className={`w-full h-full object-contain p-0.5 ${imageClassName}`}
          onError={() => {
            if (currentSrc !== VNA_LOGO_SRC) {
              setCurrentSrc(VNA_LOGO_SRC);
            }
          }}
        />
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className={`font-black tracking-tight text-text ${textSizes[size]}`}>
              VNA TRADERS
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
