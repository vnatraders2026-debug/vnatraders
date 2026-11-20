import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '@/features/company/CompanyContext';
import { Building2, ChevronDown, Check, Plus, Settings } from 'lucide-react';

export const CompanySwitcher: React.FC<{ className?: string; compact?: boolean }> = ({
  className = '',
  compact = false,
}) => {
  const { companies, activeCompany, setActiveCompanyId } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close when clicked outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (!activeCompany && companies.length === 0) {
    return null;
  }

  const handleSelect = (id: string) => {
    setActiveCompanyId(id);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className={`relative select-none ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-all focus:outline-none focus:ring-1 focus:ring-accent ${
          isOpen
            ? 'bg-accent/10 border-accent text-accent'
            : 'bg-surface border-border text-text hover:bg-background hover:border-text-muted/60'
        }`}
        title={`Operating Company: ${activeCompany?.name || 'VNA TRADERS'}`}
      >
        <Building2 size={14} className="text-accent shrink-0" />
        <span className={`truncate ${compact ? 'hidden md:inline-block max-w-[120px]' : 'max-w-[120px] sm:max-w-[160px] md:max-w-[200px]'}`}>
          {activeCompany?.name || 'VNA TRADERS'}
        </span>
        {activeCompany?.code && (
          <span className="hidden sm:inline-block text-[10px] font-mono px-1 py-0.2 rounded bg-background border border-border text-text-muted">
            {activeCompany.code}
          </span>
        )}
        <ChevronDown
          size={13}
          className={`text-text-muted transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-72 sm:w-80 bg-surface border border-border rounded-lg shadow-xl z-50 overflow-hidden text-xs divide-y divide-border/50 animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="p-2.5 bg-background flex items-center justify-between">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <Building2 size={13} className="text-accent" />
              <span>Select Operating Company</span>
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-surface border border-border text-text-muted">
              {companies.length} {companies.length === 1 ? 'Firm' : 'Firms'}
            </span>
          </div>

          {/* Companies List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-border/30">
            {companies.map((comp) => {
              const isActive = comp.id === activeCompany?.id;
              return (
                <div
                  key={comp.id}
                  onClick={() => handleSelect(comp.id)}
                  className={`p-2.5 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                    isActive ? 'bg-accent/10' : 'hover:bg-background/80'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold truncate ${isActive ? 'text-accent' : 'text-text'}`}>
                        {comp.name}
                      </span>
                      {comp.code && (
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-surface border border-border text-text-muted">
                          [{comp.code}]
                        </span>
                      )}
                      {comp.is_default && (
                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-warning/15 text-warning border border-warning/30">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted truncate mt-0.5 font-mono">
                      GSTIN: {comp.gstin || 'N/A'} • {comp.city || 'Hosur'}
                    </div>
                  </div>

                  {isActive && (
                    <div className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-accent">
                      <Check size={14} />
                      <span className="hidden sm:inline text-[10px]">Active</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Links */}
          <div className="p-2 bg-background flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/companies');
              }}
              className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1 py-1 px-2 rounded hover:bg-surface transition-colors"
            >
              <Settings size={12} />
              <span>Manage Companies</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/companies?action=new');
              }}
              className="text-[11px] font-bold text-text hover:text-accent flex items-center gap-1 py-1 px-2 rounded hover:bg-surface transition-colors"
            >
              <Plus size={12} />
              <span>+ Add Company</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
