import { db } from '@/db';
import { supabase, isConfigured } from '@/lib/supabase';
import { ActivityLog } from '@/types';

export interface LogActivityParams {
  userId?: string;
  userName?: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  entity: 'products' | 'bills' | 'profiles' | 'categories' | 'brands' | 'shop_settings';
  entityId: string;
  summary: string;
  oldData?: any;
  newData?: any;
}

/**
 * Persists an activity log locally in Dexie and synchronously syncs to Supabase if online
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  const now = new Date().toISOString();
  const logItem: ActivityLog = {
    id: Date.now(),
    user_id: params.userId,
    user_name: params.userName || 'Admin',
    action: params.action,
    entity: params.entity,
    entity_id: params.entityId,
    summary: params.summary,
    old_data: params.oldData ? JSON.stringify(params.oldData) : undefined,
    new_data: params.newData ? JSON.stringify(params.newData) : undefined,
    created_at: now,
  };

  // 1. Store in Dexie IndexedDB
  try {
    await db.activity_logs.add(logItem);
  } catch (err) {
    console.warn('Local activity log error:', err);
  }

  // 2. Sync to Supabase public.activity_logs if online
  if (isConfigured && navigator.onLine) {
    try {
      await supabase.from('activity_logs').insert({
        user_id: params.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.userId) ? params.userId : null,
        user_name: params.userName || 'Admin',
        action: params.action,
        entity: params.entity,
        entity_id: params.entityId,
        summary: params.summary,
        old_data: params.oldData ? (typeof params.oldData === 'string' ? JSON.parse(params.oldData) : params.oldData) : null,
        new_data: params.newData ? (typeof params.newData === 'string' ? JSON.parse(params.newData) : params.newData) : null,
        created_at: now,
      });
    } catch (remoteErr) {
      console.warn('Remote activity log sync notice:', remoteErr);
    }
  }
}
