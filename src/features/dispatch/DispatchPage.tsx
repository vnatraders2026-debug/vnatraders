import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/db';
import { SaleOrder, SaleOrderItem, TransportEntry } from '@/types';
import { formatINR, formatDateDMY } from '@/lib/format';
import { generateUUID } from '@/lib/uuid';
import { syncService } from '@/sync/syncService';
import { printFormattedElement } from '@/lib/printer/printService';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import { VnaLogo } from '@/components/VnaLogo';
import {
  Truck,
  CheckCircle2,
  Clock,
  Printer,
  FileText,
  Search,
  CheckSquare,
  Square,
  Lock,
  Unlock,
  Package,
  CheckCheck,
  Phone,
  MapPin,
  Calendar,
} from 'lucide-react';

const COMMON_TRANSPORTERS = [
  'VRL Logistics',
  'ARC (Associated Road Carriers)',
  'ABT Parcel Service',
  'SRS Logistics',
  'KPN Parcel Service',
  'Thirumalai Transport',
  'Direct Private Lorry',
  'Auto / Tempo Delivery',
  'Customer Self Pickup',
  '__custom__',
];

export const DispatchPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [orderItemsMap, setOrderItemsMap] = useState<Record<string, SaleOrderItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'dispatched'>('pending');
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'mine'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Verification modal state
  const [selectedOrder, setSelectedOrder] = useState<SaleOrder | null>(null);
  const [selectedItems, setSelectedItems] = useState<SaleOrderItem[]>([]);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [checkedItemIds, setCheckedItemIds] = useState<Set<string>>(new Set());

  // Dispatch Logistics form state
  const [transporter, setTransporter] = useState('VRL Logistics');
  const [customTransporter, setCustomTransporter] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [destination, setDestination] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);

  // Delivery Challan modal state (only accessible once dispatched)
  const [challanOrder, setChallanOrder] = useState<SaleOrder | null>(null);
  const [challanItems, setChallanItems] = useState<SaleOrderItem[]>([]);
  const [isChallanModalOpen, setIsChallanModalOpen] = useState(false);
  const [printCopy, setPrintCopy] = useState<'original' | 'duplicate' | 'triplicate'>('original');
  const [isPrinting, setIsPrinting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const allOrders = await db.sale_orders.reverse().sortBy('created_at');
      setOrders(allOrders);

      // Fetch items for pending and dispatched orders
      const allItems = await db.sale_order_items.toArray();
      const map: Record<string, SaleOrderItem[]> = {};
      allItems.forEach((it) => {
        if (!map[it.so_id]) map[it.so_id] = [];
        map[it.so_id].push(it);
      });
      setOrderItemsMap(map);
    } catch (err: any) {
      toast(err?.message || 'Failed to load dispatch queue', 'error');
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

  // Filter pending vs dispatched orders
  const pendingOrders = useMemo(() => {
    return orders.filter(
      (o) => o.status === 'pending' || o.status === 'confirmed' || o.status === 'packed'
    );
  }, [orders]);

  const dispatchedOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'dispatched' || o.status === 'delivered');
  }, [orders]);

  // Tab and assignee filtered orders
  const filteredOrders = useMemo(() => {
    let base = activeTab === 'pending' ? pendingOrders : dispatchedOrders;
    if (assigneeFilter === 'mine' && user) {
      base = base.filter(
        (o) =>
          o.assigned_dispatcher_id === user.id ||
          (o.assigned_dispatcher_name && user.full_name && o.assigned_dispatcher_name.toLowerCase().includes(user.full_name.toLowerCase()))
      );
    }
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase().trim();
    return base.filter((o) => {
      const matchesNo = o.so_no.toLowerCase().includes(q);
      const matchesCust = o.customer_name.toLowerCase().includes(q);
      const matchesPhone = (o.customer_phone || '').includes(q);
      const matchesLr = (o.lr_number || '').toLowerCase().includes(q);
      const matchesTrans = (o.transport_name || '').toLowerCase().includes(q);
      const matchesDest = (o.destination || '').toLowerCase().includes(q);
      const matchesDisp = (o.assigned_dispatcher_name || '').toLowerCase().includes(q);
      return matchesNo || matchesCust || matchesPhone || matchesLr || matchesTrans || matchesDest || matchesDisp;
    });
  }, [activeTab, pendingOrders, dispatchedOrders, searchQuery, assigneeFilter, user]);

  // Open Verification Modal
  const handleOpenVerifyModal = async (order: SaleOrder) => {
    setSelectedOrder(order);
    const items = orderItemsMap[order.id] || (await db.sale_order_items.where('so_id').equals(order.id).toArray());
    setSelectedItems(items);

    // Pre-populate already verified items if any
    const initialChecked = new Set<string>(order.verified_items || []);
    setCheckedItemIds(initialChecked);

    // Pre-populate logistics details
    const existingTrans = order.transport_name || 'VRL Logistics';
    if (COMMON_TRANSPORTERS.includes(existingTrans)) {
      setTransporter(existingTrans);
      setCustomTransporter('');
    } else if (existingTrans) {
      setTransporter('__custom__');
      setCustomTransporter(existingTrans);
    } else {
      setTransporter('VRL Logistics');
      setCustomTransporter('');
    }

    setLrNumber(order.lr_number || '');
    setVehicleNumber(order.vehicle_number || '');
    setDriverPhone(order.driver_phone || '');
    setDestination(order.destination || order.customer_address?.split(',')[0] || 'Hosur');
    setDispatchNotes('');
    setIsVerifyModalOpen(true);
  };

  // Toggle single item checkbox
  const handleToggleItemCheck = (itemId: string) => {
    setCheckedItemIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(itemId)) {
        updated.delete(itemId);
      } else {
        updated.add(itemId);
      }
      return updated;
    });
  };

  // Toggle select/verify all
  const handleToggleAllItems = () => {
    if (checkedItemIds.size === selectedItems.length) {
      setCheckedItemIds(new Set());
    } else {
      setCheckedItemIds(new Set(selectedItems.map((it) => it.id)));
    }
  };

  const isChecklistComplete = selectedItems.length > 0 && checkedItemIds.size === selectedItems.length;

  // Confirm Dispatch
  const handleConfirmDispatch = async () => {
    if (!selectedOrder) return;

    if (!isChecklistComplete) {
      toast('Please verify and check all cracker items before marking as dispatched.', 'error');
      return;
    }

    const finalTransporter = transporter === '__custom__' ? customTransporter.trim() || 'Direct Lorry' : transporter;

    setIsSubmittingDispatch(true);
    try {
      const now = new Date().toISOString();
      const verifiedList = Array.from(checkedItemIds);
      const dispatcherName = user?.full_name || 'Dispatcher';

      const updatedOrder: SaleOrder = {
        ...selectedOrder,
        status: 'dispatched',
        transport_name: finalTransporter,
        lr_number: lrNumber.trim() || undefined,
        vehicle_number: vehicleNumber.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        destination: destination.trim() || undefined,
        dispatched_at: now,
        dispatched_by: dispatcherName,
        verified_items: verifiedList,
        notes: dispatchNotes.trim()
          ? `${selectedOrder.notes || ''}\n[Dispatch Note by ${dispatcherName}: ${dispatchNotes.trim()}]`.trim()
          : selectedOrder.notes,
        updated_at: now,
      };

      await db.sale_orders.put(updatedOrder);

      // Register or update in Transportation Registry
      const totalBoxes = selectedItems.reduce((sum, it) => sum + (it.qty || 0), 0) || 15;
      const transportRecord: TransportEntry = {
        id: generateUUID(),
        lr_no: lrNumber.trim() || `LR-${selectedOrder.so_no.slice(-4)}`,
        transport_name: finalTransporter,
        vehicle_no: vehicleNumber.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        dispatch_date: now.slice(0, 10),
        estimated_delivery_date: selectedOrder.delivery_due_date,
        destination: destination.trim() || 'Tamil Nadu',
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
        items_summary: selectedItems.map((i) => `${i.product_name} (${i.qty})`).slice(0, 3).join(', '),
        freight_type: 'to_pay',
        freight_amount: Math.round(totalBoxes * 65),
        loading_charges: Math.round(totalBoxes * 10),
        total_charges: Math.round(totalBoxes * 75),
        status: 'in_transit',
        dispatched_by: dispatcherName,
        created_by: user?.full_name || 'Dispatcher',
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

      // Audit log
      await db.activity_logs.add({
        id: Date.now(),
        action: 'dispatch_verified',
        entity: 'sale_orders',
        entity_id: selectedOrder.id,
        summary: `Sale Order ${selectedOrder.so_no} items verified and marked DISPATCHED by ${dispatcherName}`,
        created_at: now,
      });

      // Cloud outbox sync
      await db.outbox.add({
        id: generateUUID(),
        entity: 'sale_orders',
        op: 'update',
        payload: updatedOrder,
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      syncService.triggerSync();

      toast(
        `Order ${selectedOrder.so_no} successfully verified and marked as DISPATCHED! Delivery Challan is now unlocked.`,
        'success'
      );

      setIsVerifyModalOpen(false);
      await loadData();

      // Automatically open the unlocked Delivery Challan
      setChallanOrder(updatedOrder);
      setChallanItems(selectedItems);
      setIsChallanModalOpen(true);
    } catch (err: any) {
      toast(err?.message || 'Failed to complete dispatch verification', 'error');
    } finally {
      setIsSubmittingDispatch(false);
    }
  };

  // Open Delivery Challan Modal (LOCKED until order is dispatched)
  const handleOpenChallanModal = async (order: SaleOrder) => {
    if (order.status !== 'dispatched' && order.status !== 'delivered') {
      toast('Delivery Challan is locked until items are physically verified and marked as dispatched.', 'warning');
      return;
    }
    setChallanOrder(order);
    const items = orderItemsMap[order.id] || (await db.sale_order_items.where('so_id').equals(order.id).toArray());
    setChallanItems(items);
    setPrintCopy('original');
    setIsChallanModalOpen(true);
  };

  // Print A4 Delivery Challan
  const handlePrintChallan = async () => {
    if (!challanOrder) return;
    setIsPrinting(true);
    try {
      await printFormattedElement('delivery-challan-print-area', {
        paperSize: 'a4',
        title: `Delivery_Challan_${challanOrder.so_no}`,
      });
    } catch (err: any) {
      toast(`Print notice: ${err?.message || 'Print error'}`, 'warning');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Worker Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
        <div>
          <h1 className="text-xl font-black text-text tracking-tight flex items-center gap-2">
            <Truck className="text-accent" size={24} />
            <span>Dispatch &amp; Packing Workstation</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Verify cracker items against packing checklist, assign transport details, and generate official Delivery Challans.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="px-2.5 py-1 rounded bg-accent/10 border border-accent/20 text-accent font-bold text-xs flex items-center gap-1.5">
            <CheckCheck size={14} />
            <span>Dispatcher: {user?.full_name || 'Dispatch Team'}</span>
          </span>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
            <Clock size={13} /> Awaiting Verification
          </span>
          <div className="text-2xl font-black text-amber-600 mt-1">{pendingOrders.length}</div>
          <span className="text-[10px] text-text-muted">Orders ready for packing check</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-accent flex items-center gap-1">
            <Truck size={13} /> Dispatched Today
          </span>
          <div className="text-2xl font-black text-accent mt-1">
            {
              dispatchedOrders.filter(
                (o) => o.dispatched_at && o.dispatched_at.slice(0, 10) === new Date().toISOString().slice(0, 10)
              ).length
            }
          </div>
          <span className="text-[10px] text-text-muted">Challans generated today</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-success flex items-center gap-1">
            <CheckCircle2 size={13} /> Total Completed
          </span>
          <div className="text-2xl font-black text-success mt-1">{dispatchedOrders.length}</div>
          <span className="text-[10px] text-text-muted">Dispatched consignments</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted uppercase">My Active Pool</span>
          <div className="text-2xl font-black text-text mt-1">
            {
              pendingOrders.filter(
                (o) => !o.assigned_dispatcher_id || o.assigned_dispatcher_id === user?.id
              ).length
            }
          </div>
          <span className="text-[10px] text-text-muted">Assigned to my station</span>
        </div>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-border rounded p-3">
        {/* Tab Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-border p-1 bg-background text-xs font-semibold gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'bg-accent text-white shadow-xs font-bold'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              <Clock size={13} />
              <span>To Verify &amp; Dispatch ({pendingOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dispatched')}
              className={`px-3 py-1.5 rounded transition-colors flex items-center gap-1.5 ${
                activeTab === 'dispatched'
                  ? 'bg-accent text-white shadow-xs font-bold'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              <CheckCheck size={13} />
              <span>Dispatched History ({dispatchedOrders.length})</span>
            </button>
          </div>

          {/* Assignment Filter Switcher */}
          <div className="flex items-center gap-1.5 text-xs">
            <div className="flex rounded border border-border p-0.5 bg-background font-semibold">
              <button
                type="button"
                onClick={() => setAssigneeFilter('all')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  assigneeFilter === 'all'
                    ? 'bg-accent text-white shadow-xs font-bold'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                All Orders
              </button>
              <button
                type="button"
                onClick={() => setAssigneeFilter('mine')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  assigneeFilter === 'mine'
                    ? 'bg-accent text-white shadow-xs font-bold'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                Assigned to Me
              </button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search by SO No, Customer, LR No, Transporter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs min-h-[38px]"
          />
        </div>
      </div>

      {/* Queue Table */}
      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          message={
            activeTab === 'pending'
              ? 'No pending sale orders in the dispatch queue.'
              : 'No dispatched order records found.'
          }
        />
      ) : (
        <div className="overflow-x-auto w-full border border-border rounded bg-surface shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SO Number</TableHead>
                <TableHead>Consignee / Customer</TableHead>
                <TableHead>Destination &amp; Due Date</TableHead>
                <TableHead>Assigned Dispatcher</TableHead>
                <TableHead>Items / Cracker Qty</TableHead>
                <TableHead>Dispatch Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => {
                const items = orderItemsMap[order.id] || [];
                const totalQty = items.reduce((sum, it) => sum + (it.qty || 0), 0);
                const verifiedCount = order.verified_items ? order.verified_items.length : 0;
                const isDispatched = order.status === 'dispatched' || order.status === 'delivered';
                const isAssignedToMe = order.assigned_dispatcher_id === user?.id;

                return (
                  <TableRow key={order.id} className={isAssignedToMe ? 'bg-accent/5' : ''}>
                    <TableCell className="font-mono font-bold text-accent">
                      <div>{order.so_no}</div>
                      <div className="text-[10px] text-text-muted font-normal">
                        Booked: {formatDateDMY(order.order_date)}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="font-bold text-text text-sm">{order.customer_name}</div>
                      {order.customer_phone && (
                        <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                          <Phone size={11} className="text-accent" />
                          <span>{order.customer_phone}</span>
                        </div>
                      )}
                      {order.customer_address && (
                        <div className="text-[11px] text-text-muted flex items-center gap-1 truncate max-w-[200px]">
                          <MapPin size={11} />
                          <span>{order.customer_address}</span>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-xs">
                      <div className="font-semibold text-text">
                        {order.destination || order.customer_address?.split(',')[0] || 'Tamil Nadu'}
                      </div>
                      {order.delivery_due_date && (
                        <div
                          className={`text-[11px] font-bold flex items-center gap-1 mt-0.5 ${
                            order.delivery_due_date <= new Date().toISOString().slice(0, 10)
                              ? 'text-danger'
                              : 'text-text-muted'
                          }`}
                        >
                          <Calendar size={11} />
                          <span>Due: {formatDateDMY(order.delivery_due_date)}</span>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-xs">
                      {order.assigned_dispatcher_name ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                            isAssignedToMe
                              ? 'bg-accent/15 text-accent border border-accent/30'
                              : 'bg-background border border-border text-text'
                          }`}
                        >
                          <CheckCheck size={11} />
                          <span>{order.assigned_dispatcher_name}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-text-muted italic">Open Dispatch Pool</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs">
                      <div className="font-bold text-text">
                        {items.length} {items.length === 1 ? 'Product' : 'Products'}
                      </div>
                      <div className="text-[11px] text-text-muted">{totalQty} Total Units / Boxes</div>
                    </TableCell>

                    <TableCell>
                      {isDispatched ? (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-success-light text-success">
                            <CheckCircle2 size={11} /> Dispatched
                          </span>
                          {order.lr_number && (
                            <div className="text-[10px] font-mono text-accent font-bold mt-0.5">
                              LR: {order.lr_number}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600">
                            <Clock size={11} /> Ready to Pack
                          </span>
                          {verifiedCount > 0 && (
                            <div className="text-[10px] text-text-muted mt-0.5 font-semibold">
                              {verifiedCount}/{items.length} items checked
                            </div>
                          )}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isDispatched ? (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleOpenVerifyModal(order)}
                            className="gap-1.5 font-bold shadow-xs text-xs"
                          >
                            <CheckSquare size={14} />
                            <span>Verify &amp; Dispatch</span>
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenChallanModal(order)}
                            className="gap-1.5 font-bold border-accent/40 text-accent hover:bg-accent/10 text-xs"
                            title="Open and print Delivery Challan"
                          >
                            <FileText size={14} />
                            <span>Delivery Challan</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ITEM VERIFICATION & DISPATCH CHECKLIST MODAL */}
      {/* ========================================================================= */}
      {selectedOrder && (
        <Dialog
          isOpen={isVerifyModalOpen}
          onClose={() => setIsVerifyModalOpen(false)}
          title={`Dispatch Checklist: ${selectedOrder.so_no} (${selectedOrder.customer_name})`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            {/* Header Banner */}
            <div className="bg-surface border border-border p-3 rounded flex flex-wrap justify-between items-center gap-2 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-text-muted">Consignee Buyer</span>
                <div className="font-bold text-text text-sm">{selectedOrder.customer_name}</div>
                {selectedOrder.customer_phone && <div className="text-text-muted">{selectedOrder.customer_phone}</div>}
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-text-muted">Destination Station</span>
                <div className="font-bold text-text">{destination || 'Hosur / TN'}</div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-text-muted">Consignment Value</span>
                <div className="font-bold font-mono text-accent text-sm">{formatINR(selectedOrder.total_amount)}</div>
              </div>
            </div>

            {/* Checklist Progress & Header */}
            <div className="bg-background border border-border rounded p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-text flex items-center gap-1.5">
                  <Package size={14} className="text-accent" />
                  <span>Cracker Packing Checklist</span>
                </span>

                <div className="flex items-center gap-3">
                  <span
                    className={`font-mono font-bold text-xs ${
                      isChecklistComplete ? 'text-success' : 'text-amber-600'
                    }`}
                  >
                    {checkedItemIds.size} / {selectedItems.length} Verified ({Math.round(
                      selectedItems.length > 0 ? (checkedItemIds.size / selectedItems.length) * 100 : 0
                    )}%)
                  </span>

                  <button
                    type="button"
                    onClick={handleToggleAllItems}
                    className="text-xs text-accent hover:underline font-bold"
                  >
                    {checkedItemIds.size === selectedItems.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="w-full bg-border/50 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    isChecklistComplete ? 'bg-success' : 'bg-accent'
                  }`}
                  style={{
                    width: `${selectedItems.length > 0 ? (checkedItemIds.size / selectedItems.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {/* Interactive Items Checklist Table */}
            <div className="border border-border rounded overflow-hidden max-h-64 overflow-y-auto bg-surface">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-background border-b border-border sticky top-0 font-bold text-text-muted uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5 w-10 text-center">Verify</th>
                    <th className="p-2.5">Cracker Product Name</th>
                    <th className="p-2.5">Brand</th>
                    <th className="p-2.5 text-center">Packaging Unit</th>
                    <th className="p-2.5 text-right">Order Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedItems.map((item) => {
                    const isChecked = checkedItemIds.has(item.id);

                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleToggleItemCheck(item.id)}
                        className={`cursor-pointer transition-colors ${
                          isChecked ? 'bg-success/10 hover:bg-success/15' : 'hover:bg-background'
                        }`}
                      >
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleItemCheck(item.id);
                            }}
                            className="text-text hover:text-accent focus:outline-none"
                          >
                            {isChecked ? (
                              <CheckSquare size={18} className="text-success" />
                            ) : (
                              <Square size={18} className="text-text-muted" />
                            )}
                          </button>
                        </td>
                        <td className="p-2.5">
                          <div className={`font-bold text-sm ${isChecked ? 'text-success' : 'text-text'}`}>
                            {item.product_name}
                          </div>
                          {item.product_code && (
                            <div className="text-[10px] font-mono text-text-muted">
                              Code: {item.product_code}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 font-semibold text-text-muted">{item.brand || 'Standard'}</td>
                        <td className="p-2.5 text-center uppercase font-mono font-bold">{item.unit || 'box'}</td>
                        <td className="p-2.5 text-right font-mono font-extrabold text-base text-accent">
                          {item.qty}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Transporter & Logistics Details Form */}
            <div className="space-y-3 pt-2 border-t border-border">
              <span className="block text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1">
                <Truck size={14} className="text-accent" />
                <span>Transport &amp; LR Booking Information</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider">
                    Transporter Carrier <span className="text-danger">*</span>
                  </label>
                  <Select
                    value={transporter}
                    onChange={(e) => setTransporter(e.target.value)}
                    options={COMMON_TRANSPORTERS.map((t) => ({
                      value: t,
                      label: t === '__custom__' ? '+ Other Transport Company...' : t,
                    }))}
                  />
                  {transporter === '__custom__' && (
                    <div className="mt-1.5">
                      <Input
                        value={customTransporter}
                        onChange={(e) => setCustomTransporter(e.target.value)}
                        placeholder="Enter Transport / Lorry Office Name..."
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider">
                    LR / Bilty Number
                  </label>
                  <Input
                    value={lrNumber}
                    onChange={(e) => setLrNumber(e.target.value)}
                    placeholder="e.g. VRL-89421 / Bilty-402"
                    className="font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider">
                    Vehicle / Lorry Number
                  </label>
                  <Input
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    placeholder="e.g. TN 70 AB 1234"
                    className="font-mono uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider">
                    Driver Mobile Number
                  </label>
                  <Input
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    placeholder="e.g. 98421 23456"
                    className="font-mono"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider">
                    Destination Station
                  </label>
                  <Input
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="e.g. Hosur, Bengaluru APMC, Salem, Chennai"
                  />
                </div>
              </div>
            </div>

            {/* Checklist Lock / Unlock Feedback Banner */}
            {!isChecklistComplete ? (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <Lock size={16} className="shrink-0" />
                <span>
                  <strong>Checklist Incomplete:</strong> Please verify and check all {selectedItems.length} items. The
                  Delivery Challan will unlock only after all items are confirmed.
                </span>
              </div>
            ) : (
              <div className="p-3 bg-success-light border border-success/30 rounded flex items-center gap-2 text-xs text-success">
                <Unlock size={16} className="shrink-0" />
                <span>
                  <strong>All {selectedItems.length} Items Verified!</strong> Click below to confirm dispatch and
                  generate the official Delivery Challan.
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="secondary" onClick={() => setIsVerifyModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmDispatch}
                disabled={!isChecklistComplete || isSubmittingDispatch}
                className="gap-1.5 font-bold"
              >
                <Truck size={15} />
                <span>{isSubmittingDispatch ? 'Saving Dispatch...' : 'Confirm & Mark as Dispatched'}</span>
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: OFFICIAL DELIVERY CHALLAN (LR GOODS DISPATCH SLIP) */}
      {/* ========================================================================= */}
      {challanOrder && (
        <Dialog
          isOpen={isChallanModalOpen}
          onClose={() => setIsChallanModalOpen(false)}
          title={`Delivery Challan: ${challanOrder.so_no}`}
          maxWidth="full"
        >
          <div className="space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-wrap justify-between items-center gap-2 pb-2.5 border-b border-border bg-surface p-2.5 rounded text-xs font-semibold">
              <div className="flex items-center gap-2">
                <span className="text-text-muted font-bold uppercase text-[10px]">Document Copy:</span>
                {(['original', 'duplicate', 'triplicate'] as const).map((cp) => (
                  <button
                    key={cp}
                    type="button"
                    onClick={() => setPrintCopy(cp)}
                    className={`px-2.5 py-1 rounded capitalize transition-colors ${
                      printCopy === cp ? 'bg-accent text-white shadow-xs font-bold' : 'bg-background border border-border text-text hover:text-accent'
                    }`}
                  >
                    {cp === 'original' && 'Original (Consignee)'}
                    {cp === 'duplicate' && 'Duplicate (Transporter / Lorry)'}
                    {cp === 'triplicate' && 'Triplicate (Office Copy)'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrintChallan}
                  disabled={isPrinting}
                  className="gap-1.5 font-bold shadow-xs"
                >
                  <Printer size={15} />
                  <span>{isPrinting ? 'Printing...' : 'Print A4 Delivery Challan'}</span>
                </Button>
              </div>
            </div>

            {/* A4 Printable Delivery Challan */}
            <div id="delivery-challan-print-area" className="printable-area">
              <div className="p-6 bg-white text-gray-900 border-2 border-gray-800 rounded-sm shadow-xs space-y-4 print:p-0 print:border-none print:shadow-none text-xs font-sans max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-3">
                  <div>
                    <VnaLogo size="md" />
                    <div className="font-extrabold text-base uppercase text-gray-900 mt-1">
                      VNA TRADERS
                    </div>
                    <div className="text-[11px] text-gray-600 leading-tight">
                      Wholesale &amp; Retail Fireworks Merchant<br />
                      Jeermangalam, Hosur, Krishnagiri Dist, Tamil Nadu - 635109<br />
                      Phone: +91 94431 23456 / +91 94432 98765<br />
                      <strong>GSTIN: 33ACSPV5299F1Z5</strong> • State Code: 33 (Tamil Nadu)
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="px-3 py-1 rounded bg-gray-900 text-white font-extrabold text-xs uppercase tracking-wider inline-block">
                      DELIVERY CHALLAN / GOODS DISPATCH SLIP
                    </span>
                    <div className="text-[10px] text-gray-700 font-bold uppercase mt-1">
                      {printCopy === 'original' && 'ORIGINAL FOR CONSIGNEE'}
                      {printCopy === 'duplicate' && 'DUPLICATE FOR TRANSPORTER (LORRY COPY)'}
                      {printCopy === 'triplicate' && 'TRIPLICATE FOR CONSIGNOR OFFICE'}
                    </div>
                    <div className="text-lg font-black font-mono text-gray-900 mt-1">
                      {challanOrder.so_no}
                    </div>
                    <div className="text-xs text-gray-600">
                      Dispatched On: <strong>{formatDateDMY(challanOrder.dispatched_at || challanOrder.order_date)}</strong>
                    </div>
                    <div className="text-xs text-gray-600">
                      Dispatched By: <strong>{challanOrder.dispatched_by || 'Dispatch In-Charge'}</strong>
                    </div>
                  </div>
                </div>

                {/* Consignee & Transport Grid */}
                <div className="grid grid-cols-2 gap-4 border border-gray-300 p-3 rounded text-xs bg-gray-50">
                  <div>
                    <span className="text-gray-500 font-bold uppercase text-[10px] block">Details of Consignee / Buyer:</span>
                    <div className="font-extrabold text-sm text-gray-900 mt-0.5">{challanOrder.customer_name}</div>
                    {challanOrder.customer_phone && (
                      <div className="text-gray-700">Phone: <strong>{challanOrder.customer_phone}</strong></div>
                    )}
                    {challanOrder.customer_address && (
                      <div className="text-gray-700 mt-0.5">Address: {challanOrder.customer_address}</div>
                    )}
                    {challanOrder.customer_gstin ? (
                      <div className="font-mono font-bold text-gray-900 mt-1">
                        GSTIN: {challanOrder.customer_gstin}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic mt-0.5">Retail / Unregistered Dealer</div>
                    )}
                  </div>

                  <div className="border-l border-gray-300 pl-3 space-y-1">
                    <span className="text-gray-500 font-bold uppercase text-[10px] block">Transporter &amp; Logistics Details:</span>
                    <div>Transporter: <strong>{challanOrder.transport_name || 'Direct Parcel / Lorry Booking'}</strong></div>
                    {challanOrder.lr_number && (
                      <div className="font-mono text-gray-900">
                        LR / Bilty No: <strong className="text-sm font-black">{challanOrder.lr_number}</strong>
                      </div>
                    )}
                    {challanOrder.vehicle_number && (
                      <div className="font-mono">
                        Vehicle No: <strong>{challanOrder.vehicle_number}</strong>
                      </div>
                    )}
                    {challanOrder.driver_phone && (
                      <div>Driver Contact: <strong>{challanOrder.driver_phone}</strong></div>
                    )}
                    <div>
                      Destination Station: <strong>{challanOrder.destination || 'Consignee Address'}</strong>
                    </div>
                  </div>
                </div>

                {/* Verified Cracker Items Table */}
                <table className="w-full text-left text-xs border border-gray-300 border-collapse">
                  <thead className="bg-gray-100 border-b border-gray-300 text-gray-700 font-bold text-[10px] uppercase">
                    <tr>
                      <th className="p-2 border-r border-gray-300 w-8 text-center">#</th>
                      <th className="p-2 border-r border-gray-300">Cracker Product Description</th>
                      <th className="p-2 border-r border-gray-300">Brand</th>
                      <th className="p-2 border-r border-gray-300 text-center">HSN</th>
                      <th className="p-2 border-r border-gray-300 text-center">Unit</th>
                      <th className="p-2 border-r border-gray-300 text-right">Dispatched Qty</th>
                      <th className="p-2 text-center">Packing Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {challanItems.map((it, idx) => (
                      <tr key={it.id}>
                        <td className="p-2 border-r border-gray-200 text-center text-gray-500">{idx + 1}</td>
                        <td className="p-2 border-r border-gray-200 font-bold text-gray-900">{it.product_name}</td>
                        <td className="p-2 border-r border-gray-200 text-gray-600">{it.brand || 'Standard'}</td>
                        <td className="p-2 border-r border-gray-200 text-center font-mono text-gray-600">3604</td>
                        <td className="p-2 border-r border-gray-200 text-center uppercase font-mono">{it.unit || 'box'}</td>
                        <td className="p-2 border-r border-gray-200 text-right font-mono font-bold text-gray-900 text-sm">
                          {it.qty}
                        </td>
                        <td className="p-2 text-center text-green-700 font-bold">
                          ✔ Verified
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-800 bg-gray-50 font-bold">
                    <tr>
                      <td colSpan={5} className="p-2 text-right uppercase text-xs">
                        Total Quantity Dispatched:
                      </td>
                      <td className="p-2 text-right font-mono font-black text-sm text-gray-900 border-r border-gray-300">
                        {challanItems.reduce((sum, it) => sum + (it.qty || 0), 0)}
                      </td>
                      <td className="p-2 text-center text-green-700 font-extrabold text-[10px] uppercase">
                        100% Packed
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Dispatch Declarations & Signatures */}
                <div className="pt-2 text-[10px] text-gray-600 space-y-1">
                  <p>
                    <strong>Declaration:</strong> Certified that all fireworks articles described herein conform to PESO &amp; Supreme Court green emission specifications and have been securely crated, packed, and handed over to the transporter in sound condition.
                  </p>
                  <p>
                    Goods once dispatched travel at consignee&apos;s risk. All disputes subject to Hosur jurisdiction only.
                  </p>
                </div>

                <div className="pt-8 grid grid-cols-3 gap-6 text-center text-[10px] font-bold text-gray-800">
                  <div className="border-t border-gray-400 pt-2">
                    <div>{challanOrder.dispatched_by || 'Dispatcher'}</div>
                    <div className="text-gray-500 font-normal">Packed &amp; Verified By</div>
                  </div>

                  <div className="border-t border-gray-400 pt-2">
                    <div>Transporter / Lorry Driver Signature</div>
                    <div className="text-gray-500 font-normal">Goods Received in Good Order</div>
                  </div>

                  <div className="border-t border-gray-400 pt-2">
                    <div>For VNA TRADERS</div>
                    <div className="text-gray-500 font-normal">Authorised Signatory</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-border">
              <Button variant="secondary" onClick={() => setIsChallanModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
