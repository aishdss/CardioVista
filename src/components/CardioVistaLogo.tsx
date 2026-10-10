/**
 * CardioVista Logo Component
 * Renders the anatomical etched burgundy heart emblem with modern typographic wordmark
 * exactly matching the CardioVista brand identity.
 */

import React, { useState } from 'react';
import { Heart } from 'lucide-react';

interface CardioVistaLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

export const CardioVistaLogo: React.FC<CardioVistaLogoProps> = ({
  size = 'md',
  showWordmark = true,
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const dimensionClasses = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-14 h-14',
  }[size];

  const textSizeClasses = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  }[size];

  return (
    <div className={`flex items-center gap-2.5 shrink-0 ${className}`}>
      {/* Anatomical Heart Emblem Frame */}
      <div
        className={`relative ${dimensionClasses} rounded-lg overflow-hidden border border-[#5e142c] shadow-md shadow-rose-950/80 bg-[#1f0714] flex items-center justify-center shrink-0 ring-1 ring-rose-500/20`}
      >
        {!imgFailed ? (
          <img
            src="/cardiovista-logo.jpg"
            alt="CardioVista Anatomical Logo"
            className="w-full h-full object-cover object-center hover:scale-105 transition-transform duration-300"
            onError={() => setImgFailed(true)}
            loading="eager"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-[#881337] to-[#e11d48] flex items-center justify-center">
            <Heart className="w-4 h-4 text-white fill-white" />
          </div>
        )}
      </div>

      {/* Branded Wordmark */}
      {showWordmark && (
        <span
          className={`${textSizeClasses} font-extrabold tracking-[0.16em] uppercase text-white hover:text-rose-200 transition-colors font-sans select-none whitespace-nowrap`}
        >
          CardioVista
        </span>
      )}
    </div>
  );
};
