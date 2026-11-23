import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '@/features/companies/CompanyContext';
import { useAuth } from '@/features/auth/AuthContext';
import { Building2, ChevronDown, Check, Plus, Layers, Lock } from 'lucide-react';

export const CompanySwitcher: React.FC = () => {
  const {
    companies,
    activeCompany,
    activeCompanyId,
    setActiveCompany,
    canSwitchCompany,
    isAllCompanies,
    setIsAllCompanies,
  } = useCompany();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
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

  const isAdmin = user?.role === 'admin';

  return (
    <div ref={dropdownRef} className="relative select-none">
      {/* Switcher Trigger Button */}
      <button
        type="button"
        onClick={() => {
          if (canSwitchCompany) setIsOpen((prev) => !prev);
        }}
        disabled={!canSwitchCompany}
        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-xs ${
          isOpen
            ? 'bg-accent/10 border-accent text-accent'
            : isAllCompanies
            ? 'bg-accent/15 border-accent/40 text-accent hover:bg-accent/20'
            : 'bg-background hover:bg-surface border-border text-text'
        } ${!canSwitchCompany ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
        title={
          canSwitchCompany
            ? 'Click to switch active company workspace'
            : `Assigned Company: ${activeCompany?.name || 'VNA TRADERS'}`
        }
      >
        <div className="w-5 h-5 rounded bg-accent/15 text-accent flex items-center justify-center shrink-0">
          {isAllCompanies ? <Layers size={13} /> : <Building2 size={13} />}
        </div>

        <div className="flex flex-col text-left">
          <span className="font-bold text-xs truncate max-w-[110px] sm:max-w-[170px] leading-tight">
            {isAllCompanies ? 'All Companies' : activeCompany?.name || 'VNA TRADERS'}
          </span>
          {activeCompany?.gstin && !isAllCompanies && (
            <span className="text-[9px] font-mono text-text-muted hidden sm:inline leading-none">
              GST: {activeCompany.gstin}
            </span>
          )}
        </div>

        {canSwitchCompany ? (
          <ChevronDown
            size={13}
            className={`text-text-muted transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          />
        ) : (
          <span title="Locked to assigned company">
            <Lock size={11} className="text-text-muted shrink-0" />
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && canSwitchCompany && (
        <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 bg-surface border border-border rounded-lg shadow-2xl z-50 overflow-hidden text-xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="p-2.5 bg-background border-b border-border flex items-center justify-between">
            <span className="font-bold text-[11px] uppercase tracking-wider text-text flex items-center gap-1.5">
              <Building2 size={14} className="text-accent" />
              <span>Select Active Company</span>
            </span>
            <span className="text-[10px] text-text-muted">{companies.length} Registered</span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-border/40 p-1">
            {/* Consolidated All Companies Option (For Admins) */}
            {isAdmin && (
              <div
                onClick={() => {
                  setIsAllCompanies(true);
                  setIsOpen(false);
                }}
                className={`p-2 rounded-md flex items-center justify-between cursor-pointer transition-colors ${
                  isAllCompanies ? 'bg-accent/15 text-accent font-bold' : 'hover:bg-background/80 text-text'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-accent/20 text-accent flex items-center justify-center shrink-0">
                    <Layers size={13} />
                  </div>
                  <div>
                    <div className="font-bold text-xs">All Companies (Consolidated)</div>
                    <div className="text-[10px] text-text-muted">Combined bills, orders &amp; stock overview</div>
                  </div>
                </div>
                {isAllCompanies && <Check size={14} className="text-accent shrink-0" />}
              </div>
            )}

            {/* List of Companies */}
            {companies.map((c) => {
              const isSelected = !isAllCompanies && c.id === activeCompanyId;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveCompany(c);
                    setIsOpen(false);
                  }}
                  className={`p-2 rounded-md flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-accent/10 text-accent' : 'hover:bg-background/80 text-text'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0 pr-2">
                    <div
                      className={`w-6 h-6 rounded flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected ? 'bg-accent text-white' : 'bg-surface border border-border text-text-muted'
                      }`}
                    >
                      <Building2 size={13} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-text truncate flex items-center gap-1.5">
                        <span>{c.name}</span>
                        {c.is_default && (
                          <span className="text-[9px] font-semibold px-1 rounded bg-background border border-border text-text-muted">
                            Default
                          </span>
                        )}
                      </div>
                      {c.trade_name && (
                        <div className="text-[10px] text-text-muted truncate">{c.trade_name}</div>
                      )}
                      <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-mono mt-0.5">
                        {c.gstin && <span>GSTIN: {c.gstin}</span>}
                        {c.city && <span>• {c.city}</span>}
                      </div>
                    </div>
                  </div>

                  {isSelected && <Check size={15} className="text-accent shrink-0" />}
                </div>
              );
            })}
          </div>

          {/* Footer with Manage Companies link */}
          {isAdmin && (
            <div className="p-2 bg-background border-t border-border flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Add company or change details</span>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/companies');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-accent hover:underline rounded"
              >
                <Plus size={13} />
                <span>Manage Companies</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
