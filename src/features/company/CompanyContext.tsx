import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Company } from '@/types';
import { db, DEFAULT_COMPANIES } from '@/db';
import { generateUUID } from '@/lib/uuid';
import { syncService } from '@/sync/syncService';

interface CompanyContextType {
  companies: Company[];
  activeCompany: Company | null;
  loading: boolean;
  setActiveCompanyId: (id: string) => void;
  addCompany: (comp: Omit<Company, 'id' | 'created_at'>) => Promise<Company>;
  updateCompany: (id: string, comp: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
  setDefaultCompany: (id: string) => Promise<void>;
  refreshCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export const ACTIVE_COMPANY_STORAGE_KEY = 'vna_active_company_id';

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadCompanies = useCallback(async () => {
    try {
      let list = await db.companies.toArray();
      if (list.length === 0) {
        await db.companies.bulkPut(DEFAULT_COMPANIES);
        list = [...DEFAULT_COMPANIES];
      }

      setCompanies(list);

      // Determine active company
      const savedActiveId = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
      let selected: Company | undefined;

      if (savedActiveId) {
        selected = list.find((c) => c.id === savedActiveId && c.is_active);
      }

      if (!selected) {
        // Fallback to default company or first active company
        selected = list.find((c) => c.is_default && c.is_active) || list.find((c) => c.is_active) || list[0];
      }

      if (selected) {
        setActiveCompany(selected);
        localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, selected.id);
      }
    } catch (err) {
      console.warn('Failed to load companies:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const setActiveCompanyId = useCallback((id: string) => {
    const target = companies.find((c) => c.id === id);
    if (target) {
      setActiveCompany(target);
      localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, target.id);
      // Dispatch global event so components that listen can re-render or re-filter
      window.dispatchEvent(new CustomEvent('active-company-changed', { detail: target }));
    }
  }, [companies]);

  const addCompany = async (compData: Omit<Company, 'id' | 'created_at'>): Promise<Company> => {
    const now = new Date().toISOString();
    const newComp: Company = {
      ...compData,
      id: generateUUID(),
      created_at: now,
      updated_at: now,
    };

    // If this is marked as default, unset other defaults
    if (newComp.is_default) {
      const all = await db.companies.toArray();
      for (const c of all) {
        if (c.is_default) {
          await db.companies.update(c.id, { is_default: false });
        }
      }
    }

    await db.companies.put(newComp);

    // Outbox queue for sync
    await db.outbox.add({
      id: generateUUID(),
      entity: 'companies',
      op: 'upsert',
      payload: newComp,
      status: 'pending',
      attempts: 0,
      created_at: now,
    });
    syncService.triggerSync();

    await loadCompanies();
    return newComp;
  };

  const updateCompany = async (id: string, compData: Partial<Company>): Promise<void> => {
    const now = new Date().toISOString();
    const existing = await db.companies.get(id);
    if (!existing) throw new Error('Company not found');

    if (compData.is_default) {
      const all = await db.companies.toArray();
      for (const c of all) {
        if (c.id !== id && c.is_default) {
          await db.companies.update(c.id, { is_default: false });
        }
      }
    }

    const updated: Company = {
      ...existing,
      ...compData,
      updated_at: now,
    };

    await db.companies.put(updated);

    await db.outbox.add({
      id: generateUUID(),
      entity: 'companies',
      op: 'upsert',
      payload: updated,
      status: 'pending',
      attempts: 0,
      created_at: now,
    });
    syncService.triggerSync();

    await loadCompanies();
  };

  const deleteCompany = async (id: string): Promise<void> => {
    const all = await db.companies.toArray();
    if (all.length <= 1) {
      throw new Error('Cannot delete the only remaining company in the system');
    }

    await db.companies.delete(id);

    await db.outbox.add({
      id: generateUUID(),
      entity: 'companies',
      op: 'delete',
      payload: { id },
      status: 'pending',
      attempts: 0,
      created_at: new Date().toISOString(),
    });
    syncService.triggerSync();

    // If active company was deleted, switch to another
    if (activeCompany?.id === id) {
      const remaining = all.filter((c) => c.id !== id);
      if (remaining.length > 0) {
        setActiveCompanyId(remaining[0].id);
      }
    }

    await loadCompanies();
  };

  const setDefaultCompany = async (id: string): Promise<void> => {
    const all = await db.companies.toArray();
    for (const c of all) {
      await db.companies.update(c.id, { is_default: c.id === id });
    }
    await loadCompanies();
  };

  const refreshCompanies = async (): Promise<void> => {
    await loadCompanies();
  };

  return (
    <CompanyContext.Provider
      value={{
        companies,
        activeCompany,
        loading,
        setActiveCompanyId,
        addCompany,
        updateCompany,
        deleteCompany,
        setDefaultCompany,
        refreshCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = (): CompanyContextType => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};
