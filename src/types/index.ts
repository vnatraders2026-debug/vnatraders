export type UserRole = 'admin' | 'staff';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
  email?: string;
}

export interface Brand {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Category {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  brand?: string;
  unit: string;
  price: number;
  stock: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type PaymentMode = 'cash' | 'upi' | 'card';

export interface Bill {
  id: string;
  bill_no: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_mode: PaymentMode;
  created_by: string;
  created_at: string;
  edited_at?: string | null;
  edited_by?: string | null;
  updated_at: string;
  sync_status?: 'synced' | 'pending';
  brand_discounts?: Record<string, number>; // Mapping brand name -> discount percentage
}

export interface BillItem {
  id: string;
  bill_id: string;
  product_id?: string | null;
  product_name: string;
  brand?: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export interface OutboxItem {
  id: string;
  entity: 'bills' | 'bill_items' | 'products' | 'brands' | 'categories' | 'monthly_targets';
  op: 'insert' | 'update' | 'upsert' | 'delete';
  payload: any;
  status: 'pending' | 'syncing' | 'done' | 'failed';
  attempts: number;
  created_at: string;
  last_error?: string | null;
}

export interface SyncMeta {
  table_name: string;
  last_synced_at: string;
}

export interface DeviceSequence {
  date_device: string; // e.g. "261011-A"
  current_seq: number;
}

export interface ShopSettings {
  shop_name: string;
  shop_address: string;
  shop_phone: string;
  gst_no: string;
  receipt_footer: string;
  device_code: string;
  paper_size: '80mm' | 'a4';
}

export interface ActivityLog {
  id: number;
  user_id?: string | null;
  user_name?: string | null;
  action: string;
  entity: string;
  entity_id: string;
  summary: string;
  old_data?: any;
  new_data?: any;
  created_at: string;
}

export interface MonthlyTarget {
  month: string; // YYYY-MM-01
  target_amount: number;
}

export interface TargetProgress {
  target_amount: number;
  achieved_amount: number;
  percentage: number;
  days_in_month: number;
  days_elapsed: number;
  days_remaining: number;
  required_daily_avg: number;
}
