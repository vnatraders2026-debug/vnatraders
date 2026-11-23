import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Company } from '@/types';
import { db, DEFAULT_COMPANY, DEFAULT_COMPANY_ID, initLocalDatabase } from '@/db';
import { useAuth } from '@/features/auth/AuthContext';
import { generateUUID } from '@/lib/uuid';
import { syncService } from '@/sync/syncService';

interface CompanyContextType {
  companies: Company[];
  allCompanies: Company[];
  activeCompany: Company;
  activeCompanyId: string;
  setActiveCompany: (company: Company) => void;
  selectCompanyById: (id: string) => void;
  isLoading: boolean;
  canSwitchCompany: boolean;
  isAllCompanies: boolean;
  setIsAllCompanies: (val: boolean) => void;
  refreshCompanies: () => Promise<void>;
  createCompany: (data: Omit<Company, 'id' | 'created_at' | 'updated_at'>) => Promise<Company>;
  updateCompany: (id: string, updates: Partial<Company>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

const ACTIVE_COMPANY_STORAGE_KEY = 'vna_active_company_id';

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company>(DEFAULT_COMPANY);
  const [isAllCompanies, setIsAllCompanies] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load all companies from local Dexie database
  const loadCompanies = useCallback(async () => {
    try {
      let comps = await db.companies.toArray();
      if (comps.length === 0) {
        await initLocalDatabase();
        comps = await db.companies.toArray();
      }
      setAllCompanies(comps);
      return comps;
    } catch (err) {
      console.warn('Error loading companies:', err);
      return [DEFAULT_COMPANY];
    }
  }, []);

  // Filter only active companies for day-to-day operations
  const companies = useMemo(
    () => allCompanies.filter((c) => c.is_active !== false),
    [allCompanies]
  );

  // Determine whether current user is allowed to switch companies
  // Non-admin users who are assigned to a specific company are locked to it
  const canSwitchCompany = useMemo(() => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    // If not admin, they can only switch if they were not assigned to a specific company
    return !user.company_id;
  }, [user]);

  // Set active company and persist to localStorage
  const setActiveCompany = useCallback((company: Company) => {
    setActiveCompanyState(company);
    setIsAllCompanies(false);
    try {
      localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, company.id);
    } catch {}
  }, []);

  const selectCompanyById = useCallback(
    (id: string) => {
      if (id === '__all__') {
        if (canSwitchCompany) {
          setIsAllCompanies(true);
        }
        return;
      }
      const found = allCompanies.find((c) => c.id === id);
      if (found) {
        setActiveCompany(found);
      }
    },
    [allCompanies, canSwitchCompany, setActiveCompany]
  );

  // Sync active company with logged-in user profile & stored preferences
  useEffect(() => {
    async function syncActiveCompanyWithUser() {
      setIsLoading(true);
      const comps = await loadCompanies();
      const activeComps = comps.filter((c) => c.is_active !== false);

      // 1. If non-admin user has a company_id assigned, strictly lock to that company
      if (user && user.role !== 'admin' && user.company_id) {
        const assigned = comps.find((c) => c.id === user.company_id);
        if (assigned) {
          setActiveCompanyState(assigned);
          setIsAllCompanies(false);
          setIsLoading(false);
          return;
        }
      }

      // 2. If user is admin and has an assigned preference or cached preference
      const savedId = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
      if (savedId && savedId !== '__all__') {
        const matched = activeComps.find((c) => c.id === savedId);
        if (matched) {
          setActiveCompanyState(matched);
          setIsLoading(false);
          return;
        }
      }

      // 3. Fallback to default company or first active company
      const defaultComp = activeComps.find((c) => c.is_default) || activeComps[0] || DEFAULT_COMPANY;
      setActiveCompanyState(defaultComp);
      setIsLoading(false);
    }

    syncActiveCompanyWithUser();
  }, [user, loadCompanies]);

  // Create new company
  const createCompany = async (
    data: Omit<Company, 'id' | 'created_at' | 'updated_at'>
  ): Promise<Company> => {
    const now = new Date().toISOString();
    const newComp: Company = {
      ...data,
      id: generateUUID(),
      created_at: now,
      updated_at: now,
    };

    // If marked as default, unset other defaults
    if (newComp.is_default) {
      await db.companies.toCollection().modify({ is_default: false });
    }

    await db.companies.put(newComp);

    // Record in outbox for background sync
    await db.outbox.add({
      id: generateUUID(),
      entity: 'companies',
      op: 'insert',
      payload: newComp,
      status: 'pending',
      attempts: 0,
      created_at: now,
    });
    syncService.triggerSync();

    await loadCompanies();
    return newComp;
  };

  // Update existing company
  const updateCompany = async (id: string, updates: Partial<Company>): Promise<void> => {
    const now = new Date().toISOString();
    const existing = await db.companies.get(id);
    if (!existing) return;

    if (updates.is_default) {
      await db.companies.toCollection().modify({ is_default: false });
    }

    const updated: Company = {
      ...existing,
      ...updates,
      updated_at: now,
    };

    await db.companies.put(updated);

    if (activeCompany.id === id) {
      setActiveCompanyState(updated);
    }

    await db.outbox.add({
      id: generateUUID(),
      entity: 'companies',
      op: 'update',
      payload: updated,
      status: 'pending',
      attempts: 0,
      created_at: now,
    });
    syncService.triggerSync();

    await loadCompanies();
  };

  // Delete / deactivate company
  const deleteCompany = async (id: string): Promise<void> => {
    // If it's the default company, don't delete
    if (id === DEFAULT_COMPANY_ID) {
      throw new Error('Default company "VNA TRADERS" cannot be deleted.');
    }

    // Soft deactivate
    await updateCompany(id, { is_active: false });

    // If currently active, switch back to default
    if (activeCompany.id === id) {
      const defaultComp = (await db.companies.get(DEFAULT_COMPANY_ID)) || DEFAULT_COMPANY;
      setActiveCompany(defaultComp);
    }
  };

  return (
    <CompanyContext.Provider
      value={{
        companies,
        allCompanies,
        activeCompany,
        activeCompanyId: activeCompany?.id || DEFAULT_COMPANY_ID,
        setActiveCompany,
        selectCompanyById,
        isLoading,
        canSwitchCompany,
        isAllCompanies,
        setIsAllCompanies,
        refreshCompanies: async () => {
          await loadCompanies();
        },
        createCompany,
        updateCompany,
        deleteCompany,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
