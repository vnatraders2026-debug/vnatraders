import React, { useState, useEffect, useMemo } from 'react';
import { db, generateNextPoNo, applyStockChange } from '@/db';
import { syncService } from '@/sync/syncService';
import { PurchaseOrder, PurchaseOrderItem, Product, Client } from '@/types';
import { formatINR, numberToWordsINR, formatDateDMY } from '@/lib/format';
import { generateUUID } from '@/lib/uuid';
import { printFormattedElement } from '@/lib/printer/printService';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { SearchableProductSelect, ProductSearchAddBar } from '@/components/ui/ProductSelectBox';
import { ProductCatalogPicker } from '@/components/ProductCatalogPicker';
import { QuickProductModal } from '@/components/QuickProductModal';
import { BrandDiscountsSection, calculateBrandWiseTotals } from '@/components/BrandDiscountsSection';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import { VnaLogo } from '@/components/VnaLogo';
import {
  ShoppingCart,
  Search,
  Plus,
  Printer,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  Truck,
  Trash2,
  Eye,
  Boxes,
  RotateCcw,
  Building2,
} from 'lucide-react';
import { useCompany } from '@/features/company/CompanyContext';

export const PurchaseOrdersPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const { toast } = useToast();
  const { activeCompany, companies } = useCompany();

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [poNo, setPoNo] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [poItems, setPoItems] = useState<Array<{
    product_id: string;
    product_code: string;
    product_name: string;
    brand: string;
    unit: string;
    qty: number;
    unit_cost: number;
    line_total: number;
  }>>([]);
  const [brandDiscounts, setBrandDiscounts] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Quick Create New Product Modal state
  const [isQuickProductOpen, setIsQuickProductOpen] = useState(false);

  // View / Print Modal state
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<PurchaseOrderItem[]>([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [printCopy, setPrintCopy] = useState<'original' | 'duplicate'>('original');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isReceivingStock, setIsReceivingStock] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const allOrders = await db.purchase_orders.reverse().sortBy('created_at');
      setOrders(allOrders);

      const allClients = await db.clients.toArray();
      setSuppliers(allClients.filter((c) => c.type === 'supplier' || c.type === 'both'));

      const allProds = await db.products.toArray();
      setProducts(allProds.filter((p) => p.is_active));
    } catch (err: any) {
      toast(err?.message || 'Failed to load purchase orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleSync = () => {
      loadData();
    };

    window.addEventListener('purchase-orders-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('purchase-orders-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, []);

  const handleOpenCreate = async () => {
    const nextNo = await generateNextPoNo();
    setPoNo(nextNo);
    setSelectedSupplierId('');
    setSupplierName('');
    setSupplierPhone('');
    setSupplierGstin('');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setExpectedDate('');
    setNotes('');
    setBrandDiscounts({});
    setPoItems([
      {
        product_id: products[0]?.id || '',
        product_code: products[0]?.code || '',
        product_name: products[0]?.name || '',
        brand: products[0]?.brand || 'Standard',
        unit: products[0]?.unit || 'box',
        qty: 50,
        unit_cost: products[0]?.wholesale_price || products[0]?.price || 0,
        line_total: 50 * (products[0]?.wholesale_price || products[0]?.price || 0),
      },
    ]);
    setIsCreateOpen(true);
  };

  const handleSupplierSelect = (supId: string) => {
    setSelectedSupplierId(supId);
    const sup = suppliers.find((s) => s.id === supId);
    if (sup) {
      setSupplierName(sup.name);
      setSupplierPhone(sup.phone);
      setSupplierGstin(sup.gstin || '');
    }
  };

  const handleAddItemRow = () => {
    const first = products[0];
    setPoItems((prev) => [
      ...prev,
      {
        product_id: first?.id || '',
        product_code: first?.code || '',
        product_name: first?.name || '',
        brand: first?.brand || 'Standard',
        unit: first?.unit || 'box',
        qty: 50,
        unit_cost: first?.wholesale_price || first?.price || 0,
        line_total: 50 * (first?.wholesale_price || first?.price || 0),
      },
    ]);
  };

  const handleAddCustomItemRow = () => {
    setPoItems((prev) => [
      ...prev,
      {
        product_id: '',
        product_code: '',
        product_name: '',
        brand: 'Standard',
        unit: 'box',
        qty: 50,
        unit_cost: 50,
        line_total: 2500,
      },
    ]);
  };

  // Map of productId -> quantity currently in purchase order for catalog picker tracking
  const poAddedItemsMap = useMemo(() => {
    const map: Record<string, number> = {};
    poItems.forEach((it) => {
      if (it.product_id) {
        map[it.product_id] = (map[it.product_id] || 0) + (Number(it.qty) || 0);
      }
    });
    return map;
  }, [poItems]);

  const handleAddProductDirectly = (prod: Product, quantityToAdd: number = 25) => {
    const qty = quantityToAdd > 0 ? quantityToAdd : 25;
    const cost = prod.wholesale_price || prod.price || 0;
    setPoItems((prev) => {
      // If table only has 1 empty custom item, replace it
      if (prev.length === 1 && !prev[0].product_id && !prev[0].product_name) {
        return [
          {
            product_id: prod.id,
            product_code: prod.code,
            product_name: prod.name,
            brand: prod.brand || 'Standard',
            unit: prod.unit || 'box',
            qty: qty,
            unit_cost: cost,
            line_total: qty * cost,
          },
        ];
      }

      const existingIdx = prev.findIndex((it) => it.product_id === prod.id);
      if (existingIdx !== -1) {
        const next = [...prev];
        const newQty = (Number(next[existingIdx].qty) || 0) + qty;
        next[existingIdx] = {
          ...next[existingIdx],
          qty: newQty,
          line_total: Math.round(newQty * next[existingIdx].unit_cost * 100) / 100,
        };
        toast(`Updated "${prod.name}" order quantity to ${newQty}`, 'info');
        return next;
      }

      toast(`Added "${prod.name}" to Purchase Order (${qty} boxes)`, 'success');
      return [
        ...prev,
        {
          product_id: prod.id,
          product_code: prod.code,
          product_name: prod.name,
          brand: prod.brand || 'Standard',
          unit: prod.unit || 'box',
          qty: qty,
          unit_cost: cost,
          line_total: qty * cost,
        },
      ];
    });
  };

  const handleAddCustomProductDirectly = (name: string) => {
    setPoItems((prev) => [
      ...prev,
      {
        product_id: '',
        product_code: '',
        product_name: name,
        brand: 'Standard',
        unit: 'box',
        qty: 50,
        unit_cost: 50,
        line_total: 2500,
      },
    ]);
    toast(`Added custom product "${name}"`, 'info');
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...poItems];
    const row = { ...updated[index] };

    if (field === 'product_id') {
      if (value === '__custom__') {
        row.product_id = '';
        row.product_code = '';
        row.product_name = '';
        row.unit_cost = 0;
        row.line_total = 0;
      } else {
        const prod = products.find((p) => p.id === value);
        if (prod) {
          row.product_id = prod.id;
          row.product_code = prod.code;
          row.product_name = prod.name;
          row.brand = prod.brand || 'Standard';
          row.unit = prod.unit || 'box';
          row.unit_cost = prod.wholesale_price || prod.price || 0;
          row.line_total = row.qty * row.unit_cost;
        }
      }
    } else if (field === 'product_name') {
      row.product_name = value;
    } else if (field === 'brand') {
      row.brand = value;
    } else if (field === 'unit') {
      row.unit = value;
    } else if (field === 'qty') {
      row.qty = Math.max(1, parseInt(value) || 1);
      row.line_total = Math.round(row.qty * row.unit_cost * 100) / 100;
    } else if (field === 'unit_cost') {
      row.unit_cost = Math.max(0, parseFloat(value) || 0);
      row.line_total = Math.round(row.qty * row.unit_cost * 100) / 100;
    }

    updated[index] = row;
    setPoItems(updated);
  };

  const handleRemoveItemRow = (index: number) => {
    if (poItems.length <= 1) return;
    setPoItems(poItems.filter((_, i) => i !== index));
  };

  const brandDiscountTotals = useMemo(() => {
    return calculateBrandWiseTotals(
      poItems.map((it) => ({
        brand: it.brand || 'Standard',
        qty: it.qty,
        unit_cost: it.unit_cost,
        line_total: it.line_total,
      })),
      brandDiscounts
    );
  }, [poItems, brandDiscounts]);

  const handleSavePo = async (status: PurchaseOrder['status'] = 'ordered') => {
    if (!supplierName.trim()) {
      toast('Please enter or select a supplier name', 'error');
      return;
    }
    const validItems = poItems.filter((i) => i.product_name.trim() && i.qty > 0);
    if (validItems.length === 0) {
      toast('Please add at least one product with name and quantity > 0', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const poId = generateUUID();

      const poRecord: PurchaseOrder = {
        id: poId,
        po_no: poNo,
        supplier_id: selectedSupplierId || undefined,
        supplier_name: supplierName.trim(),
        supplier_phone: supplierPhone.trim() || undefined,
        supplier_gstin: supplierGstin.trim().toUpperCase() || undefined,
        company_id: activeCompany?.id,
        company_name: activeCompany?.name,
        order_date: orderDate,
        expected_date: expectedDate || undefined,
        status: status,
        subtotal: brandDiscountTotals.grossSubtotal,
        discount_amount: brandDiscountTotals.totalDiscount,
        discount_percent: brandDiscountTotals.effectiveDiscountPercent,
        brand_discounts: brandDiscounts,
        tax_amount: 0,
        total_amount: brandDiscountTotals.netTotal,
        payment_status: 'unpaid',
        paid_amount: 0,
        notes: notes.trim() || undefined,
        created_by: user?.full_name || user?.email || 'Admin',
        created_at: now,
        updated_at: now,
      };

      const itemsRecords: PurchaseOrderItem[] = validItems.map((it) => {
        const b = it.brand || 'Standard';
        const discPct = brandDiscounts[b] || 0;
        const gross = Math.round(it.qty * it.unit_cost * 100) / 100;
        const disc = Math.round((gross * discPct / 100) * 100) / 100;
        return {
          id: generateUUID(),
          po_id: poId,
          product_id: it.product_id || undefined,
          product_code: it.product_code || undefined,
          product_name: it.product_name.trim(),
          brand: b,
          unit: it.unit || 'box',
          qty: it.qty,
          unit_cost: it.unit_cost,
          discount_percent: discPct,
          line_total: Math.max(0, Math.round((gross - disc) * 100) / 100),
        };
      });

      await db.transaction('rw', [db.purchase_orders, db.purchase_order_items], async () => {
        await db.purchase_orders.put(poRecord);
        await db.purchase_order_items.bulkPut(itemsRecords);
      });

      await db.outbox.add({
        id: generateUUID(),
        entity: 'purchase_orders',
        op: 'insert',
        payload: { ...poRecord, items: itemsRecords },
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      syncService.triggerSync();

      toast(`Purchase Order ${poNo} created successfully`, 'success');
      setIsCreateOpen(false);
      loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to save purchase order', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewOrder = async (order: PurchaseOrder) => {
    setSelectedOrder(order);
    const items = await db.purchase_order_items.where('po_id').equals(order.id).toArray();
    setSelectedOrderItems(items);
    setPrintCopy('original');
    setIsViewModalOpen(true);
  };

  const handleMarkAsReceived = async (order: PurchaseOrder) => {
    if (order.status === 'received') return;
    const confirmReceive = window.confirm(
      `Confirm goods receipt for Purchase Order ${order.po_no}? This will automatically increase physical stock for all ordered products.`
    );
    if (!confirmReceive) return;

    setIsReceivingStock(true);
    try {
      const items = await db.purchase_order_items.where('po_id').equals(order.id).toArray();
      const now = new Date().toISOString();

      for (const it of items) {
        let prodId = it.product_id;
        if (!prodId) {
          // If product did not exist in catalog, automatically create it in the catalog now
          prodId = generateUUID();
          const cleanCode = it.product_code || `CRK-${Date.now().toString().slice(-4)}`;
          const newProduct: Product = {
            id: prodId,
            code: cleanCode,
            name: it.product_name,
            category: 'General',
            brand: it.brand || 'Standard',
            unit: it.unit || 'box',
            price: Math.round(it.unit_cost * 1.5),
            wholesale_price: it.unit_cost,
            stock: 0,
            is_active: true,
            created_at: now,
            updated_at: now,
          };
          await db.products.put(newProduct);
          await db.purchase_order_items.update(it.id, { product_id: prodId, product_code: cleanCode });
        }

        await applyStockChange(
          prodId,
          it.qty,
          'purchase',
          order.po_no,
          `Goods received from ${order.supplier_name} under ${order.po_no}`,
          user?.full_name || 'Admin'
        );
      }

      await db.purchase_orders.update(order.id, {
        status: 'received',
        updated_at: now,
      });

      const updatedPo = await db.purchase_orders.get(order.id);
      if (updatedPo) {
        await db.outbox.add({
          id: generateUUID(),
          entity: 'purchase_orders',
          op: 'update',
          payload: updatedPo,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
        syncService.triggerSync();
      }

      toast(`Stock updated! Received all items for ${order.po_no}`, 'success');
      setIsViewModalOpen(false);
      loadData();
    } catch (err: any) {
      toast(err?.message || 'Error receiving stock', 'error');
    } finally {
      setIsReceivingStock(false);
    }
  };

  const handlePrint = async () => {
    if (!selectedOrder) return;
    setIsPrinting(true);
    try {
      await printFormattedElement('purchase-order-print-area', {
        paperSize: 'a4',
        title: `Purchase_Order_${selectedOrder.po_no}`,
      });
    } catch (err: any) {
      toast(`Print notice: ${err?.message || 'Print error'}`, 'warning');
    } finally {
      setIsPrinting(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (companyFilter !== 'all') {
        const isDefault = companies.find((c) => c.is_default)?.id === companyFilter;
        const matches = o.company_id ? o.company_id === companyFilter : isDefault;
        if (!matches) return false;
      }
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          o.po_no.toLowerCase().includes(q) ||
          o.supplier_name.toLowerCase().includes(q) ||
          (o.supplier_phone || '').includes(q)
        );
      }
      return true;
    });
  }, [orders, companyFilter, statusFilter, searchQuery, companies]);

  return (
    <div className="space-y-4">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-black text-text tracking-tight flex items-center gap-2">
            <ShoppingCart className="text-accent" size={24} />
            <span>Purchase Order Management</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Procure stock from Sivakasi manufacturers, manage order receipts, and auto-update inventory.
          </p>
        </div>

        {isAdmin && (
          <Button variant="primary" size="sm" onClick={handleOpenCreate} className="gap-1.5 self-start sm:self-auto font-bold">
            <Plus size={15} />
            <span>Create Purchase Order</span>
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted uppercase">Total Orders</span>
          <div className="text-xl font-black text-text mt-1">{orders.length}</div>
          <span className="text-[10px] text-text-muted">Lifetime POs</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
            <Clock size={13} /> Active / Pending Arrival
          </span>
          <div className="text-xl font-black text-amber-600 mt-1">
            {orders.filter((o) => o.status === 'ordered').length}
          </div>
          <span className="text-[10px] text-text-muted">Awaiting delivery</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-success flex items-center gap-1">
            <CheckCircle2 size={13} /> Received & Stocked
          </span>
          <div className="text-xl font-black text-success mt-1">
            {orders.filter((o) => o.status === 'received').length}
          </div>
          <span className="text-[10px] text-text-muted">Inventory updated</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-accent uppercase">Procurement Value</span>
          <div className="text-base font-bold text-accent font-mono mt-1">
            {formatINR(orders.reduce((sum, o) => sum + (o.total_amount || 0), 0))}
          </div>
          <span className="text-[10px] text-text-muted">Total purchased</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface border border-border rounded p-3 flex flex-wrap gap-2.5 items-center justify-between">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search PO by number or supplier name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs min-h-[38px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="text-xs min-h-[38px]"
            title="Filter by Operating Company"
          >
            <option value="all">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.code ? `(${c.code})` : ''}
              </option>
            ))}
          </Select>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs min-h-[38px]"
          >
            <option value="all">All Statuses</option>
            <option value="ordered">Ordered (In Transit)</option>
            <option value="received">Received (Stocked)</option>
            <option value="draft">Draft</option>
            <option value="cancelled">Cancelled</option>
          </Select>

          {(searchQuery || statusFilter !== 'all' || companyFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setCompanyFilter('all');
              }}
              className="text-danger hover:underline text-xs font-semibold px-2 flex items-center gap-1"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Orders Table */}
      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          message="No purchase orders found"
          actionLabel={isAdmin ? 'Create First Purchase Order' : undefined}
          onAction={isAdmin ? handleOpenCreate : undefined}
        />
      ) : (
        <div className="overflow-x-auto w-full border border-border rounded bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Supplier / Factory</TableHead>
                <TableHead>Expected Date</TableHead>
                <TableHead className="text-right">Total Amount (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono font-bold text-accent">{o.po_no}</TableCell>
                  <TableCell className="text-xs">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent/10 text-accent border border-accent/20" title={o.company_name}>
                      {o.company_name || companies.find((c) => c.id === o.company_id)?.code || 'VNA'}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-text-muted font-medium whitespace-nowrap">
                    {new Date(o.order_date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-text text-sm">{o.supplier_name}</div>
                    {o.supplier_phone && <span className="text-[11px] text-text-muted">{o.supplier_phone}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-text-muted">
                    {o.expected_date ? new Date(o.expected_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-sm text-text">
                    {formatINR(o.total_amount)}
                  </TableCell>
                  <TableCell>
                    {o.status === 'received' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-success-light text-success">
                        <CheckCircle2 size={12} /> Received
                      </span>
                    ) : o.status === 'ordered' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600">
                        <Truck size={12} /> In Transit
                      </span>
                    ) : o.status === 'cancelled' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger-light text-danger">
                        <XCircle size={12} /> Cancelled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-surface text-text-muted border border-border">
                        <Clock size={12} /> Draft
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => handleViewOrder(o)} className="gap-1 min-h-[30px] text-xs">
                        <Eye size={13} />
                        <span>View</span>
                      </Button>
                      {o.status === 'ordered' && isAdmin && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleMarkAsReceived(o)}
                          className="gap-1 min-h-[30px] text-xs font-bold"
                          title="Receive goods into inventory"
                        >
                          <Boxes size={13} />
                          <span>Receive Goods</span>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* CREATE PURCHASE ORDER MODAL */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={`New Purchase Order: ${poNo}`}
        maxWidth="full"
      >
        <div className="space-y-4">
          {/* Operating Company Banner */}
          <div className="bg-accent/10 border border-accent/20 rounded-md p-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-accent" />
              <div>
                <span className="font-bold text-text">Operating Firm: {activeCompany?.name || 'VNA TRADERS'}</span>
                <span className="text-text-muted ml-2">GSTIN: {activeCompany?.gstin || '33ACSPV5299F1Z5'}</span>
              </div>
            </div>
            {activeCompany?.code && (
              <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-surface border text-accent text-[11px]">
                {activeCompany.code}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Select Existing Supplier (Optional)
              </label>
              <Select value={selectedSupplierId} onChange={(e) => handleSupplierSelect(e.target.value)}>
                <option value="">-- Choose from Suppliers --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.company_name ? `(${s.company_name})` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Supplier / Factory Name <span className="text-danger">*</span>
              </label>
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g. Standard Fireworks Factory"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Supplier Mobile</label>
              <Input
                value={supplierPhone}
                onChange={(e) => setSupplierPhone(e.target.value)}
                placeholder="e.g. 98421 23456"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Order Date</label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Expected Delivery Date</label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Supplier GSTIN</label>
              <Input
                value={supplierGstin}
                onChange={(e) => setSupplierGstin(e.target.value)}
                placeholder="33AAAAA0000A1Z5"
                className="font-mono uppercase"
              />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-3 border border-border rounded p-3 bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-text uppercase flex items-center gap-1.5">
                <Boxes size={14} className="text-accent" />
                <span>
                  Ordered Cracker Items ({poItems.length} items •{' '}
                  {poItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0)} Total Boxes)
                </span>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleAddItemRow} className="gap-1 min-h-[30px] text-xs">
                  <Plus size={13} />
                  <span>Add Row</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={handleAddCustomItemRow} className="gap-1 min-h-[30px] text-xs text-accent font-semibold">
                  <Plus size={13} />
                  <span>+ Non-Existing Product</span>
                </Button>
                <Button variant="primary" size="sm" onClick={() => setIsQuickProductOpen(true)} className="gap-1 min-h-[30px] text-xs font-semibold">
                  <Plus size={13} />
                  <span>Create &amp; Save to Catalog</span>
                </Button>
              </div>
            </div>

            {/* Visual Cracker Catalog & Quick-Add Browser */}
            <ProductCatalogPicker
              products={products}
              pricingType="wholesale"
              addedItemsMap={poAddedItemsMap}
              onSelectProduct={handleAddProductDirectly}
              onAddCustomProduct={handleAddCustomProductDirectly}
              title="Factory Cracker Catalog & Quick-Order"
              defaultOpen={true}
            />

            {/* Fast Quick Search Input */}
            <div className="bg-surface p-2.5 border border-border rounded-md shadow-xs">
              <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider flex items-center gap-1">
                <Search size={13} className="text-accent" />
                <span>Quick Search &amp; Add Cracker</span>
              </label>
              <ProductSearchAddBar
                products={products}
                pricingType="wholesale"
                onSelectProduct={handleAddProductDirectly}
                onAddCustomProduct={handleAddCustomProductDirectly}
                placeholder="Type cracker name, code, brand (e.g. 1000 Wala, 50 Shots, Standard) to search and order..."
              />
            </div>

            {/* Full Visibility Ordered Items Table (no inner overflow squish trap) */}
            <div className="overflow-x-auto border border-border/80 rounded-lg bg-surface shadow-xs">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="py-2 font-semibold">Product Description</th>
                    <th className="py-2 font-semibold w-20 text-center">Unit</th>
                    <th className="py-2 font-semibold text-right w-24">Qty (Boxes)</th>
                    <th className="py-2 font-semibold text-right w-28">Unit Cost (₹)</th>
                    <th className="py-2 font-semibold text-right w-28">Total (₹)</th>
                    <th className="py-2 text-right w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {poItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-surface/50">
                      <td className="py-2 pr-2">
                        {item.product_id ? (
                          <div className="flex items-center gap-1.5">
                            <SearchableProductSelect
                              products={products}
                              value={item.product_id}
                              pricingType="wholesale"
                              onChange={(prodId) => handleItemChange(idx, 'product_id', prodId)}
                              onCustomSelect={() => handleItemChange(idx, 'product_id', '__custom__')}
                            />
                            <button
                              type="button"
                              onClick={() => handleItemChange(idx, 'product_id', '__custom__')}
                              className="text-[10px] text-accent font-semibold px-2 py-1.5 rounded bg-accent/10 hover:bg-accent/20 whitespace-nowrap shrink-0"
                              title="Switch to custom / non-existing product"
                            >
                              Custom
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={item.product_name}
                                onChange={(e) => handleItemChange(idx, 'product_name', e.target.value)}
                                placeholder="Enter non-existing / factory cracker name..."
                                className="text-xs h-8 font-bold"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (products.length > 0) {
                                    handleItemChange(idx, 'product_id', products[0].id);
                                  }
                                }}
                                className="text-[10px] text-text-muted hover:text-text px-2 py-1 rounded border border-border whitespace-nowrap"
                                title="Switch back to catalog selection"
                              >
                                Catalog
                              </button>
                            </div>
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="text-text-muted">Brand:</span>
                              <input
                                value={item.brand || 'Standard'}
                                onChange={(e) => handleItemChange(idx, 'brand', e.target.value)}
                                placeholder="Brand (e.g. Standard)"
                                className="py-0.5 px-1.5 text-xs bg-surface border border-border rounded w-28"
                              />
                              <span className="text-text-muted">Unit:</span>
                              <input
                                value={item.unit || 'box'}
                                onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                                placeholder="Unit"
                                className="py-0.5 px-1.5 text-xs bg-surface border border-border rounded w-16 text-center"
                              />
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 font-bold uppercase text-[9px]">
                                Non-Existing / Custom Item
                              </span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-text-muted uppercase text-[11px] text-center align-top pt-3">
                        {item.unit}
                      </td>
                      <td className="py-2 text-right pr-2 align-top pt-2">
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleItemChange(idx, 'qty', e.target.value)}
                          className="w-20 text-right py-1 px-2 text-xs font-mono font-bold bg-surface border border-border rounded"
                        />
                      </td>
                      <td className="py-2 text-right pr-2 align-top pt-2">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={item.unit_cost}
                          onChange={(e) => handleItemChange(idx, 'unit_cost', e.target.value)}
                          className="w-24 text-right py-1 px-2 text-xs font-mono font-bold bg-surface border border-border rounded"
                        />
                      </td>
                      <td className="py-2 text-right font-mono font-bold text-accent align-top pt-3">
                        {formatINR(item.line_total)}
                      </td>
                      <td className="py-2 text-right align-top pt-2.5">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          disabled={poItems.length <= 1}
                          className="text-text-muted hover:text-danger disabled:opacity-20 p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Brand-Wise Discounts Section */}
            <BrandDiscountsSection
              items={poItems.map((i) => ({ ...i, unit_price: i.unit_cost }))}
              brandDiscounts={brandDiscounts}
              onChangeBrandDiscount={(brand, pct) => {
                setBrandDiscounts((prev) => ({ ...prev, [brand]: pct }));
              }}
              onClearAllDiscounts={() => setBrandDiscounts({})}
              onApplyAllDiscounts={(pct) => {
                const next: Record<string, number> = {};
                brandDiscountTotals.brandSummaries.forEach((s) => {
                  next[s.brand] = pct;
                });
                setBrandDiscounts(next);
              }}
            />

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 border-t border-border gap-2 text-sm">
              <div className="text-xs space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-text-muted">Gross Order Total:</span>
                  <span className="font-mono font-bold text-text">{formatINR(brandDiscountTotals.grossSubtotal)}</span>
                </div>
                {brandDiscountTotals.totalDiscount > 0 && (
                  <div className="flex items-center gap-2 text-danger">
                    <span>Brand Discount:</span>
                    <span className="font-mono font-bold">- {formatINR(brandDiscountTotals.totalDiscount)} ({brandDiscountTotals.effectiveDiscountPercent}%)</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-text-muted font-bold">Net Total Purchase Value:</span>
                <span className="text-accent text-lg font-black font-mono">{formatINR(brandDiscountTotals.netTotal)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">Notes / Terms</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Delivery via VRL Logistics, Payment 50% advance 50% after receipt"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleSavePo('draft')} disabled={isSaving}>
              Save as Draft
            </Button>
            <Button variant="primary" size="sm" onClick={() => handleSavePo('ordered')} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Confirm & Place Order'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* VIEW & PRINT PURCHASE ORDER MODAL */}
      {selectedOrder && (
        <Dialog
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          title={`Purchase Order: ${selectedOrder.po_no}`}
          maxWidth="full"
        >
          <div className="space-y-4">
            {/* Header Switcher & Printer Options (Hidden when printing) */}
            <div className="flex flex-wrap justify-between items-center gap-2 pb-2.5 border-b border-border no-print bg-surface p-2.5 rounded">
              <div className="flex flex-wrap items-center gap-2">
                {/* Document Copy Selectors */}
                <div className="flex rounded border border-border p-0.5 bg-background text-xs font-semibold">
                  {(['original', 'duplicate'] as const).map((cp) => (
                    <button
                      key={cp}
                      type="button"
                      onClick={() => setPrintCopy(cp)}
                      className={`px-3 py-1 rounded capitalize transition-colors ${
                        printCopy === cp ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                      }`}
                    >
                      {cp === 'original' ? 'Original (Supplier)' : 'Duplicate (Store Copy)'}
                    </button>
                  ))}
                </div>

                <span className="text-[11px] font-bold text-accent px-2 py-0.5 rounded bg-accent/10 border border-accent/20 flex items-center gap-1">
                  <FileText size={12} />
                  <span>Standard A4 Sheet Format</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="gap-1.5 font-bold shadow-xs"
                >
                  <Printer size={15} />
                  <span>{isPrinting ? 'Printing...' : 'Print A4 Purchase Order'}</span>
                </Button>
              </div>
            </div>

            {/* A4 PRINTABLE DOCUMENT CONTAINER */}
            {(() => {
              const poCompany = selectedOrder
                ? companies.find((c) => c.id === selectedOrder.company_id) || activeCompany
                : activeCompany;
              return (
            <div id="purchase-order-print-area" className="printable-area">
              <div className="max-w-4xl mx-auto p-6 bg-white text-gray-900 border-2 border-gray-800 rounded-sm shadow-xs space-y-4 print:p-0 print:border-none print:shadow-none text-xs font-sans">
                {/* Header branding */}
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-3">
                  <div>
                    <VnaLogo size="md" />
                    <div className="font-extrabold text-base uppercase text-gray-900 mt-1">
                      {poCompany?.name || 'VNA TRADERS'}
                    </div>
                    <div className="text-[11px] text-gray-600 leading-tight">
                      {poCompany?.legal_name || 'Wholesale & Retail Fireworks Merchant'}<br />
                      {poCompany?.address ? `${poCompany.address}, ${poCompany.city || 'Hosur'}, ${poCompany.state || 'Tamil Nadu'} - ${poCompany.pincode || '635109'}` : 'Jeermangalam, Hosur, Krishnagiri Dist, Tamil Nadu - 635109'}<br />
                      {poCompany?.phone ? `Phone: ${poCompany.phone}` : 'Phone: +91 94431 23456 / +91 94432 98765'}<br />
                      <strong>GSTIN: {poCompany?.gstin || '33ACSPV5299F1Z5'}</strong> • State Code: 33 ({poCompany?.state || 'Tamil Nadu'})
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-800 font-bold text-xs uppercase tracking-wider inline-block">
                      PURCHASE ORDER
                    </span>
                    <div className="text-[10px] text-gray-600 font-bold uppercase mt-1">
                      {printCopy === 'original' ? 'ORIGINAL FOR SUPPLIER' : 'DUPLICATE FOR STORE RECORD'}
                    </div>
                    <div className="text-lg font-black font-mono text-gray-900 mt-1">
                      {selectedOrder.po_no}
                    </div>
                    <div className="text-xs text-gray-600">
                      Order Date: <strong>{formatDateDMY(selectedOrder.order_date)}</strong>
                    </div>
                    {selectedOrder.expected_date && (
                      <div className="text-xs text-gray-600">
                        Expected Delivery: <strong>{formatDateDMY(selectedOrder.expected_date)}</strong>
                      </div>
                    )}
                    <div className="text-xs text-gray-600 mt-0.5">
                      Status: <strong className="uppercase font-bold text-gray-900">{selectedOrder.status}</strong>
                    </div>
                  </div>
                </div>

                {/* Vendor & Delivery Destination Grid */}
                <div className="grid grid-cols-2 gap-4 border border-gray-300 p-3 rounded text-xs bg-gray-50/50">
                  <div>
                    <span className="text-gray-500 font-bold uppercase text-[10px] block">Details of Vendor / Supplier:</span>
                    <div className="font-extrabold text-sm text-gray-900 mt-0.5">{selectedOrder.supplier_name}</div>
                    {selectedOrder.supplier_phone && <div className="text-gray-700">Phone: <strong>{selectedOrder.supplier_phone}</strong></div>}
                    {selectedOrder.supplier_gstin ? (
                      <div className="font-mono font-bold text-gray-900 mt-1">
                        GSTIN: {selectedOrder.supplier_gstin}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic mt-0.5">Unregistered Manufacturer / Supplier</div>
                    )}
                  </div>

                  <div className="border-l border-gray-300 pl-3 space-y-1">
                    <span className="text-gray-500 font-bold uppercase text-[10px] block">Ship To / Delivery Destination:</span>
                    <div className="font-extrabold text-sm text-gray-900">{poCompany?.name || 'VNA TRADERS'} (Hosur Depot)</div>
                    <div className="text-gray-700">{poCompany?.address ? `${poCompany.address}, ${poCompany.city || 'Hosur'}, ${poCompany.state || 'Tamil Nadu'} - ${poCompany.pincode || '635109'}` : 'Jeermangalam, Hosur, Krishnagiri Dist, Tamil Nadu - 635109'}</div>
                    <div className="text-gray-700">Depot Contact: {poCompany?.phone || '+91 94431 23456 / +91 94432 98765'}</div>
                    <div className="text-gray-700">Logistics: Direct Sivakasi Factory Transport / Lorry</div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="border border-gray-300 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b border-gray-300 font-bold text-gray-700">
                      <tr>
                        <th className="p-2 text-left w-8">#</th>
                        <th className="p-2 text-left">Cracker Item Description</th>
                        <th className="p-2 text-left w-24">Brand</th>
                        <th className="p-2 text-center w-16">Unit</th>
                        <th className="p-2 text-right w-24">Ordered Qty</th>
                        <th className="p-2 text-right w-28">Unit Cost (₹)</th>
                        <th className="p-2 text-right w-28">Total Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedOrderItems.map((it, idx) => (
                        <tr key={it.id}>
                          <td className="p-2 text-gray-500">{idx + 1}</td>
                          <td className="p-2 font-bold text-gray-900">{it.product_name}</td>
                          <td className="p-2 text-gray-600">{it.brand || 'Standard'}</td>
                          <td className="p-2 text-center text-gray-600 uppercase text-[11px]">{it.unit}</td>
                          <td className="p-2 text-right font-mono font-bold text-gray-900">
                            {it.qty} {it.unit}
                          </td>
                          <td className="p-2 text-right font-mono text-gray-800">{formatINR(it.unit_cost)}</td>
                          <td className="p-2 text-right font-mono font-bold text-gray-900">
                            {formatINR(it.line_total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-gray-900">
                      <tr>
                        <td colSpan={4} className="p-2 text-right uppercase text-[11px]">
                          Total Ordered Quantity:
                        </td>
                        <td className="p-2 text-right font-mono font-extrabold text-xs">
                          {selectedOrderItems.reduce((acc, i) => acc + (i.qty || 0), 0)} Boxes
                        </td>
                        <td colSpan={2} className="p-2 text-right">
                          <div className="space-y-1">
                            {(selectedOrder.discount_amount ?? 0) > 0 && (
                              <div className="flex justify-between text-xs font-semibold text-gray-600">
                                <span>Gross Subtotal:</span>
                                <span className="font-mono">{formatINR(selectedOrder.subtotal)}</span>
                              </div>
                            )}
                            {(selectedOrder.discount_amount ?? 0) > 0 && (
                              <div className="flex justify-between text-xs font-bold text-red-600">
                                <span>Brand Discount ({selectedOrder.discount_percent || 0}%):</span>
                                <span className="font-mono">- {formatINR(selectedOrder.discount_amount || 0)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm font-black text-gray-900 pt-0.5 border-t border-gray-300">
                              <span>Total Net Payable:</span>
                              <span className="font-mono">{formatINR(selectedOrder.total_amount)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Words, Notes & Payment Terms */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="p-2.5 bg-gray-50 border border-gray-300 rounded text-xs">
                      <span className="text-gray-500 text-[10px] uppercase font-bold block">Total Amount In Words:</span>
                      <div className="font-bold text-gray-900 mt-0.5 leading-snug">
                        {numberToWordsINR(selectedOrder.total_amount)}
                      </div>
                    </div>

                    {selectedOrder.notes && (
                      <div className="p-2 bg-gray-50 border border-gray-300 rounded text-xs">
                        <span className="text-gray-500 text-[10px] uppercase font-bold block">Special Order Notes:</span>
                        <div className="text-gray-800 mt-0.5">{selectedOrder.notes}</div>
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 bg-gray-50 border border-gray-300 rounded text-[11px] leading-tight space-y-1">
                    <span className="font-bold text-gray-800 uppercase block">Inward Audit &amp; Settlement:</span>
                    <div>Inspection: <strong>Physical Count &amp; Quality Audit upon Hosur Arrival</strong></div>
                    <div>Consignment: <strong>Must include Factory Delivery Challan / Invoice</strong></div>
                    <div>Explosives Class: <strong>PESO Approved Class 7 Fireworks Only</strong></div>
                  </div>
                </div>

                {/* Terms & Bottom Signatures */}
                <div className="pt-3 border-t border-gray-300 space-y-4 avoid-break">
                  <div className="text-[10px] text-gray-500 space-y-0.5 leading-tight">
                    <span className="font-bold text-gray-700 uppercase">Purchase Terms &amp; Conditions:</span>
                    <p>1. Goods supplied must strictly comply with PESO statutory regulations and approved packaging standards.</p>
                    <p>2. Every outer carton must be distinctly labeled with Brand, Batch Number, and Manufacturing Date.</p>
                    <p>3. Delivery Challan / Factory Invoice and valid Transporter LR copy must accompany the consignment.</p>
                    <p>4. Damaged, damp, or non-conforming lots will be rejected and debited to supplier account.</p>
                  </div>

                  {/* 3 SIGNATURES AT THE VERY BOTTOM */}
                  <div className="grid grid-cols-3 gap-6 pt-6">
                    <div className="text-center">
                      <div className="h-14 flex items-end justify-center text-gray-400 italic text-[11px]">
                        [Store Inward Seal]
                      </div>
                      <div className="border-t border-gray-800 pt-1">
                        <div className="font-bold text-gray-900 text-xs">Prepared &amp; Checked By</div>
                        <div className="text-[10px] text-gray-500">Inventory Store Manager</div>
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="h-14 flex items-end justify-center text-gray-400 italic text-[11px]">
                        [Supplier Stamp &amp; Sign]
                      </div>
                      <div className="border-t border-gray-800 pt-1">
                        <div className="font-bold text-gray-900 text-xs">Supplier / Factory Acceptance</div>
                        <div className="text-[10px] text-gray-500">Order Confirmation &amp; Date</div>
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="h-14 flex items-end justify-center text-gray-400 italic text-[11px]">
                        For <strong>{poCompany?.name || 'VNA TRADERS'}</strong>
                      </div>
                      <div className="border-t border-gray-800 pt-1">
                        <div className="font-bold text-gray-900 text-xs">Authorized Signatory</div>
                        <div className="text-[10px] text-gray-500">Purchase Management Office</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
              );
            })()}

            {/* Actions Toolbar */}
            <div className="flex justify-end gap-2 pt-3 border-t border-border no-print">
              <Button variant="secondary" size="sm" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
              <Button variant="secondary" size="sm" onClick={handlePrint} disabled={isPrinting} className="gap-1.5 font-semibold">
                <Printer size={14} />
                <span>{isPrinting ? 'Printing...' : 'Print A4 PO'}</span>
              </Button>
              {selectedOrder.status === 'ordered' && isAdmin && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleMarkAsReceived(selectedOrder)}
                  disabled={isReceivingStock}
                  className="gap-1.5 font-bold"
                >
                  <Boxes size={14} />
                  <span>{isReceivingStock ? 'Updating Stock...' : 'Confirm Goods Received (+Stock)'}</span>
                </Button>
              )}
            </div>
          </div>
        </Dialog>
      )}

      {/* QUICK CREATE PRODUCT MODAL */}
      <QuickProductModal
        isOpen={isQuickProductOpen}
        onClose={() => setIsQuickProductOpen(false)}
        pricingType="wholesale"
        defaultQty={50}
        title="Add New / Non-Existing Product to Order"
        subtitle="Add a newly introduced cracker directly into this Purchase Order and optionally register it in your product catalog."
        onAddProduct={(item) => {
          const cost = item.wholesalePrice || item.retailPrice || 0;
          setPoItems((prev) => [
            ...prev,
            {
              product_id: item.productId || '',
              product_code: item.productCode || '',
              product_name: item.productName,
              brand: item.brand,
              unit: item.unit,
              qty: item.qty,
              unit_cost: cost,
              line_total: Math.round(item.qty * cost * 100) / 100,
            },
          ]);

          if (item.productId) {
            setProducts((prev) => [
              ...prev,
              {
                id: item.productId!,
                code: item.productCode,
                name: item.productName,
                category: item.category,
                brand: item.brand,
                unit: item.unit,
                price: item.retailPrice,
                wholesale_price: item.wholesalePrice,
                stock: 0,
                is_active: true,
              },
            ]);
          }
        }}
      />
    </div>
  );
};
