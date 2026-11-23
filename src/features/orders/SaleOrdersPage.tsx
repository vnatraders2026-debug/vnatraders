import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, generateNextSoNo, DEFAULT_COMPANY_ID } from '@/db';
import { useCompany } from '@/features/companies/CompanyContext';
import { syncService } from '@/sync/syncService';
import { SaleOrder, SaleOrderItem, Product, Client, PricingType, SaleOrderStatus, Profile, TransportEntry } from '@/types';
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
  Search,
  Plus,
  Printer,
  FileText,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Package,
  Trash2,
  Eye,
  RotateCcw,
  XCircle,
  ClipboardCheck,
  Lock,
} from 'lucide-react';

export const SaleOrdersPage: React.FC = () => {
  const { user } = useAuth();
  const { activeCompany, activeCompanyId, isAllCompanies, companies } = useCompany();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const { toast } = useToast();

  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [soNo, setSoNo] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [pricingType, setPricingType] = useState<PricingType>('wholesale');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDueDate, setDeliveryDueDate] = useState('');
  const [transportName, setTransportName] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [destination, setDestination] = useState('');
  const [notes, setNotes] = useState('');
  const [soItems, setSoItems] = useState<Array<{
    product_id: string;
    product_code: string;
    product_name: string;
    brand: string;
    unit: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }>>([]);
  const [brandDiscounts, setBrandDiscounts] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Quick Create New Product Modal state
  const [isQuickProductOpen, setIsQuickProductOpen] = useState(false);

  // View / Print / Dispatch Modal state
  const [selectedOrder, setSelectedOrder] = useState<SaleOrder | null>(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState<SaleOrderItem[]>([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [printDocType, setPrintDocType] = useState<'order' | 'challan'>('order');
  const [printCopy, setPrintCopy] = useState<'original' | 'duplicate' | 'triplicate'>('original');
  const [isPrinting, setIsPrinting] = useState(false);

  // Dispatch Action Modal state
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [dispatchTransport, setDispatchTransport] = useState('');
  const [dispatchLr, setDispatchLr] = useState('');
  const [dispatchVehicle, setDispatchVehicle] = useState('');
  const [dispatchDriver, setDispatchDriver] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Assign to Dispatcher Modal state
  const [dispatchers, setDispatchers] = useState<Profile[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningOrder, setAssigningOrder] = useState<SaleOrder | null>(null);
  const [selectedDispatcherId, setSelectedDispatcherId] = useState('');
  const [assignedDueDate, setAssignedDueDate] = useState('');
  const [assignedNotes, setAssignedNotes] = useState('');
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const allOrders = await db.sale_orders.reverse().sortBy('created_at');
      setOrders(allOrders);

      const allClients = await db.clients.toArray();
      setClients(allClients.filter((c) => c.type === 'customer' || c.type === 'both'));

      const allProds = await db.products.toArray();
      setProducts(allProds.filter((p) => p.is_active));

      const allProfiles = await db.profiles.toArray();
      const activeStaff = allProfiles.filter(
        (p) => p.role === 'dispatcher' || p.role === 'staff' || p.role === 'cashier' || p.role === 'manager' || p.role === 'supervisor'
      );
      // Prioritize dedicated dispatchers at the top
      activeStaff.sort((a, b) => (a.role === 'dispatcher' ? -1 : b.role === 'dispatcher' ? 1 : 0));
      setDispatchers(activeStaff);
    } catch (err: any) {
      toast(err?.message || 'Failed to load sale orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleSync = () => {
      loadData();
    };

    window.addEventListener('sale-orders-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('sale-orders-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, []);

  const handleOpenCreate = async () => {
    const nextNo = await generateNextSoNo();
    setSoNo(nextNo);
    setSelectedClientId('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerGstin('');
    setPricingType('wholesale');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setDeliveryDueDate(new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10));
    setTransportName('');
    setLrNumber('');
    setVehicleNumber('');
    setDestination('');
    setNotes('');
    setBrandDiscounts({});

    const first = products[0];
    const initialPrice = first?.wholesale_price && first.wholesale_price > 0 ? first.wholesale_price : first?.price || 0;
    setSoItems([
      {
        product_id: first?.id || '',
        product_code: first?.code || '',
        product_name: first?.name || '',
        brand: first?.brand || 'Standard',
        unit: first?.unit || 'box',
        qty: 25,
        unit_price: initialPrice,
        line_total: 25 * initialPrice,
      },
    ]);
    setIsCreateOpen(true);
  };

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setCustomerName(client.name);
      setCustomerPhone(client.phone);
      setCustomerAddress(client.address ? `${client.address}, ${client.city || ''}` : '');
      setCustomerGstin(client.gstin || '');
      if (client.customer_tier) {
        setPricingType(client.customer_tier);
      }
    }
  };

  const handleAddItemRow = () => {
    const first = products[0];
    const itemPrice =
      pricingType === 'wholesale' && first?.wholesale_price && first.wholesale_price > 0
        ? first.wholesale_price
        : first?.price || 0;

    setSoItems((prev) => [
      ...prev,
      {
        product_id: first?.id || '',
        product_code: first?.code || '',
        product_name: first?.name || '',
        brand: first?.brand || 'Standard',
        unit: first?.unit || 'box',
        qty: 10,
        unit_price: itemPrice,
        line_total: 10 * itemPrice,
      },
    ]);
  };

  const handleAddCustomItemRow = () => {
    setSoItems((prev) => [
      ...prev,
      {
        product_id: '',
        product_code: '',
        product_name: '',
        brand: 'Standard',
        unit: 'box',
        qty: 10,
        unit_price: 100,
        line_total: 1000,
      },
    ]);
  };

  // Map of productId -> quantity currently in sale order for catalog picker tracking
  const soAddedItemsMap = useMemo(() => {
    const map: Record<string, number> = {};
    soItems.forEach((it) => {
      if (it.product_id) {
        map[it.product_id] = (map[it.product_id] || 0) + (Number(it.qty) || 0);
      }
    });
    return map;
  }, [soItems]);

  const handleAddProductDirectly = (prod: Product, quantityToAdd: number = 10) => {
    const qty = quantityToAdd > 0 ? quantityToAdd : 10;
    const rate =
      pricingType === 'wholesale' && prod.wholesale_price && prod.wholesale_price > 0
        ? prod.wholesale_price
        : prod.price;

    setSoItems((prev) => {
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
            unit_price: rate,
            line_total: qty * rate,
          },
        ];
      }

      // Check if product already exists in the order; if so, increase quantity
      const existingIdx = prev.findIndex((it) => it.product_id === prod.id);
      if (existingIdx !== -1) {
        const next = [...prev];
        const newQty = (Number(next[existingIdx].qty) || 0) + qty;
        next[existingIdx] = {
          ...next[existingIdx],
          qty: newQty,
          line_total: Math.round(newQty * next[existingIdx].unit_price * 100) / 100,
        };
        toast(`Updated "${prod.name}" quantity to ${newQty}`, 'info');
        return next;
      }

      toast(`Added "${prod.name}" to order (${qty} boxes)`, 'success');
      return [
        ...prev,
        {
          product_id: prod.id,
          product_code: prod.code,
          product_name: prod.name,
          brand: prod.brand || 'Standard',
          unit: prod.unit || 'box',
          qty: qty,
          unit_price: rate,
          line_total: qty * rate,
        },
      ];
    });
  };

  const handleAddCustomProductDirectly = (name: string) => {
    setSoItems((prev) => [
      ...prev,
      {
        product_id: '',
        product_code: '',
        product_name: name,
        brand: 'Standard',
        unit: 'box',
        qty: 10,
        unit_price: 100,
        line_total: 1000,
      },
    ]);
    toast(`Added custom cracker "${name}"`, 'info');
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...soItems];
    const row = { ...updated[index] };

    if (field === 'product_id') {
      if (value === '__custom__') {
        row.product_id = '';
        row.product_code = '';
        row.product_name = '';
        row.unit_price = 0;
        row.line_total = 0;
      } else {
        const prod = products.find((p) => p.id === value);
        if (prod) {
          row.product_id = prod.id;
          row.product_code = prod.code;
          row.product_name = prod.name;
          row.brand = prod.brand || 'Standard';
          row.unit = prod.unit || 'box';
          row.unit_price =
            pricingType === 'wholesale' && prod.wholesale_price && prod.wholesale_price > 0
              ? prod.wholesale_price
              : prod.price;
          row.line_total = row.qty * row.unit_price;
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
      row.line_total = Math.round(row.qty * row.unit_price * 100) / 100;
    } else if (field === 'unit_price') {
      row.unit_price = Math.max(0, parseFloat(value) || 0);
      row.line_total = Math.round(row.qty * row.unit_price * 100) / 100;
    }

    updated[index] = row;
    setSoItems(updated);
  };

  const handleRemoveItemRow = (index: number) => {
    if (soItems.length <= 1) return;
    setSoItems(soItems.filter((_, i) => i !== index));
  };

  const brandDiscountTotals = useMemo(() => {
    return calculateBrandWiseTotals(
      soItems.map((it) => ({
        brand: it.brand || 'Standard',
        qty: it.qty,
        unit_price: it.unit_price,
        line_total: it.line_total,
      })),
      brandDiscounts
    );
  }, [soItems, brandDiscounts]);

  const handleSaveSo = async () => {
    if (!customerName.trim()) {
      toast('Please enter or select a customer name', 'error');
      return;
    }
    const validItems = soItems.filter((i) => i.product_name.trim() && i.qty > 0);
    if (validItems.length === 0) {
      toast('Please add at least one product with name and quantity > 0', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const soId = generateUUID();

      const soRecord: SaleOrder = {
        id: soId,
        so_no: soNo,
        company_id: activeCompanyId || DEFAULT_COMPANY_ID,
        client_id: selectedClientId || undefined,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        customer_address: customerAddress.trim() || undefined,
        customer_gstin: customerGstin.trim().toUpperCase() || undefined,
        pricing_type: pricingType,
        order_date: orderDate,
        delivery_due_date: deliveryDueDate || undefined,
        status: 'pending',
        subtotal: brandDiscountTotals.grossSubtotal,
        discount_amount: brandDiscountTotals.totalDiscount,
        discount_percent: brandDiscountTotals.effectiveDiscountPercent,
        brand_discounts: brandDiscounts,
        total_amount: brandDiscountTotals.netTotal,
        payment_status: 'unpaid',
        paid_amount: 0,
        transport_name: transportName.trim() || undefined,
        lr_number: lrNumber.trim() || undefined,
        vehicle_number: vehicleNumber.trim() || undefined,
        destination: destination.trim() || undefined,
        notes: notes.trim() || undefined,
        created_by: user?.full_name || user?.email || 'Staff',
        created_at: now,
        updated_at: now,
      };

      const itemsRecords: SaleOrderItem[] = validItems.map((it) => {
        const b = it.brand || 'Standard';
        const discPct = brandDiscounts[b] || 0;
        const gross = Math.round(it.qty * it.unit_price * 100) / 100;
        const disc = Math.round((gross * discPct / 100) * 100) / 100;
        return {
          id: generateUUID(),
          so_id: soId,
          product_id: it.product_id || undefined,
          product_code: it.product_code || undefined,
          product_name: it.product_name.trim(),
          brand: b,
          unit: it.unit || 'box',
          qty: it.qty,
          unit_price: it.unit_price,
          discount_percent: discPct,
          line_total: Math.max(0, Math.round((gross - disc) * 100) / 100),
        };
      });

      await db.transaction('rw', [db.sale_orders, db.sale_order_items], async () => {
        await db.sale_orders.put(soRecord);
        await db.sale_order_items.bulkPut(itemsRecords);
      });

      await db.outbox.add({
        id: generateUUID(),
        entity: 'sale_orders',
        op: 'insert',
        payload: { ...soRecord, items: itemsRecords },
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      syncService.triggerSync();

      toast(`Sale Order ${soNo} created successfully!`, 'success');
      setIsCreateOpen(false);
      loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to save sale order', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewOrder = async (order: SaleOrder) => {
    setSelectedOrder(order);
    const items = await db.sale_order_items.where('so_id').equals(order.id).toArray();
    setSelectedOrderItems(items);
    setPrintDocType('order');
    setPrintCopy('original');
    setIsViewModalOpen(true);
  };

  const handlePrintSo = async () => {
    if (!selectedOrder) return;
    setIsPrinting(true);
    try {
      await printFormattedElement('sale-order-print-area', {
        paperSize: 'a4',
        title: `${printDocType === 'challan' ? 'Delivery_Challan' : 'Sale_Order'}_${selectedOrder.so_no}`,
      });
    } catch (err: any) {
      toast(`Print notice: ${err?.message || 'Print error'}`, 'warning');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDeleteOrder = async (order: SaleOrder) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete Sale Order ${order.so_no}?`)) return;
    try {
      await db.transaction('rw', [db.sale_orders, db.sale_order_items], async () => {
        await db.sale_order_items.where('so_id').equals(order.id).delete();
        await db.sale_orders.delete(order.id);
      });

      await db.outbox.add({
        id: generateUUID(),
        entity: 'sale_orders',
        op: 'delete',
        payload: { id: order.id },
        status: 'pending',
        attempts: 0,
        created_at: new Date().toISOString(),
      });
      syncService.triggerSync();

      toast(`Sale Order ${order.so_no} deleted`, 'info');
      loadData();
    } catch (err: any) {
      toast(`Failed to delete order: ${err?.message}`, 'error');
    }
  };

  const handleOpenDispatchModal = (order: SaleOrder) => {
    setSelectedOrder(order);
    setDispatchTransport(order.transport_name || 'VRL Logistics');
    setDispatchLr(order.lr_number || '');
    setDispatchVehicle(order.vehicle_number || '');
    setDispatchDriver('');
    setIsDispatchModalOpen(true);
  };

  const handleConfirmDispatch = async () => {
    if (!selectedOrder) return;
    setIsUpdatingStatus(true);
    try {
      const now = new Date().toISOString();
      await db.sale_orders.update(selectedOrder.id, {
        status: 'dispatched',
        transport_name: dispatchTransport.trim(),
        lr_number: dispatchLr.trim(),
        vehicle_number: dispatchVehicle.trim(),
        driver_phone: dispatchDriver.trim() || undefined,
        dispatched_at: now,
        updated_at: now,
      });

      const updatedSo = await db.sale_orders.get(selectedOrder.id);
      if (updatedSo) {
        await db.outbox.add({
          id: generateUUID(),
          entity: 'sale_orders',
          op: 'update',
          payload: updatedSo,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
        syncService.triggerSync();
      }

      // Also record in Transportation Registry
      const items = await db.sale_order_items.where('so_id').equals(selectedOrder.id).toArray();
      const totalBoxes = items.reduce((sum, it) => sum + (it.qty || 0), 0) || 15;
      const transportRecord: TransportEntry = {
        id: generateUUID(),
        lr_no: dispatchLr.trim() || `LR-${selectedOrder.so_no.slice(-4)}`,
        transport_name: dispatchTransport.trim() || 'VRL Logistics',
        vehicle_no: dispatchVehicle.trim() || undefined,
        driver_phone: dispatchDriver.trim() || undefined,
        dispatch_date: now.slice(0, 10),
        estimated_delivery_date: selectedOrder.delivery_due_date,
        destination: selectedOrder.destination || selectedOrder.customer_address?.split(',')[0] || 'Hosur',
        source_location: 'Hosur Godown (Jeermangalam)',
        so_id: selectedOrder.id,
        so_no: selectedOrder.so_no,
        client_id: selectedOrder.client_id,
        consignee_name: selectedOrder.customer_name,
        consignee_phone: selectedOrder.customer_phone,
        consignee_address: selectedOrder.customer_address,
        consignee_gstin: selectedOrder.customer_gstin,
        total_boxes: totalBoxes,
        total_weight_kg: Math.round(totalBoxes * 8.5),
        consignment_value: selectedOrder.total_amount,
        items_summary: items.map((i) => `${i.product_name} (${i.qty})`).slice(0, 3).join(', '),
        freight_type: 'to_pay',
        freight_amount: Math.round(totalBoxes * 65),
        loading_charges: Math.round(totalBoxes * 10),
        total_charges: Math.round(totalBoxes * 75),
        status: 'in_transit',
        dispatched_by: user?.full_name || 'Staff',
        created_by: user?.full_name || 'Staff',
        created_at: now,
        updated_at: now,
      };
      await db.transport_entries.put(transportRecord);
      await db.outbox.add({
        id: generateUUID(),
        entity: 'transport_entries',
        op: 'insert',
        payload: transportRecord,
        status: 'pending',
        attempts: 0,
        created_at: now,
      });

      toast(`Order ${selectedOrder.so_no} marked as DISPATCHED! Dispatch alert cleared.`, 'success');
      setIsDispatchModalOpen(false);
      loadData();
    } catch (err: any) {
      toast(err?.message || 'Error updating dispatch status', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleQuickStatusUpdate = async (orderId: string, newStatus: SaleOrderStatus) => {
    const now = new Date().toISOString();
    await db.sale_orders.update(orderId, {
      status: newStatus,
      updated_at: now,
    });
    const updatedSo = await db.sale_orders.get(orderId);
    if (updatedSo) {
      await db.outbox.add({
        id: generateUUID(),
        entity: 'sale_orders',
        op: 'update',
        payload: updatedSo,
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      syncService.triggerSync();
    }
    toast(`Order status updated to ${newStatus.toUpperCase()}`, 'info');
    loadData();
  };

  const handleOpenAssignModal = (order: SaleOrder) => {
    setAssigningOrder(order);
    const defaultDisp = dispatchers.find((d) => d.role === 'dispatcher');
    setSelectedDispatcherId(order.assigned_dispatcher_id || defaultDisp?.id || dispatchers[0]?.id || '');
    setAssignedDueDate(order.delivery_due_date || new Date().toISOString().slice(0, 10));
    setAssignedNotes(order.notes || '');
    setIsAssignModalOpen(true);
  };

  const handleSaveAssignment = async () => {
    if (!assigningOrder) return;
    if (!selectedDispatcherId) {
      toast('Please select a dispatch worker to assign this order to', 'error');
      return;
    }

    setIsSavingAssignment(true);
    try {
      const chosen = dispatchers.find((d) => d.id === selectedDispatcherId);
      const dispatcherName = chosen?.full_name || chosen?.email || 'Dispatcher';
      const now = new Date().toISOString();

      await db.sale_orders.update(assigningOrder.id, {
        assigned_dispatcher_id: selectedDispatcherId,
        assigned_dispatcher_name: dispatcherName,
        dispatch_assigned_at: now,
        delivery_due_date: assignedDueDate || assigningOrder.delivery_due_date,
        notes: assignedNotes.trim() || assigningOrder.notes,
        updated_at: now,
      });

      const updated = await db.sale_orders.get(assigningOrder.id);
      if (updated) {
        await db.outbox.add({
          id: generateUUID(),
          entity: 'sale_orders',
          op: 'update',
          payload: updated,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
        syncService.triggerSync();
      }

      // Record activity log
      await db.activity_logs.add({
        id: Date.now(),
        action: 'dispatch_assigned',
        entity: 'sale_orders',
        entity_id: assigningOrder.id,
        summary: `Sale Order ${assigningOrder.so_no} assigned to dispatcher ${dispatcherName} by ${user?.full_name || 'Manager'}`,
        created_at: now,
      });

      toast(`Sale Order ${assigningOrder.so_no} successfully assigned to ${dispatcherName}!`, 'success');
      setIsAssignModalOpen(false);
      loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to assign dispatcher', 'error');
    } finally {
      setIsSavingAssignment(false);
    }
  };

  // Dispatch Alerts Calculation
  const dispatchAlerts = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return orders.filter(
      (o) =>
        (o.status === 'pending' || o.status === 'confirmed' || o.status === 'packed') &&
        o.delivery_due_date &&
        o.delivery_due_date <= todayStr
    );
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 0. Company isolation filter
      const matchesCompany =
        isAllCompanies ||
        o.company_id === activeCompanyId ||
        (!o.company_id && activeCompanyId === DEFAULT_COMPANY_ID);
      if (!matchesCompany) return false;

      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          o.so_no.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          (o.customer_phone || '').includes(q) ||
          (o.lr_number || '').toLowerCase().includes(q) ||
          (o.transport_name || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-black text-text tracking-tight flex items-center gap-2">
            <Truck className="text-accent" size={24} />
            <span>Sale Orders & Dispatch Alerts</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Book wholesale customer orders, track parcel lorry transport (LR No), and manage dispatch status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/dispatch')}
            className="gap-1.5 font-bold border-accent/30 text-accent hover:bg-accent/10"
            title="Open dedicated packing & dispatch checklist workstation"
          >
            <ClipboardCheck size={15} />
            <span>Dispatch Workstation</span>
          </Button>

          <Button variant="primary" size="sm" onClick={handleOpenCreate} className="gap-1.5 font-bold">
            <Plus size={15} />
            <span>New Sale Order</span>
          </Button>
        </div>
      </div>

      {/* DISPATCH ALERTS BANNER (If any order is due today or overdue) */}
      {dispatchAlerts.length > 0 && (
        <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wide">
                DISPATCH ALERT: {dispatchAlerts.length} Orders Due for Transport Dispatch Today!
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Orders awaiting packing/dispatch: {dispatchAlerts.map((d) => d.so_no).join(', ')}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStatusFilter('pending')}
              className="text-xs font-bold border-amber-500/40 text-amber-700 dark:text-amber-300"
            >
              Filter Pending
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/dispatch')}
              className="text-xs font-bold gap-1 bg-amber-600 hover:bg-amber-700 text-white"
            >
              <ClipboardCheck size={13} />
              <span>Open Dispatch Hub</span>
            </Button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted uppercase">Total Orders</span>
          <div className="text-xl font-black text-text mt-1">{orders.length}</div>
          <span className="text-[10px] text-text-muted">All active bookings</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
            <Clock size={13} /> Pending / Packing
          </span>
          <div className="text-xl font-black text-amber-600 mt-1">
            {orders.filter((o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'packed').length}
          </div>
          <span className="text-[10px] text-text-muted">Awaiting transport</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-accent flex items-center gap-1">
            <Truck size={13} /> Dispatched (LR Out)
          </span>
          <div className="text-xl font-black text-accent mt-1">
            {orders.filter((o) => o.status === 'dispatched').length}
          </div>
          <span className="text-[10px] text-text-muted">In lorry transit</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-success flex items-center gap-1">
            <CheckCircle2 size={13} /> Delivered
          </span>
          <div className="text-xl font-black text-success mt-1">
            {orders.filter((o) => o.status === 'delivered').length}
          </div>
          <span className="text-[10px] text-text-muted">Order completed</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs col-span-2 md:col-span-1">
          <span className="text-[11px] font-semibold text-text-muted uppercase">Booking Value</span>
          <div className="text-base font-bold text-accent font-mono mt-1">
            {formatINR(orders.reduce((sum, o) => sum + (o.total_amount || 0), 0))}
          </div>
          <span className="text-[10px] text-text-muted">Total order revenue</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface border border-border rounded p-3 flex flex-wrap gap-2.5 items-center justify-between">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search by SO number, customer name, LR number, or transport..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs min-h-[38px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs min-h-[38px]"
          >
            <option value="all">All Order Statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="packed">Packed</option>
            <option value="dispatched">Dispatched</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </Select>

          {(searchQuery || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="text-danger hover:underline text-xs font-semibold px-2 flex items-center gap-1"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Sale Orders Table */}
      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          message="No sale orders found"
          actionLabel="Create First Sale Order"
          onAction={handleOpenCreate}
        />
      ) : (
        <div className="overflow-x-auto w-full border border-border rounded bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SO Number</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead>Transport / LR No</TableHead>
                <TableHead className="text-right">Order Amount (₹)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono font-bold text-accent">{o.so_no}</TableCell>
                  <TableCell className="text-xs text-text-muted whitespace-nowrap">
                    {new Date(o.order_date).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {o.delivery_due_date && (
                      <div className="text-[10px] text-amber-600 font-semibold">
                        Due: {new Date(o.delivery_due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-bold text-text text-sm">{o.customer_name}</div>
                    {o.customer_phone && <span className="text-[11px] text-text-muted">{o.customer_phone}</span>}
                    {o.assigned_dispatcher_name ? (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-accent">
                        <ClipboardCheck size={12} className="shrink-0" />
                        <span>Disp: {o.assigned_dispatcher_name}</span>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[10px] text-text-muted italic">
                        Unassigned
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      o.pricing_type === 'wholesale'
                        ? 'bg-accent/10 text-accent border border-accent/20'
                        : 'bg-surface text-text border border-border'
                    }`}>
                      {o.pricing_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {o.lr_number ? (
                      <div>
                        <span className="font-mono font-bold text-accent">LR: {o.lr_number}</span>
                        <div className="text-[10px] text-text-muted">{o.transport_name || 'Transport'}</div>
                      </div>
                    ) : (
                      <span className="text-text-muted text-[11px] italic">No LR assigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-sm text-text">
                    {formatINR(o.total_amount)}
                  </TableCell>
                  <TableCell>
                    {o.status === 'dispatched' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent/15 text-accent">
                        <Truck size={12} /> Dispatched
                      </span>
                    ) : o.status === 'delivered' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-success-light text-success">
                        <CheckCircle2 size={12} /> Delivered
                      </span>
                    ) : o.status === 'packed' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/15 text-blue-600">
                        <Package size={12} /> Packed
                      </span>
                    ) : o.status === 'cancelled' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger-light text-danger">
                        <XCircle size={12} /> Cancelled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600">
                        <Clock size={12} /> Pending
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => handleViewOrder(o)} className="gap-1 min-h-[30px] text-xs">
                        <Eye size={13} />
                        <span>View</span>
                      </Button>
                      {(o.status === 'pending' || o.status === 'confirmed' || o.status === 'packed') && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenAssignModal(o)}
                            className="gap-1 min-h-[30px] text-xs font-semibold text-accent border-accent/30 hover:bg-accent/10"
                            title="Assign to Dispatcher"
                          >
                            <ClipboardCheck size={13} />
                            <span>{o.assigned_dispatcher_name ? 'Reassign' : 'Assign'}</span>
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleOpenDispatchModal(o)}
                            className="gap-1 min-h-[30px] text-xs font-bold"
                            title="Assign lorry transport & LR number"
                          >
                            <Truck size={13} />
                            <span>Dispatch</span>
                          </Button>
                        </>
                      )}
                      {isAdmin && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDeleteOrder(o)}
                          className="p-1.5 h-[30px] w-[30px] text-text-muted hover:text-danger"
                          title="Delete Sale Order"
                        >
                          <Trash2 size={13} />
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

      {/* CREATE SALE ORDER MODAL */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={`New Sale Order: ${soNo}`}
        maxWidth="full"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Select Client / Dealer
              </label>
              <Select value={selectedClientId} onChange={(e) => handleClientSelect(e.target.value)}>
                <option value="">-- Choose from Directory --</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.company_name ? `(${c.company_name})` : ''} - {c.customer_tier || 'Client'}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Customer / Dealer Name <span className="text-danger">*</span>
              </label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Sri Balaji Fireworks"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Phone Number</label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 98421 23456"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Pricing Mode</label>
              <Select value={pricingType} onChange={(e) => setPricingType(e.target.value as PricingType)}>
                <option value="wholesale">Wholesale Pricing (Dealer)</option>
                <option value="retail">Retail Pricing (MRP)</option>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Order Date</label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Delivery Due Date</label>
              <Input type="date" value={deliveryDueDate} onChange={(e) => setDeliveryDueDate(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Customer GSTIN</label>
              <Input
                value={customerGstin}
                onChange={(e) => setCustomerGstin(e.target.value)}
                placeholder="33AAAAA0000A1Z5"
                className="font-mono uppercase"
              />
            </div>
          </div>

          {/* Transport / Logistics Fields (Critical for Crackers) */}
          <div className="bg-background border border-border rounded p-3 space-y-2">
            <span className="text-xs font-bold text-text uppercase flex items-center gap-1">
              <Truck size={14} className="text-accent" />
              <span>Logistics & Transport (Optional at booking)</span>
            </span>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <Input
                label="Transport / Parcel Service"
                placeholder="e.g. VRL / ABT / ARC Logistics"
                value={transportName}
                onChange={(e) => setTransportName(e.target.value)}
                className="text-xs"
              />
              <Input
                label="Destination Station / Town"
                placeholder="e.g. Salem / Chennai / Bangalore"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="text-xs"
              />
              <Input
                label="Lorry Receipt (LR) No."
                placeholder="e.g. LR-98421"
                value={lrNumber}
                onChange={(e) => setLrNumber(e.target.value)}
                className="text-xs font-mono"
              />
              <Input
                label="Vehicle Number"
                placeholder="TN 28 AB 1234"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className="text-xs font-mono uppercase"
              />
            </div>
          </div>

          {/* Line items table */}
          <div className="space-y-3 border border-border rounded p-3 bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-text uppercase flex items-center gap-1.5">
                <Package size={14} className="text-accent" />
                <span>
                  Ordered Cracker Items ({soItems.length} items •{' '}
                  {soItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0)} Total Boxes)
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
              pricingType={pricingType}
              addedItemsMap={soAddedItemsMap}
              onSelectProduct={handleAddProductDirectly}
              onAddCustomProduct={handleAddCustomProductDirectly}
              title="Cracker Catalog & Quick-Add"
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
                pricingType={pricingType}
                onSelectProduct={handleAddProductDirectly}
                onAddCustomProduct={handleAddCustomProductDirectly}
                placeholder="Type cracker name, code, brand (e.g. 1000 Wala, 50 Shots, Standard) to search and add..."
              />
            </div>

            {/* Full Visibility Ordered Items Table (no inner overflow squish trap) */}
            <div className="overflow-x-auto border border-border/80 rounded-lg bg-surface shadow-xs">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted text-left">
                    <th className="py-2.5 px-2 font-semibold">Product Description</th>
                    <th className="py-2.5 font-semibold w-16 text-center">Unit</th>
                    <th className="py-2.5 font-semibold text-right w-24">Qty (Boxes)</th>
                    <th className="py-2.5 font-semibold text-right w-24">Rate (₹)</th>
                    <th className="py-2.5 font-semibold text-right w-24">Total (₹)</th>
                    <th className="py-2.5 font-semibold text-center w-36 px-2">Stock Status</th>
                    <th className="py-2.5 text-right w-10 pr-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {soItems.map((item, idx) => {
                    const prod = item.product_id ? products.find((p) => p.id === item.product_id) : undefined;
                    const stock = prod ? (prod.stock ?? 0) : 0;
                    const minStock = prod ? (prod.min_stock ?? 20) : 20;
                    const isZeroStock = Boolean(prod && stock === 0);
                    const isShortage = Boolean(prod && item.qty > stock);
                    const isLowStock = Boolean(prod && stock > 0 && stock <= minStock);

                    return (
                      <tr key={idx} className="hover:bg-surface/50">
                        <td className="py-2 px-2">
                          {item.product_id ? (
                            <div className="flex items-center gap-1.5">
                              <SearchableProductSelect
                                products={products}
                                value={item.product_id}
                                pricingType={pricingType}
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
                                  placeholder="Enter non-existing / new cracker name..."
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
                            className={`w-20 text-right py-1 px-2 text-xs font-mono font-bold bg-surface border rounded ${
                              isZeroStock
                                ? 'border-red-500 ring-2 ring-red-400/60 bg-red-500/5'
                                : isShortage
                                ? 'border-amber-500 ring-2 ring-amber-400/60 bg-amber-500/5'
                                : 'border-border'
                            }`}
                          />
                        </td>
                        <td className="py-2 text-right pr-2 align-top pt-2">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={item.unit_price}
                            onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)}
                            className="w-24 text-right py-1 px-2 text-xs font-mono font-bold bg-surface border border-border rounded"
                          />
                        </td>
                        <td className="py-2 text-right font-mono font-bold text-accent align-top pt-3 pr-2">
                          {formatINR(item.line_total)}
                        </td>

                        {/* Dedicated Right-Side Stock Status Column with Blinking Alerts */}
                        <td className="py-2 px-2 text-center align-top pt-2.5">
                          {!item.product_id ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-surface border border-border text-text-muted">
                              Custom
                            </span>
                          ) : !prod ? (
                            <span className="text-text-muted text-xs font-mono">-</span>
                          ) : isZeroStock ? (
                            <div className="flex flex-col items-center justify-center space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-sm stock-blink-danger">
                                <AlertCircle size={11} className="shrink-0" />
                                0 Stock
                              </span>
                              <span className="text-[9px] font-bold text-red-600 uppercase tracking-tight stock-blink-danger">
                                Out of Stock
                              </span>
                            </div>
                          ) : isShortage ? (
                            <div className="flex flex-col items-center justify-center space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-white shadow-sm stock-blink-warning">
                                <AlertTriangle size={11} className="shrink-0" />
                                Avl: {stock}
                              </span>
                              <span className="text-[9px] font-black text-red-600 uppercase tracking-tight stock-blink-danger">
                                Short: -{item.qty - stock}
                              </span>
                            </div>
                          ) : isLowStock ? (
                            <div className="flex flex-col items-center justify-center space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/15 border border-amber-500/50 text-amber-700 dark:text-amber-300 stock-blink-warning">
                                <AlertTriangle size={11} className="shrink-0" />
                                {stock} {item.unit}
                              </span>
                              <span className="text-[9px] font-bold text-amber-600 stock-blink-warning">
                                Low Stock
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center space-y-0.5">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-mono">
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                                </span>
                                {stock} {item.unit}
                              </span>
                              <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                                In Stock
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="py-2 text-right align-top pt-2.5 pr-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            disabled={soItems.length <= 1}
                            className="text-text-muted hover:text-danger disabled:opacity-20 p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Brand-Wise Discounts Section */}
            <BrandDiscountsSection
              items={soItems}
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
                  <span className="text-text-muted">Gross Order Value:</span>
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
                <span className="text-text-muted font-bold">Net Total Order Value ({pricingType}):</span>
                <span className="text-accent text-lg font-black font-mono">{formatINR(brandDiscountTotals.netTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveSo} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Confirm Sale Order'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ASSIGN TO DISPATCHER MODAL */}
      {assigningOrder && (
        <Dialog
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          title={`Assign Dispatcher: ${assigningOrder.so_no}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-accent/5 border border-accent/20 rounded">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] uppercase font-bold text-accent tracking-wider">Sale Order Details</span>
                  <div className="font-bold text-sm text-text">{assigningOrder.customer_name}</div>
                  <div className="text-xs text-text-muted">Total Amount: {formatINR(assigningOrder.total_amount)}</div>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-surface border border-border">
                  {assigningOrder.so_no}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Select Dispatch Worker / In-Charge <span className="text-danger">*</span>
                </label>
                <Select
                  value={selectedDispatcherId}
                  onChange={(e) => setSelectedDispatcherId(e.target.value)}
                  className="text-xs font-medium"
                >
                  <option value="">-- Choose Dispatcher --</option>
                  {dispatchers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name} ({d.role.toUpperCase()}) - {d.email}
                    </option>
                  ))}
                </Select>
                <p className="text-[11px] text-text-muted mt-1">
                  Assigned worker will receive this order in their Dispatch Workstation checklist to verify items before lorry dispatch.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Target Dispatch / Delivery Due Date</label>
                <Input
                  type="date"
                  value={assignedDueDate}
                  onChange={(e) => setAssignedDueDate(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Packing Instructions / Dispatch Notes</label>
                <textarea
                  value={assignedNotes}
                  onChange={(e) => setAssignedNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Ensure double carton packing for Sivakasi Sparklers; include transport label for Salem Parcel..."
                  className="w-full text-xs p-2.5 rounded border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setIsAssignModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveAssignment}
                disabled={isSavingAssignment || !selectedDispatcherId}
                className="gap-1.5 font-bold"
              >
                <ClipboardCheck size={14} />
                <span>{isSavingAssignment ? 'Assigning...' : 'Assign & Send to Dispatch Workstation'}</span>
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* DISPATCH ACTION MODAL */}
      {selectedOrder && (
        <Dialog
          isOpen={isDispatchModalOpen}
          onClose={() => setIsDispatchModalOpen(false)}
          title={`Dispatch Order: ${selectedOrder.so_no}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-text-muted">
              Enter parcel transport and Lorry Receipt (LR) details for customer{' '}
              <strong className="text-text">{selectedOrder.customer_name}</strong>.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Transporter / Parcel Service <span className="text-danger">*</span>
                </label>
                <Input
                  value={dispatchTransport}
                  onChange={(e) => setDispatchTransport(e.target.value)}
                  placeholder="e.g. VRL Logistics / ABT Parcel"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Lorry Receipt (LR) / Bilty Number <span className="text-danger">*</span>
                </label>
                <Input
                  value={dispatchLr}
                  onChange={(e) => setDispatchLr(e.target.value)}
                  placeholder="e.g. 7842910"
                  className="font-mono font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Lorry / Vehicle Number</label>
                  <Input
                    value={dispatchVehicle}
                    onChange={(e) => setDispatchVehicle(e.target.value)}
                    placeholder="TN 28 AB 1234"
                    className="font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Driver Contact Phone</label>
                  <Input
                    value={dispatchDriver}
                    onChange={(e) => setDispatchDriver(e.target.value)}
                    placeholder="e.g. 94431 12345"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setIsDispatchModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmDispatch}
                disabled={isUpdatingStatus || !dispatchTransport.trim() || !dispatchLr.trim()}
              >
                {isUpdatingStatus ? 'Dispatching...' : 'Confirm Dispatch & Clear Alert'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* VIEW & PRINT SALE ORDER / DELIVERY CHALLAN MODAL */}
      {selectedOrder && (() => {
        const docCompany = (selectedOrder.company_id && companies.find((c) => c.id === selectedOrder.company_id)) || activeCompany;

        return (
        <Dialog
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          title={`${printDocType === 'challan' ? 'Delivery Challan' : 'Sale Order'}: ${selectedOrder.so_no}`}
          maxWidth="full"
        >
          <div className="space-y-4">
            {/* Header Switcher & Printer Options (Hidden when printing) */}
            <div className="flex flex-wrap justify-between items-center gap-2 pb-2.5 border-b border-border no-print bg-surface p-2.5 rounded">
              <div className="flex flex-wrap items-center gap-2">
                {/* Document Type Switcher */}
                <div className="flex rounded border border-border p-0.5 bg-background text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setPrintDocType('order')}
                    className={`px-3 py-1 rounded transition-colors ${
                      printDocType === 'order' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    Sale Order Form
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedOrder.status !== 'dispatched' && selectedOrder.status !== 'delivered') {
                        toast(
                          'Delivery Challan is locked until cracker items are verified and marked as dispatched by the dispatcher.',
                          'warning'
                        );
                        return;
                      }
                      setPrintDocType('challan');
                    }}
                    className={`px-3 py-1 rounded transition-colors flex items-center gap-1.5 ${
                      printDocType === 'challan' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                    title={
                      selectedOrder.status !== 'dispatched' && selectedOrder.status !== 'delivered'
                        ? 'Locked until dispatched by dispatcher'
                        : 'View official Delivery Challan'
                    }
                  >
                    {selectedOrder.status !== 'dispatched' && selectedOrder.status !== 'delivered' && (
                      <Lock size={12} className="text-amber-500" />
                    )}
                    <span>Delivery Challan (LR Copy)</span>
                  </button>
                </div>

                {/* Document Copy Selectors */}
                <div className="flex rounded border border-border p-0.5 bg-background text-xs font-semibold">
                  {(['original', 'duplicate', 'triplicate'] as const).map((cp) => (
                    <button
                      key={cp}
                      type="button"
                      onClick={() => setPrintCopy(cp)}
                      className={`px-2.5 py-1 rounded capitalize transition-colors ${
                        printCopy === cp ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                      }`}
                    >
                      {cp === 'original' && 'Original (Buyer)'}
                      {cp === 'duplicate' && 'Duplicate (Lorry)'}
                      {cp === 'triplicate' && 'Triplicate (Office)'}
                    </button>
                  ))}
                </div>

                {(selectedOrder.status === 'pending' || selectedOrder.status === 'confirmed' || selectedOrder.status === 'packed') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsViewModalOpen(false);
                      handleOpenAssignModal(selectedOrder);
                    }}
                    className="gap-1.5 font-bold text-accent border-accent/30 hover:bg-accent/10"
                    title="Assign or change dispatch worker"
                  >
                    <ClipboardCheck size={14} />
                    <span>
                      {selectedOrder.assigned_dispatcher_name
                        ? `Disp: ${selectedOrder.assigned_dispatcher_name}`
                        : 'Assign Dispatcher'}
                    </span>
                  </Button>
                )}

                <span className="text-[11px] font-bold text-accent px-2 py-0.5 rounded bg-accent/10 border border-accent/20 flex items-center gap-1">
                  <FileText size={12} />
                  <span>Standard A4 Sheet Format</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrintSo}
                  disabled={isPrinting}
                  className="gap-1.5 font-bold shadow-xs"
                >
                  <Printer size={15} />
                  <span>{isPrinting ? 'Printing...' : `Print A4 ${printDocType === 'challan' ? 'Challan' : 'Order'}`}</span>
                </Button>
              </div>
            </div>

            {/* A4 PRINTABLE DOCUMENT CONTAINER */}
            <div id="sale-order-print-area" className="printable-area">
              <div className="p-6 bg-white text-gray-900 border-2 border-gray-800 rounded-sm shadow-xs space-y-4 print:p-0 print:border-none print:shadow-none text-xs font-sans max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-3">
                  <div>
                    <VnaLogo size="md" />
                    <div className="font-extrabold text-base uppercase text-gray-900 mt-1">
                      {docCompany?.name || 'VNA TRADERS'}
                    </div>
                    <div className="text-[11px] text-gray-600 leading-tight">
                      {docCompany?.trade_name || 'Wholesale & Retail Fireworks Merchant'}<br />
                      {docCompany?.address ? `${docCompany.address}, ${docCompany.city || 'Hosur'}${docCompany.pincode ? ` - ${docCompany.pincode}` : ''}` : 'Jeermangalam, Hosur, Tamil Nadu - 635109'}<br />
                      Phone: {docCompany?.phone || '+91 94431 23456'}<br />
                      <strong>GSTIN: {docCompany?.gstin || '33ACSPV5299F1Z5'}</strong> • State Code: {docCompany?.state_code || '33'} ({docCompany?.state || 'Tamil Nadu'})
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-800 font-bold text-xs uppercase tracking-wider inline-block">
                      {printDocType === 'challan' ? 'DELIVERY CHALLAN / GOODS DISPATCH SLIP' : 'SALE ORDER CONFIRMATION'}
                    </span>
                    <div className="text-[10px] text-gray-600 font-bold uppercase mt-1">
                      {printCopy === 'original' && 'ORIGINAL FOR CONSIGNEE'}
                      {printCopy === 'duplicate' && 'DUPLICATE FOR TRANSPORTER (LORRY COPY)'}
                      {printCopy === 'triplicate' && 'TRIPLICATE FOR OFFICE RECORD'}
                    </div>
                    <div className="text-lg font-black font-mono text-gray-900 mt-1">
                      {selectedOrder.so_no}
                    </div>
                    <div className="text-xs text-gray-600">
                      Booking Date: <strong>{formatDateDMY(selectedOrder.order_date)}</strong>
                    </div>
                    {selectedOrder.delivery_due_date && (
                      <div className="text-xs text-gray-600">
                        Dispatch Due: <strong>{formatDateDMY(selectedOrder.delivery_due_date)}</strong>
                      </div>
                    )}
                    <div className="text-xs text-gray-600 mt-0.5">
                      Pricing Mode: <strong className="uppercase font-bold text-gray-900">{selectedOrder.pricing_type} Rate</strong>
                    </div>
                  </div>
                </div>

                {/* Consignee & Transport Grid */}
                <div className="grid grid-cols-2 gap-4 border border-gray-300 p-3 rounded text-xs bg-gray-50/50">
                  <div>
                    <span className="text-gray-500 font-bold uppercase text-[10px] block">Details of Consignee / Buyer:</span>
                    <div className="font-extrabold text-sm text-gray-900 mt-0.5">{selectedOrder.customer_name}</div>
                    {selectedOrder.customer_phone && <div className="text-gray-700">Phone: <strong>{selectedOrder.customer_phone}</strong></div>}
                    {selectedOrder.customer_address && <div className="text-gray-700 mt-0.5">Address: {selectedOrder.customer_address}</div>}
                    {selectedOrder.customer_gstin ? (
                      <div className="font-mono font-bold text-gray-900 mt-1">
                        GSTIN: {selectedOrder.customer_gstin}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic mt-0.5">Unregistered Dealer / Retail Customer</div>
                    )}
                  </div>

                  <div className="border-l border-gray-300 pl-3 space-y-1">
                    <span className="text-gray-500 font-bold uppercase text-[10px] block">Transport &amp; Dispatch Logistics (Lorry Bilty):</span>
                    <div>Transporter: <strong>{selectedOrder.transport_name || 'Direct Parcel / Lorry Booking'}</strong></div>
                    {selectedOrder.lr_number && (
                      <div className="font-mono text-gray-900">
                        LR / Bilty No: <strong className="text-sm font-black">{selectedOrder.lr_number}</strong>
                      </div>
                    )}
                    {selectedOrder.vehicle_number && (
                      <div className="font-mono">
                        Vehicle No: <strong>{selectedOrder.vehicle_number}</strong>
                      </div>
                    )}
                    {selectedOrder.destination && (
                      <div>
                        Destination Station: <strong>{selectedOrder.destination}</strong>
                      </div>
                    )}
                    <div className="pt-0.5">
                      Dispatch Status: <strong className="uppercase font-extrabold text-gray-900">{selectedOrder.status}</strong>
                    </div>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="border border-gray-300 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b border-gray-300 font-bold text-gray-700">
                      <tr>
                        <th className="p-2 text-left w-8">#</th>
                        <th className="p-2 text-left">Cracker Item Description</th>
                        <th className="p-2 text-left w-24">Brand</th>
                        <th className="p-2 text-center w-16">HSN</th>
                        <th className="p-2 text-right w-24">Quantity</th>
                        {printDocType === 'order' && <th className="p-2 text-right w-24">Rate (₹)</th>}
                        {printDocType === 'order' && <th className="p-2 text-right w-28">Amount (₹)</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedOrderItems.map((it, idx) => (
                        <tr key={it.id}>
                          <td className="p-2 text-gray-500">{idx + 1}</td>
                          <td className="p-2 font-bold text-gray-900">{it.product_name}</td>
                          <td className="p-2 text-gray-600">{it.brand || 'Standard'}</td>
                          <td className="p-2 text-center font-mono text-gray-600">3604</td>
                          <td className="p-2 text-right font-mono font-bold text-gray-900">
                            {it.qty} {it.unit}
                          </td>
                          {printDocType === 'order' && (
                            <td className="p-2 text-right font-mono text-gray-800">{formatINR(it.unit_price)}</td>
                          )}
                          {printDocType === 'order' && (
                            <td className="p-2 text-right font-mono font-bold text-gray-900">
                              {formatINR(it.line_total)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300 text-gray-900">
                      <tr>
                        <td colSpan={4} className="p-2 text-right uppercase text-[11px]">
                          Total Parcel Quantity:
                        </td>
                        <td className="p-2 text-right font-mono font-extrabold text-xs">
                          {selectedOrderItems.reduce((acc, i) => acc + (i.qty || 0), 0)} Boxes
                        </td>
                        {printDocType === 'order' && (
                          <td colSpan={2} className="p-2 text-right">
                            <div className="space-y-1">
                              {selectedOrder.discount_amount > 0 && (
                                <div className="flex justify-between text-xs font-semibold text-gray-600">
                                  <span>Gross Subtotal:</span>
                                  <span className="font-mono">{formatINR(selectedOrder.subtotal)}</span>
                                </div>
                              )}
                              {selectedOrder.discount_amount > 0 && (
                                <div className="flex justify-between text-xs font-bold text-red-600">
                                  <span>Brand Discount ({selectedOrder.discount_percent || 0}%):</span>
                                  <span className="font-mono">- {formatINR(selectedOrder.discount_amount)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm font-black text-gray-900 pt-0.5 border-t border-gray-300">
                                <span>Total Order Value:</span>
                                <span className="font-mono">{formatINR(selectedOrder.total_amount)}</span>
                              </div>
                            </div>
                          </td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Words, Notes & Bank Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {printDocType === 'order' && (
                      <div className="p-2.5 bg-gray-50 border border-gray-300 rounded text-xs">
                        <span className="text-gray-500 text-[10px] uppercase font-bold block">Total Amount In Words:</span>
                        <div className="font-bold text-gray-900 mt-0.5 leading-snug">
                          {numberToWordsINR(selectedOrder.total_amount)}
                        </div>
                      </div>
                    )}
                    {selectedOrder.notes && (
                      <div className="p-2 bg-gray-50 border border-gray-300 rounded text-xs">
                        <span className="text-gray-500 text-[10px] uppercase font-bold block">Special Dispatch Notes:</span>
                        <div className="text-gray-800 mt-0.5">{selectedOrder.notes}</div>
                      </div>
                    )}
                  </div>

                  <div className="p-2.5 bg-gray-50 border border-gray-300 rounded text-[11px] leading-tight space-y-1">
                    <span className="font-bold text-gray-800 uppercase block">Bank Payment Details (RTGS / NEFT / IMPS):</span>
                    <div>Bank Name: <strong>{docCompany?.bank_name || 'State Bank of India (SBI)'}</strong></div>
                    <div>Account Name: <strong>{docCompany?.name || 'VNA TRADERS'}</strong></div>
                    <div>Account Number: <strong className="font-mono font-bold">{docCompany?.bank_account_no || '3948201004521'}</strong></div>
                    <div>IFSC Code: <strong className="font-mono font-bold">{docCompany?.bank_ifsc || 'SBIN0001234'}</strong> ({docCompany?.bank_branch || 'Hosur Branch'})</div>
                    {docCompany?.upi_id && <div>UPI ID: <strong className="font-mono">{docCompany.upi_id}</strong></div>}
                  </div>
                </div>

                {/* Declarations & Bottom Signatures */}
                <div className="pt-3 border-t border-gray-300 space-y-4 avoid-break">
                  <div className="text-[10px] text-gray-500 space-y-0.5 leading-tight">
                    <span className="font-bold text-gray-700 uppercase">Terms &amp; Dispatch Conditions:</span>
                    <p>1. Goods once dispatched under Lorry Receipt (LR) travel strictly at consignee's risk.</p>
                    <p>2. Fireworks must be transported only in authorized commercial vehicles complying with PESO safety norms.</p>
                    <p>3. Any package leakage, damage, or discrepancy must be endorsed on the transporter LR copy upon delivery.</p>
                    <p>4. All disputes are subject to Hosur jurisdiction only.</p>
                  </div>

                  {/* 3 SIGNATURES AT THE VERY BOTTOM */}
                  <div className="grid grid-cols-3 gap-6 pt-6">
                    <div className="text-center">
                      <div className="h-14 flex items-end justify-center text-gray-400 italic text-[11px]">
                        [Consignee Rubber Stamp]
                      </div>
                      <div className="border-t border-gray-800 pt-1">
                        <div className="font-bold text-gray-900 text-xs">Receiver's Signature</div>
                        <div className="text-[10px] text-gray-500">Consignee Acknowledgment</div>
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="h-14 flex items-end justify-center text-gray-400 italic text-[11px]">
                        [Vehicle / LR Endorsement]
                      </div>
                      <div className="border-t border-gray-800 pt-1">
                        <div className="font-bold text-gray-900 text-xs">Transporter / Driver Sign</div>
                        <div className="text-[10px] text-gray-500">Goods Handed Over in Good Order</div>
                      </div>
                    </div>

                    <div className="text-center">
                      <div className="h-14 flex items-end justify-center text-gray-400 italic text-[11px]">
                        For <strong>{docCompany?.name || 'VNA TRADERS'}</strong>
                      </div>
                      <div className="border-t border-gray-800 pt-1">
                        <div className="font-bold text-gray-900 text-xs">Authorized Signatory</div>
                        <div className="text-[10px] text-gray-500">{docCompany?.city || 'Hosur'} Depot Dispatch Office</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-border no-print">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted font-medium">Quick Status:</span>
                {(['pending', 'confirmed', 'packed', 'delivered'] as SaleOrderStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleQuickStatusUpdate(selectedOrder.id, st)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold capitalize transition-colors ${
                      selectedOrder.status === st
                        ? 'bg-accent text-white'
                        : 'bg-surface text-text hover:bg-border/60'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <Button variant="secondary" size="sm" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
        );
      })()}

      {/* QUICK CREATE PRODUCT MODAL */}
      <QuickProductModal
        isOpen={isQuickProductOpen}
        onClose={() => setIsQuickProductOpen(false)}
        pricingType={pricingType}
        defaultQty={10}
        title="Add New / Non-Existing Product to Catalog"
        onAddProduct={(item) => {
          const price =
            pricingType === 'wholesale'
              ? item.wholesalePrice || item.retailPrice || 0
              : item.retailPrice || item.wholesalePrice || 0;

          setSoItems((prev) => [
            ...prev,
            {
              product_id: item.productId || '',
              product_code: item.productCode || '',
              product_name: item.productName,
              brand: item.brand,
              unit: item.unit,
              qty: item.qty,
              unit_price: price,
              line_total: Math.round(item.qty * price * 100) / 100,
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
