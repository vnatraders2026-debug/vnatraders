import React, { createContext, useContext, useState, useEffect } from 'react';
import { Profile, UserRole } from '@/types';
import { supabase, isConfigured } from '@/lib/supabase';
import { db, initLocalDatabase } from '@/db';

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  switchDemoRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_STORAGE_KEY = 'crackers_billing_profile_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function restoreSession() {
      try {
        // 1. If online and Supabase is configured, check active Supabase auth session first
        if (isConfigured && navigator.onLine) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profile && profile.is_active) {
              const fullProfile: Profile = {
                id: profile.id,
                full_name: profile.full_name,
                role: profile.role,
                is_active: profile.is_active,
                email: session.user.email || profile.email,
              };
              setUser(fullProfile);
              localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(fullProfile));
              await db.profiles.put(fullProfile);
              return;
            } else {
              await supabase.auth.signOut();
              localStorage.removeItem(SESSION_STORAGE_KEY);
              setUser(null);
              return;
            }
          } else {
            // No active cloud session: remove any stale demo session
            const localCached = localStorage.getItem(SESSION_STORAGE_KEY);
            if (localCached) {
              try {
                const parsed = JSON.parse(localCached);
                if (parsed.id?.startsWith('00000000') || parsed.email?.includes('.local')) {
                  localStorage.removeItem(SESSION_STORAGE_KEY);
                  setUser(null);
                  return;
                }
              } catch {}
            }
            setUser(null);
            return;
          }
        }

        // 2. Offline fallback when internet is completely unavailable
        const localCached = localStorage.getItem(SESSION_STORAGE_KEY);
        if (localCached) {
          try {
            const parsed = JSON.parse(localCached);
            if (!parsed.id?.startsWith('00000000')) {
              const dexieProfile = await db.profiles.get(parsed.id);
              if (dexieProfile && dexieProfile.is_active) {
                setUser(dexieProfile);
                return;
              }
            }
          } catch {}
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
        setUser(null);
      } catch (err) {
        console.warn('Session restoration note:', err);
      } finally {
        setLoading(false);
      }
    }

    restoreSession();

    // Listen to Supabase auth changes
    if (isConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          localStorage.removeItem(SESSION_STORAGE_KEY);
        } else if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile && profile.is_active) {
            const p: Profile = {
              id: profile.id,
              full_name: profile.full_name,
              role: profile.role,
              is_active: profile.is_active,
              email: session.user.email,
            };
            setUser(p);
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(p));
            await db.profiles.put(p);
          }
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const findLocalProfile = async (emailToFind: string) => {
    let allProfiles = await db.profiles.toArray();
    if (allProfiles.length === 0) {
      await initLocalDatabase();
      allProfiles = await db.profiles.toArray();
    }
    const clean = emailToFind.trim().toLowerCase();
    return allProfiles.find(
      (p) =>
        (p.email && p.email.toLowerCase() === clean) ||
        (clean === 'admin' && p.role === 'admin') ||
        (clean === 'staff' && p.role === 'staff')
    );
  };

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    const trimmedEmail = email.trim().toLowerCase();
    const isLocalDemoAccount =
      trimmedEmail.endsWith('.local') ||
      trimmedEmail === 'admin' ||
      trimmedEmail === 'staff';

    // In offline mode, if Supabase is not configured, or if logging in with local demo credentials
    if (!isConfigured || !navigator.onLine || isLocalDemoAccount) {
      const localProfile = await findLocalProfile(trimmedEmail);
      if (localProfile) {
        if (!localProfile.is_active) {
          return { error: 'This user account is deactivated. Contact an administrator.' };
        }
        setUser(localProfile);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(localProfile));
        return {};
      }
      if (isLocalDemoAccount) {
        return {
          error:
            'Account not found. Use "admin@crackers.local" or "staff@crackers.local" (or click the quick demo buttons below).',
        };
      }
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authError || !authData.user) {
        // Fallback to local profile if matching email exists in local Dexie
        const localProfile = await findLocalProfile(trimmedEmail);
        if (localProfile && localProfile.is_active) {
          setUser(localProfile);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(localProfile));
          return {};
        }
        return { error: authError?.message || 'Invalid email or password' };
      }

      // Check profile role and active status
      const { data: profile, error: profError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profError || !profile) {
        await supabase.auth.signOut();
        return { error: 'User profile not found. Contact administrator.' };
      }

      if (!profile.is_active) {
        await supabase.auth.signOut();
        return { error: 'This account has been deactivated. Contact an administrator.' };
      }

      const activeProfile: Profile = {
        id: profile.id,
        full_name: profile.full_name,
        role: profile.role,
        is_active: profile.is_active,
        email: authData.user.email,
      };

      setUser(activeProfile);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(activeProfile));
      await db.profiles.put(activeProfile);

      return {};
    } catch (err: any) {
      return { error: err?.message || 'Login failed. Please check network connection.' };
    }
  };

  const logout = async () => {
    try {
      if (isConfigured && navigator.onLine) {
        await supabase.auth.signOut();
      }
    } finally {
      setUser(null);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  };

  const switchDemoRole = async (targetRole: UserRole) => {
    const existing = await db.profiles.where('role').equals(targetRole).first();
    if (existing) {
      setUser(existing);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(existing));
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, switchDemoRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
