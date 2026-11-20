export type UserRole = 'admin' | 'manager' | 'supervisor' | 'cashier' | 'staff' | 'dispatcher';

export interface Company {
  id: string;
  name: string;
  legal_name?: string;
  code: string; // short prefix e.g. "VNA", "SVF"
  gstin: string; // 15-character GSTIN
  pan?: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  bank_name?: string;
  bank_account_no?: string;
  bank_ifsc?: string;
  bank_branch?: string;
  receipt_footer?: string;
  logo_url?: string;
  is_active: boolean;
  is_default?: boolean;
  created_at: string;
  updated_at?: string;
}

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
  has_discount?: boolean;
  discount_percent?: number;
  max_discount?: number;
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
  price: number; // Retail Price (current price)
  wholesale_price?: number; // Wholesale Price
  stock: number;
  min_stock?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type PricingType = 'retail' | 'wholesale';

export type ClientType = 'customer' | 'supplier' | 'both';
export type CustomerTier = 'wholesale' | 'retail';

export interface Client {
  id: string;
  name: string;
  company_name?: string;
  type: ClientType;
  customer_tier?: CustomerTier;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  credit_limit?: number;
  outstanding_balance?: number;
  current_balance?: number;
  notes?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type StockMovementType = 'in' | 'out' | 'adjustment' | 'sale' | 'purchase' | 'return' | 'damage';

export interface StockMovement {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  brand?: string;
  type: StockMovementType;
  qty: number; // Positive for additions, negative for reductions
  prev_stock: number;
  new_stock: number;
  reference_no?: string; // Bill No, PO No, SO No, or Audit Ref
  reason?: string;
  created_by?: string;
  created_at: string;
}

export type PurchaseOrderStatus = 'draft' | 'ordered' | 'received' | 'cancelled';

export interface PurchaseOrder {
  id: string;
  po_no: string;
  company_id?: string;
  company_name?: string;
  supplier_id?: string;
  supplier_name: string;
  supplier_phone?: string;
  supplier_gstin?: string;
  order_date: string;
  expected_date?: string;
  status: PurchaseOrderStatus;
  subtotal: number;
  discount_amount?: number;
  discount_percent?: number;
  brand_discounts?: Record<string, number>;
  tax_amount: number;
  total_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  paid_amount?: number;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id?: string;
  product_code?: string;
  product_name: string;
  brand?: string;
  unit: string;
  qty: number;
  unit_cost: number;
  discount_percent?: number;
  line_total: number;
}

export type SaleOrderStatus = 'pending' | 'confirmed' | 'packed' | 'dispatched' | 'delivered' | 'cancelled';

export interface SaleOrder {
  id: string;
  so_no: string;
  company_id?: string;
  company_name?: string;
  client_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gstin?: string;
  pricing_type: PricingType;
  order_date: string;
  delivery_due_date?: string;
  status: SaleOrderStatus;
  subtotal: number;
  discount_amount: number;
  discount_percent?: number;
  brand_discounts?: Record<string, number>;
  total_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  paid_amount?: number;
  payment_mode?: PaymentMode;
  // Dispatch & Transport info for crackers logistics
  transport_name?: string;
  lr_number?: string;
  vehicle_number?: string;
  driver_phone?: string;
  destination?: string;
  dispatched_at?: string;
  delivered_at?: string;
  assigned_dispatcher_id?: string;
  assigned_dispatcher_name?: string;
  dispatch_assigned_at?: string;
  verified_items?: string[]; // IDs of SaleOrderItem verified by dispatcher
  dispatched_by?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SaleOrderItem {
  id: string;
  so_id: string;
  product_id?: string;
  product_code?: string;
  product_name: string;
  brand?: string;
  unit: string;
  qty: number;
  unit_price: number;
  discount_percent?: number;
  line_total: number;
}

export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface Invoice {
  id: string;
  invoice_no: string;
  company_id?: string;
  company_name?: string;
  so_id?: string; // Linked Sale Order if any
  client_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gstin?: string;
  invoice_date: string;
  due_date?: string;
  pricing_type: PricingType;
  subtotal: number;
  discount_amount: number;
  discount_percent?: number;
  brand_discounts?: Record<string, number>;
  taxable_amount: number;
  gst_rate?: number; // e.g. 18% for fireworks
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  total_amount: number;
  payment_status: InvoicePaymentStatus;
  paid_amount: number;
  payment_mode?: PaymentMode;
  transport_name?: string;
  lr_number?: string;
  vehicle_number?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id?: string;
  product_code?: string;
  product_name: string;
  brand?: string;
  hsn_code?: string; // Fireworks HSN code default '3604'
  unit: string;
  qty: number;
  unit_price: number;
  discount_percent?: number;
  taxable_value: number;
  line_total: number;
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'converted' | 'expired' | 'rejected';

export interface Quotation {
  id: string;
  quotation_no: string;
  company_id?: string;
  company_name?: string;
  client_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_gstin?: string;
  pricing_type: PricingType;
  quotation_date: string;
  valid_until: string;
  status: QuotationStatus;
  converted_to?: 'sale_order' | 'invoice';
  converted_id?: string;
  subtotal: number;
  discount_amount: number;
  discount_percent?: number;
  brand_discounts?: Record<string, number>;
  taxable_amount: number;
  gst_rate?: number; // 18%
  cgst: number;
  sgst: number;
  igst: number;
  round_off: number;
  total_amount: number;
  terms_and_conditions?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QuotationItem {
  id: string;
  quotation_id: string;
  product_id?: string;
  product_code?: string;
  product_name: string;
  brand?: string;
  hsn_code?: string; // Fireworks HSN code default '3604'
  unit: string;
  qty: number;
  unit_price: number;
  discount_percent?: number;
  taxable_value: number;
  line_total: number;
}

export type PaymentMode = 'cash' | 'upi' | 'card';

export interface Bill {
  id: string;
  bill_no: string;
  company_id?: string;
  company_name?: string;
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

export type TransportStatus = 'booked' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'cancelled';
export type FreightType = 'to_pay' | 'paid' | 'tbb' | 'free_delivery';

export interface TransportEntry {
  id: string;
  lr_no: string; // Lorry Receipt / Bilty No
  transport_name: string; // Carrier Name
  vehicle_no?: string;
  driver_name?: string;
  driver_phone?: string;
  dispatch_date: string;
  estimated_delivery_date?: string;
  actual_delivery_date?: string;
  destination: string;
  source_location?: string;
  
  // Consignee / Customer
  so_id?: string;
  so_no?: string;
  invoice_id?: string;
  invoice_no?: string;
  client_id?: string;
  consignee_name: string;
  consignee_phone?: string;
  consignee_address?: string;
  consignee_gstin?: string;

  // Cargo / Cracker Consignment
  total_boxes: number;
  total_weight_kg?: number;
  consignment_value: number;
  items_summary?: string;

  // Freight & Charges
  freight_type: FreightType;
  freight_amount: number;
  loading_charges?: number;
  total_charges: number;

  // Status & Tracking
  status: TransportStatus;
  delivery_remarks?: string;
  dispatched_by?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface OutboxItem {
  id: string;
  entity:
    | 'bills'
    | 'bill_items'
    | 'products'
    | 'brands'
    | 'categories'
    | 'monthly_targets'
    | 'clients'
    | 'quotations'
    | 'quotation_items'
    | 'purchase_orders'
    | 'purchase_order_items'
    | 'sale_orders'
    | 'sale_order_items'
    | 'invoices'
    | 'invoice_items'
    | 'stock_movements'
    | 'transport_entries'
    | 'companies';
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
  paper_size: '80mm' | '58mm' | 'a4';
  auto_print?: boolean;
  print_margin_offset?: number;
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
