import React, { useState, useEffect, useMemo } from 'react';
import { db, generateNextLrNo } from '@/db';
import { TransportEntry, TransportStatus, FreightType, SaleOrder, Client } from '@/types';
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
  Package,
  Clock,
  CheckCircle2,
  Phone,
  MapPin,
  Search,
  Plus,
  Download,
  Printer,
  Eye,
  Edit3,
  Trash2,
  TrendingUp,
  BarChart3,
  FileText,
  RotateCcw,
  Building2,
  Navigation,
  DollarSign,
  Boxes,
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
];

export const TransportPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'supervisor';
  const { toast } = useToast();

  const [entries, setEntries] = useState<TransportEntry[]>([]);
  const [saleOrders, setSaleOrders] = useState<SaleOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [transporterFilter, setTransporterFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  // New Transport Entry Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSoId, setSelectedSoId] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [transportName, setTransportName] = useState('VRL Logistics');
  const [customTransport, setCustomTransport] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
  const [destination, setDestination] = useState('');
  const [sourceLocation, setSourceLocation] = useState('Hosur Central Godown (Jeermangalam)');
  const [consigneeName, setConsigneeName] = useState('');
  const [consigneePhone, setConsigneePhone] = useState('');
  const [consigneeAddress, setConsigneeAddress] = useState('');
  const [consigneeGstin, setConsigneeGstin] = useState('');
  const [totalBoxes, setTotalBoxes] = useState<number>(20);
  const [totalWeightKg, setTotalWeightKg] = useState<number>(170);
  const [consignmentValue, setConsignmentValue] = useState<number>(35000);
  const [itemsSummary, setItemsSummary] = useState('');
  const [freightType, setFreightType] = useState<FreightType>('to_pay');
  const [freightAmount, setFreightAmount] = useState<number>(1500);
  const [loadingCharges, setLoadingCharges] = useState<number>(200);
  const [status, setStatus] = useState<TransportStatus>('in_transit');
  const [isSaving, setIsSaving] = useState(false);

  // View & Print Waybill Modal state
  const [viewEntry, setViewEntry] = useState<TransportEntry | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Update Status Modal state
  const [statusModalEntry, setStatusModalEntry] = useState<TransportEntry | null>(null);
  const [newStatus, setNewStatus] = useState<TransportStatus>('delivered');
  const [deliveryRemarks, setDeliveryRemarks] = useState('');
  const [actualDeliveryDate, setActualDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Print Daily Manifest state
  const [isPrintingManifest, setIsPrintingManifest] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const allTransports = await db.transport_entries.reverse().sortBy('dispatch_date');
      setEntries(allTransports);

      const allSos = await db.sale_orders.toArray();
      setSaleOrders(allSos);

      const allClients = await db.clients.toArray();
      setClients(allClients);
    } catch (err: any) {
      toast(err?.message || 'Failed to load transport registry', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleSync = () => {
      loadData();
    };

    window.addEventListener('transport-entries-synced', handleSync);
    window.addEventListener('sale-orders-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('transport-entries-synced', handleSync);
      window.removeEventListener('sale-orders-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, []);

  // Handle open create modal
  const handleOpenCreate = async () => {
    const nextLr = await generateNextLrNo('VRL');
    setLrNo(nextLr);
    setSelectedSoId('');
    setTransportName('VRL Logistics');
    setCustomTransport('');
    setVehicleNo('');
    setDriverName('');
    setDriverPhone('');
    setDispatchDate(new Date().toISOString().slice(0, 10));
    setEstimatedDeliveryDate(new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10));
    setDestination('');
    setSourceLocation('Hosur Central Godown (Jeermangalam)');
    setConsigneeName('');
    setConsigneePhone('');
    setConsigneeAddress('');
    setConsigneeGstin('');
    setTotalBoxes(25);
    setTotalWeightKg(210);
    setConsignmentValue(45000);
    setItemsSummary('Crackers Gift Boxes & Sparklers');
    setFreightType('to_pay');
    setFreightAmount(1800);
    setLoadingCharges(250);
    setStatus('in_transit');
    setIsCreateOpen(true);
  };

  // Populate from selected Sale Order
  const handleSelectSaleOrder = async (soId: string) => {
    setSelectedSoId(soId);
    if (!soId) return;

    const so = saleOrders.find((s) => s.id === soId);
    if (so) {
      setConsigneeName(so.customer_name);
      setConsigneePhone(so.customer_phone || '');
      setConsigneeAddress(so.customer_address || '');
      setConsigneeGstin(so.customer_gstin || '');
      setDestination(so.destination || so.customer_address?.split(',')[0] || 'Hosur');
      setConsignmentValue(so.total_amount || 0);

      if (so.transport_name) {
        if (COMMON_TRANSPORTERS.includes(so.transport_name)) {
          setTransportName(so.transport_name);
          setCustomTransport('');
        } else {
          setTransportName('__custom__');
          setCustomTransport(so.transport_name);
        }
      }
      if (so.lr_number) {
        setLrNo(so.lr_number);
      }
      if (so.vehicle_number) {
        setVehicleNo(so.vehicle_number);
      }
      if (so.driver_phone) {
        setDriverPhone(so.driver_phone);
      }

      // Fetch items to count boxes
      const items = await db.sale_order_items.where('so_id').equals(so.id).toArray();
      if (items.length > 0) {
        const total = items.reduce((sum, it) => sum + (it.qty || 0), 0);
        setTotalBoxes(total);
        setTotalWeightKg(Math.round(total * 8.5));
        setItemsSummary(items.map((i) => `${i.product_name} (${i.qty})`).slice(0, 4).join(', '));
        setFreightAmount(Math.round(total * 65));
        setLoadingCharges(Math.round(total * 10));
      }
    }
  };

  const handleConsigneeClientSelect = (clientId: string) => {
    if (!clientId) return;
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setConsigneeName(client.company_name ? `${client.name} (${client.company_name})` : client.name);
      if (client.phone) setConsigneePhone(client.phone);
      if (client.address) setConsigneeAddress(client.address);
      if (client.city) setDestination(client.city);
      if (client.gstin) setConsigneeGstin(client.gstin);
    }
  };

  // Save new transport entry
  const handleSaveTransport = async () => {
    const finalLr = lrNo.trim();
    if (!finalLr) {
      toast('Please enter LR / Bilty Number', 'error');
      return;
    }
    const finalConsignee = consigneeName.trim();
    if (!finalConsignee) {
      toast('Please enter Consignee / Customer Name', 'error');
      return;
    }
    const finalDestination = destination.trim();
    if (!finalDestination) {
      toast('Please enter Destination Station', 'error');
      return;
    }

    const finalCarrier =
      transportName === '__custom__' ? customTransport.trim() || 'Direct Lorry' : transportName;

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const entryId = generateUUID();
      const totalFreight = (Number(freightAmount) || 0) + (Number(loadingCharges) || 0);

      const record: TransportEntry = {
        id: entryId,
        lr_no: finalLr,
        transport_name: finalCarrier,
        vehicle_no: vehicleNo.trim() || undefined,
        driver_name: driverName.trim() || undefined,
        driver_phone: driverPhone.trim() || undefined,
        dispatch_date: dispatchDate,
        estimated_delivery_date: estimatedDeliveryDate || undefined,
        destination: finalDestination,
        source_location: sourceLocation.trim(),
        so_id: selectedSoId || undefined,
        so_no: saleOrders.find((s) => s.id === selectedSoId)?.so_no || undefined,
        consignee_name: finalConsignee,
        consignee_phone: consigneePhone.trim() || undefined,
        consignee_address: consigneeAddress.trim() || undefined,
        consignee_gstin: consigneeGstin.trim()?.toUpperCase() || undefined,
        total_boxes: Number(totalBoxes) || 0,
        total_weight_kg: Number(totalWeightKg) || 0,
        consignment_value: Number(consignmentValue) || 0,
        items_summary: itemsSummary.trim() || undefined,
        freight_type: freightType,
        freight_amount: Number(freightAmount) || 0,
        loading_charges: Number(loadingCharges) || 0,
        total_charges: totalFreight,
        status: status,
        dispatched_by: user?.full_name || 'Staff',
        created_by: user?.full_name || 'Staff',
        created_at: now,
        updated_at: now,
      };

      await db.transport_entries.put(record);

      // Also update linked Sale Order if any
      if (selectedSoId) {
        await db.sale_orders.update(selectedSoId, {
          transport_name: finalCarrier,
          lr_number: finalLr,
          vehicle_number: vehicleNo.trim() || undefined,
          driver_phone: driverPhone.trim() || undefined,
          destination: finalDestination,
          status: status === 'delivered' ? 'delivered' : 'dispatched',
          dispatched_at: now,
          updated_at: now,
        });

        const updatedSo = await db.sale_orders.get(selectedSoId);
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
        }
      }

      await db.outbox.add({
        id: generateUUID(),
        entity: 'transport_entries',
        op: 'insert',
        payload: record,
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      syncService.triggerSync();

      toast(`Transport Consignment ${finalLr} logged successfully!`, 'success');
      setIsCreateOpen(false);
      loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to save transport entry', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Status Update Modal
  const handleOpenStatusModal = (entry: TransportEntry) => {
    setStatusModalEntry(entry);
    setNewStatus(entry.status === 'in_transit' ? 'delivered' : entry.status);
    setDeliveryRemarks(entry.delivery_remarks || '');
    setActualDeliveryDate(new Date().toISOString().slice(0, 10));
  };

  // Submit Status Update
  const handleSaveStatusUpdate = async () => {
    if (!statusModalEntry) return;
    setIsUpdatingStatus(true);
    try {
      const now = new Date().toISOString();
      const updates: Partial<TransportEntry> = {
        status: newStatus,
        delivery_remarks: deliveryRemarks.trim() || undefined,
        actual_delivery_date: newStatus === 'delivered' ? actualDeliveryDate : undefined,
        updated_at: now,
      };

      await db.transport_entries.update(statusModalEntry.id, updates);

      // If linked to sale order and marked delivered, update sale order too
      if (statusModalEntry.so_id && newStatus === 'delivered') {
        await db.sale_orders.update(statusModalEntry.so_id, {
          status: 'delivered',
          delivered_at: now,
          updated_at: now,
        });
      }

      const updated = await db.transport_entries.get(statusModalEntry.id);
      if (updated) {
        await db.outbox.add({
          id: generateUUID(),
          entity: 'transport_entries',
          op: 'update',
          payload: updated,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
        syncService.triggerSync();
      }

      toast(`LR ${statusModalEntry.lr_no} status updated to ${newStatus.toUpperCase()}`, 'success');
      setStatusModalEntry(null);
      loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to update transport status', 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Delete transport entry
  const handleDeleteEntry = async (entry: TransportEntry) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete transport record for LR ${entry.lr_no}?`)) return;
    try {
      await db.transport_entries.delete(entry.id);
      await db.outbox.add({
        id: generateUUID(),
        entity: 'transport_entries',
        op: 'delete',
        payload: { id: entry.id },
        status: 'pending',
        attempts: 0,
        created_at: new Date().toISOString(),
      });
      syncService.triggerSync();
      toast(`Transport entry ${entry.lr_no} deleted`, 'info');
      loadData();
    } catch (err: any) {
      toast(err?.message || 'Error deleting record', 'error');
    }
  };

  // Print single waybill
  const handlePrintWaybill = async () => {
    if (!viewEntry) return;
    setIsPrinting(true);
    try {
      await printFormattedElement('transport-waybill-print-area', {
        paperSize: 'a4',
        title: `Waybill_${viewEntry.lr_no}`,
      });
    } catch (err: any) {
      toast(`Print warning: ${err?.message}`, 'warning');
    } finally {
      setIsPrinting(false);
    }
  };

  // Print Daily Manifest / Loading Sheet
  const handlePrintManifest = async () => {
    setIsPrintingManifest(true);
    try {
      await printFormattedElement('transport-manifest-print-area', {
        paperSize: 'a4',
        title: `Daily_Transport_Manifest_${new Date().toISOString().slice(0, 10)}`,
      });
    } catch (err: any) {
      toast(`Print notice: ${err?.message}`, 'warning');
    } finally {
      setIsPrintingManifest(false);
    }
  };

  // Export history to CSV
  const handleExportCsv = () => {
    if (entries.length === 0) {
      toast('No transport entries to export', 'info');
      return;
    }

    const headers = [
      'LR / Bilty No',
      'Dispatch Date',
      'Transporter',
      'Vehicle No',
      'Driver Phone',
      'Consignee Name',
      'Destination',
      'Total Boxes',
      'Weight (kg)',
      'Consignment Value (₹)',
      'Freight Type',
      'Freight (₹)',
      'Total Charges (₹)',
      'Status',
      'Sale Order No',
      'Dispatched By',
    ];

    const rows = filteredEntries.map((e) => [
      `"${e.lr_no}"`,
      `"${e.dispatch_date}"`,
      `"${e.transport_name}"`,
      `"${e.vehicle_no || ''}"`,
      `"${e.driver_phone || ''}"`,
      `"${e.consignee_name.replace(/"/g, '""')}"`,
      `"${e.destination.replace(/"/g, '""')}"`,
      e.total_boxes,
      e.total_weight_kg || '',
      e.consignment_value,
      `"${e.freight_type}"`,
      e.freight_amount,
      e.total_charges,
      `"${e.status}"`,
      `"${e.so_no || ''}"`,
      `"${e.dispatched_by || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `VNA_Traders_Transport_Log_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast('Transport history exported to CSV!', 'success');
  };

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      // Status filter
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;

      // Transporter filter
      if (transporterFilter !== 'all' && e.transport_name !== transporterFilter) return false;

      // Date range filter
      if (dateRangeFilter !== 'all') {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (dateRangeFilter === 'today' && e.dispatch_date !== todayStr) return false;
        if (dateRangeFilter === 'week') {
          const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
          if (e.dispatch_date < sevenDaysAgo) return false;
        }
        if (dateRangeFilter === 'month') {
          const thisMonthPrefix = todayStr.slice(0, 7);
          if (!e.dispatch_date.startsWith(thisMonthPrefix)) return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesLr = e.lr_no.toLowerCase().includes(q);
        const matchesConsignee = e.consignee_name.toLowerCase().includes(q);
        const matchesTransporter = e.transport_name.toLowerCase().includes(q);
        const matchesVehicle = (e.vehicle_no || '').toLowerCase().includes(q);
        const matchesDest = e.destination.toLowerCase().includes(q);
        const matchesSo = (e.so_no || '').toLowerCase().includes(q);
        const matchesDriver = (e.driver_phone || '').includes(q);
        return (
          matchesLr ||
          matchesConsignee ||
          matchesTransporter ||
          matchesVehicle ||
          matchesDest ||
          matchesSo ||
          matchesDriver
        );
      }
      return true;
    });
  }, [entries, statusFilter, transporterFilter, dateRangeFilter, searchQuery]);

  // Statistics calculation
  const statistics = useMemo(() => {
    const totalShipments = entries.length;
    const inTransit = entries.filter((e) => e.status === 'in_transit' || e.status === 'out_for_delivery').length;
    const delivered = entries.filter((e) => e.status === 'delivered').length;
    const booked = entries.filter((e) => e.status === 'booked').length;
    const totalBoxes = entries.reduce((sum, e) => sum + (e.total_boxes || 0), 0);
    const totalValue = entries.reduce((sum, e) => sum + (e.consignment_value || 0), 0);
    const totalFreight = entries.reduce((sum, e) => sum + (e.total_charges || 0), 0);
    const toPayFreight = entries
      .filter((e) => e.freight_type === 'to_pay')
      .reduce((sum, e) => sum + (e.total_charges || 0), 0);
    const paidFreight = entries
      .filter((e) => e.freight_type === 'paid')
      .reduce((sum, e) => sum + (e.total_charges || 0), 0);

    // Carrier breakdown
    const carrierMap: Record<string, { count: number; value: number; boxes: number; freight: number }> = {};
    entries.forEach((e) => {
      const name = e.transport_name || 'Other';
      if (!carrierMap[name]) {
        carrierMap[name] = { count: 0, value: 0, boxes: 0, freight: 0 };
      }
      carrierMap[name].count += 1;
      carrierMap[name].value += e.consignment_value || 0;
      carrierMap[name].boxes += e.total_boxes || 0;
      carrierMap[name].freight += e.total_charges || 0;
    });

    const carrierStats = Object.entries(carrierMap)
      .map(([carrier, data]) => ({ carrier, ...data }))
      .sort((a, b) => b.count - a.count);

    // Destination routes breakdown
    const destMap: Record<string, number> = {};
    entries.forEach((e) => {
      const city = e.destination.split('(')[0].split(',')[0].trim();
      destMap[city] = (destMap[city] || 0) + 1;
    });

    const destinationStats = Object.entries(destMap)
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      totalShipments,
      inTransit,
      delivered,
      booked,
      totalBoxes,
      totalValue,
      totalFreight,
      toPayFreight,
      paidFreight,
      deliveryRate: totalShipments > 0 ? Math.round((delivered / totalShipments) * 100) : 0,
      carrierStats,
      destinationStats,
    };
  }, [entries]);

  return (
    <div className="space-y-4">
      {/* Page Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-black text-text tracking-tight flex items-center gap-2">
            <Truck className="text-accent" size={24} />
            <span>Transportation &amp; Logistics Hub</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Real-time transport statistics, Lorry Receipt (LR / Bilty) registry, carrier analytics, and transit history.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportCsv}
            className="gap-1.5 font-bold text-xs"
            title="Export transport records to CSV spreadsheet"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrintManifest}
            disabled={isPrintingManifest || entries.length === 0}
            className="gap-1.5 font-bold text-xs"
            title="Print Daily Dispatch & Lorry Loading Sheet"
          >
            <Printer size={14} />
            <span>{isPrintingManifest ? 'Printing...' : 'Dispatch Sheet'}</span>
          </Button>

          <Button variant="primary" size="sm" onClick={handleOpenCreate} className="gap-1.5 font-bold text-xs">
            <Plus size={15} />
            <span>New Transport Booking</span>
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: STATISTICS & LOGISTICS ANALYTICS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Metric 1 */}
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted uppercase flex items-center gap-1">
            <Truck size={13} className="text-accent" /> Total Dispatches
          </span>
          <div className="text-2xl font-black text-text mt-1">{statistics.totalShipments}</div>
          <span className="text-[10px] text-text-muted">Total consignments booked</span>
        </div>

        {/* Metric 2 */}
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
            <Navigation size={13} /> Active In-Transit
          </span>
          <div className="text-2xl font-black text-amber-600 mt-1">{statistics.inTransit}</div>
          <span className="text-[10px] text-text-muted">Moving on parcel lorries</span>
        </div>

        {/* Metric 3 */}
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-success flex items-center gap-1">
            <CheckCircle2 size={13} /> Delivered Safely
          </span>
          <div className="text-2xl font-black text-success mt-1">{statistics.delivered}</div>
          <span className="text-[10px] text-text-muted">{statistics.deliveryRate}% fulfillment rate</span>
        </div>

        {/* Metric 4 */}
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted uppercase flex items-center gap-1">
            <Boxes size={13} className="text-accent" /> Total Cracker Boxes
          </span>
          <div className="text-2xl font-black text-accent mt-1">{statistics.totalBoxes}</div>
          <span className="text-[10px] text-text-muted">Cartons / cases handled</span>
        </div>

        {/* Metric 5 */}
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted uppercase flex items-center gap-1">
            <TrendingUp size={13} className="text-accent" /> Consignment Cargo
          </span>
          <div className="text-lg font-black text-text font-mono mt-1">{formatINR(statistics.totalValue)}</div>
          <span className="text-[10px] text-text-muted">Total goods value</span>
        </div>

        {/* Metric 6 */}
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted uppercase flex items-center gap-1">
            <DollarSign size={13} className="text-accent" /> Freight Charges
          </span>
          <div className="text-lg font-black text-accent font-mono mt-1">{formatINR(statistics.totalFreight)}</div>
          <span className="text-[10px] text-text-muted">To-Pay: {formatINR(statistics.toPayFreight)}</span>
        </div>
      </div>

      {/* Analytics Breakdown: Carriers & Routes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Carrier Breakdown Cards */}
        <div className="lg:col-span-2 bg-surface border border-border rounded p-3.5 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
            <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 size={15} className="text-accent" />
              <span>Transporter Carrier Performance</span>
            </span>
            <span className="text-[11px] text-text-muted">{statistics.carrierStats.length} carriers used</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {statistics.carrierStats.map((c) => (
              <div key={c.carrier} className="p-2.5 rounded bg-background border border-border/70 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-text truncate max-w-[130px]" title={c.carrier}>
                    {c.carrier}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                    {c.count} Trips
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-text-muted">
                  <span>Volume:</span>
                  <strong className="text-text">{c.boxes} Boxes</strong>
                </div>
                <div className="flex items-center justify-between text-[11px] text-text-muted">
                  <span>Freight:</span>
                  <strong className="text-accent font-mono">{formatINR(c.freight)}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Destination Routes */}
        <div className="bg-surface border border-border rounded p-3.5 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
            <span className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-1.5">
              <MapPin size={15} className="text-accent" />
              <span>Top Destination Routes</span>
            </span>
            <span className="text-[11px] text-text-muted">From Hosur</span>
          </div>

          <div className="space-y-2">
            {statistics.destinationStats.map((d, idx) => {
              const maxCount = statistics.destinationStats[0]?.count || 1;
              const pct = Math.round((d.count / maxCount) * 100);
              return (
                <div key={d.city} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-text flex items-center gap-1">
                      <span className="text-[10px] font-bold text-text-muted">{idx + 1}.</span>
                      <span>{d.city}</span>
                    </span>
                    <span className="font-mono font-bold text-accent">{d.count} Consignments</span>
                  </div>
                  <div className="w-full bg-border/40 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: SEARCH & FILTER CONTROLS */}
      {/* ========================================================================= */}
      <div className="bg-surface border border-border rounded p-3 flex flex-wrap gap-2.5 items-center justify-between">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search by LR number, customer, transporter, vehicle, destination..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs min-h-[38px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs min-h-[38px]"
          >
            <option value="all">All Transit Statuses</option>
            <option value="in_transit">In-Transit</option>
            <option value="delivered">Delivered</option>
            <option value="booked">Booked (Ready)</option>
            <option value="cancelled">Cancelled</option>
          </Select>

          {/* Transporter Filter */}
          <Select
            value={transporterFilter}
            onChange={(e) => setTransporterFilter(e.target.value)}
            className="text-xs min-h-[38px]"
          >
            <option value="all">All Transporters</option>
            {COMMON_TRANSPORTERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          {/* Date Filter */}
          <Select
            value={dateRangeFilter}
            onChange={(e) => setDateRangeFilter(e.target.value as any)}
            className="text-xs min-h-[38px]"
          >
            <option value="all">All Dates</option>
            <option value="today">Today's Dispatches</option>
            <option value="week">Past 7 Days</option>
            <option value="month">This Month</option>
          </Select>

          {(searchQuery || statusFilter !== 'all' || transporterFilter !== 'all' || dateRangeFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setTransporterFilter('all');
                setDateRangeFilter('all');
              }}
              className="text-danger hover:underline text-xs font-semibold px-2 flex items-center gap-1"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: TRANSPORT HISTORY REGISTRY TABLE */}
      {/* ========================================================================= */}
      {loading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          message="No transportation consignment entries found"
          actionLabel="Log New Transport Booking"
          onAction={handleOpenCreate}
        />
      ) : (
        <div className="overflow-x-auto w-full border border-border rounded bg-surface shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>LR / Bilty No</TableHead>
                <TableHead>Dispatch Date</TableHead>
                <TableHead>Carrier &amp; Vehicle</TableHead>
                <TableHead>Consignee / Destination</TableHead>
                <TableHead>Boxes &amp; Cargo</TableHead>
                <TableHead>Freight Charges</TableHead>
                <TableHead>Transit Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((e) => (
                <TableRow key={e.id}>
                  {/* LR No */}
                  <TableCell className="font-mono font-bold text-accent">
                    <div>{e.lr_no}</div>
                    {e.so_no && <div className="text-[10px] text-text-muted font-normal">SO: {e.so_no}</div>}
                  </TableCell>

                  {/* Dispatch Date */}
                  <TableCell className="text-xs text-text-muted whitespace-nowrap">
                    <div>{formatDateDMY(e.dispatch_date)}</div>
                    {e.estimated_delivery_date && (
                      <div className="text-[10px] text-amber-600 font-semibold">
                        Due: {formatDateDMY(e.estimated_delivery_date)}
                      </div>
                    )}
                  </TableCell>

                  {/* Carrier & Vehicle */}
                  <TableCell className="text-xs">
                    <div className="font-bold text-text">{e.transport_name}</div>
                    {e.vehicle_no ? (
                      <div className="font-mono text-[11px] text-accent font-semibold">{e.vehicle_no}</div>
                    ) : (
                      <span className="text-[10px] text-text-muted italic">Vehicle pending</span>
                    )}
                    {e.driver_phone && (
                      <div className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
                        <Phone size={10} className="text-accent" />
                        <span>{e.driver_phone}</span>
                      </div>
                    )}
                  </TableCell>

                  {/* Consignee & Destination */}
                  <TableCell>
                    <div className="font-bold text-text text-sm">{e.consignee_name}</div>
                    <div className="text-xs font-semibold text-accent flex items-center gap-1 mt-0.5">
                      <MapPin size={11} className="shrink-0" />
                      <span>{e.destination}</span>
                    </div>
                  </TableCell>

                  {/* Boxes & Cargo */}
                  <TableCell className="text-xs">
                    <div className="font-bold text-text">
                      {e.total_boxes} {e.total_boxes === 1 ? 'Box' : 'Boxes'}
                      {e.total_weight_kg ? ` (${e.total_weight_kg} kg)` : ''}
                    </div>
                    <div className="text-[11px] text-accent font-mono font-bold">{formatINR(e.consignment_value)}</div>
                  </TableCell>

                  {/* Freight Charges */}
                  <TableCell className="text-xs">
                    <div className="font-mono font-bold text-text">{formatINR(e.total_charges)}</div>
                    <span
                      className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                        e.freight_type === 'to_pay'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : e.freight_type === 'paid'
                          ? 'bg-success-light text-success'
                          : 'bg-surface text-text-muted border border-border'
                      }`}
                    >
                      {e.freight_type === 'to_pay' ? 'To-Pay' : e.freight_type === 'paid' ? 'Paid' : 'TBB'}
                    </span>
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    {e.status === 'delivered' ? (
                      <div>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-success-light text-success">
                          <CheckCircle2 size={11} /> Delivered
                        </span>
                        {e.actual_delivery_date && (
                          <div className="text-[10px] text-text-muted mt-0.5 font-semibold">
                            {formatDateDMY(e.actual_delivery_date)}
                          </div>
                        )}
                      </div>
                    ) : e.status === 'in_transit' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-accent/15 text-accent">
                        <Navigation size={11} /> In-Transit
                      </span>
                    ) : e.status === 'cancelled' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-danger-light text-danger">
                        Cancelled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600">
                        <Clock size={11} /> Booked
                      </span>
                    )}
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setViewEntry(e);
                          setIsViewOpen(true);
                        }}
                        className="gap-1 min-h-[30px] text-xs"
                        title="View Waybill & Print Transit Slip"
                      >
                        <Eye size={13} />
                        <span>View</span>
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenStatusModal(e)}
                        className="gap-1 min-h-[30px] text-xs font-semibold text-accent border-accent/30 hover:bg-accent/10"
                        title="Update transit or delivery status"
                      >
                        <Edit3 size={13} />
                        <span>Status</span>
                      </Button>

                      {isAdmin && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDeleteEntry(e)}
                          className="p-1.5 h-[30px] w-[30px] text-text-muted hover:text-danger"
                          title="Delete transport entry"
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

      {/* ========================================================================= */}
      {/* MODAL 1: NEW TRANSPORT BOOKING DIALOG */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Log New Transport Consignment Booking"
        maxWidth="xl"
      >
        <div className="space-y-4">
          {/* Link to Sale Order (Optional) */}
          <div className="p-3 bg-accent/5 border border-accent/20 rounded">
            <label className="block text-xs font-bold text-accent uppercase mb-1">
              Link to Existing Sale Order (Optional)
            </label>
            <Select value={selectedSoId} onChange={(e) => handleSelectSaleOrder(e.target.value)}>
              <option value="">-- Direct Consignment / Standalone Booking --</option>
              {saleOrders.map((so) => (
                <option key={so.id} value={so.id}>
                  {so.so_no} - {so.customer_name} ({formatINR(so.total_amount)}) [{so.status.toUpperCase()}]
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-text-muted mt-1">
              Selecting a sale order automatically populates customer, destination, boxes count, and cargo value.
            </p>
          </div>

          {/* Section: Carrier & LR Details */}
          <div className="space-y-2 border border-border rounded p-3 bg-background">
            <span className="text-xs font-bold text-text uppercase flex items-center gap-1.5">
              <Truck size={14} className="text-accent" />
              <span>Transporter Carrier &amp; Lorry Receipt Details</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Transporter Carrier <span className="text-danger">*</span>
                </label>
                <Select value={transportName} onChange={(e) => setTransportName(e.target.value)}>
                  {COMMON_TRANSPORTERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  <option value="__custom__">+ Other Transport Carrier...</option>
                </Select>
                {transportName === '__custom__' && (
                  <div className="mt-1.5">
                    <Input
                      value={customTransport}
                      onChange={(e) => setCustomTransport(e.target.value)}
                      placeholder="Enter Carrier Name..."
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  LR / Bilty Number <span className="text-danger">*</span>
                </label>
                <Input
                  value={lrNo}
                  onChange={(e) => setLrNo(e.target.value)}
                  placeholder="e.g. VRL-89421"
                  className="font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Vehicle / Lorry Registration No</label>
                <Input
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="e.g. TN 70 AB 1234"
                  className="font-mono uppercase font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Driver Name</label>
                <Input
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. K. Senthil"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Driver Contact Mobile</label>
                <Input
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="e.g. 98421 23456"
                  className="font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Dispatch Date</label>
                <Input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Section: Consignee & Route */}
          <div className="space-y-2 border border-border rounded p-3 bg-background">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-text uppercase flex items-center gap-1.5">
                <Building2 size={14} className="text-accent" />
                <span>Consignee &amp; Destination Station</span>
              </span>
              {clients.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-text-muted shrink-0 font-medium">Quick Fill:</span>
                  <Select
                    value=""
                    onChange={(e) => handleConsigneeClientSelect(e.target.value)}
                    className="text-xs py-1 h-7"
                  >
                    <option value="">-- Autofill From Client Directory --</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.company_name ? `(${c.company_name})` : ''} - {c.city || 'Tamil Nadu'}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Consignee / Customer Name <span className="text-danger">*</span>
                </label>
                <Input
                  value={consigneeName}
                  onChange={(e) => setConsigneeName(e.target.value)}
                  placeholder="e.g. Sri Balaji Fireworks"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Consignee Phone</label>
                <Input
                  value={consigneePhone}
                  onChange={(e) => setConsigneePhone(e.target.value)}
                  placeholder="e.g. 94431 12345"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Destination Station / Town <span className="text-danger">*</span>
                </label>
                <Input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Bengaluru APMC / Salem"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-text mb-1">Delivery Address</label>
                <Input
                  value={consigneeAddress}
                  onChange={(e) => setConsigneeAddress(e.target.value)}
                  placeholder="Delivery address or booking station branch"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Consignee GSTIN</label>
                <Input
                  value={consigneeGstin}
                  onChange={(e) => setConsigneeGstin(e.target.value)}
                  placeholder="33AAAAA0000A1Z5"
                  className="font-mono uppercase"
                />
              </div>
            </div>
          </div>

          {/* Section: Cargo & Freight Charges */}
          <div className="space-y-2 border border-border rounded p-3 bg-background">
            <span className="text-xs font-bold text-text uppercase flex items-center gap-1.5">
              <Package size={14} className="text-accent" />
              <span>Cargo Volume &amp; Freight Breakdown</span>
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Total Cracker Boxes</label>
                <Input
                  type="number"
                  min="1"
                  value={totalBoxes}
                  onChange={(e) => setTotalBoxes(parseInt(e.target.value) || 1)}
                  className="font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Approx Weight (kg)</label>
                <Input
                  type="number"
                  min="0"
                  value={totalWeightKg}
                  onChange={(e) => setTotalWeightKg(parseFloat(e.target.value) || 0)}
                  className="font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Consignment Value (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={consignmentValue}
                  onChange={(e) => setConsignmentValue(parseFloat(e.target.value) || 0)}
                  className="font-mono font-bold text-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Freight Payment Term</label>
                <Select value={freightType} onChange={(e) => setFreightType(e.target.value as FreightType)}>
                  <option value="to_pay">To-Pay (Pay at Delivery)</option>
                  <option value="paid">Paid (Prepaid by Consignor)</option>
                  <option value="tbb">T.B.B. (To Be Billed)</option>
                  <option value="free_delivery">Free Delivery</option>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Freight Charges (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={freightAmount}
                  onChange={(e) => setFreightAmount(parseFloat(e.target.value) || 0)}
                  className="font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Hamali / Loading (₹)</label>
                <Input
                  type="number"
                  min="0"
                  value={loadingCharges}
                  onChange={(e) => setLoadingCharges(parseFloat(e.target.value) || 0)}
                  className="font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Estimated Delivery Date</label>
                <Input
                  type="date"
                  value={estimatedDeliveryDate}
                  onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Transit Status</label>
                <Select value={status} onChange={(e) => setStatus(e.target.value as TransportStatus)}>
                  <option value="in_transit">In-Transit</option>
                  <option value="booked">Booked (Ready)</option>
                  <option value="delivered">Delivered</option>
                </Select>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveTransport} disabled={isSaving} className="gap-1.5 font-bold">
              <Truck size={14} />
              <span>{isSaving ? 'Logging Entry...' : 'Save & Register Consignment'}</span>
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL 2: UPDATE STATUS & DELIVERY ACKNOWLEDGEMENT MODAL */}
      {/* ========================================================================= */}
      {statusModalEntry && (
        <Dialog
          isOpen={!!statusModalEntry}
          onClose={() => setStatusModalEntry(null)}
          title={`Update Transit Status: LR ${statusModalEntry.lr_no}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-surface border border-border rounded text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Consignee:</span>
                <strong className="text-text">{statusModalEntry.consignee_name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Destination:</span>
                <strong className="text-text">{statusModalEntry.destination}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Transporter:</span>
                <strong className="text-accent">{statusModalEntry.transport_name}</strong>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Select Transit Status</label>
                <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value as TransportStatus)}>
                  <option value="in_transit">In-Transit (Moving on Lorry)</option>
                  <option value="delivered">Delivered (Received by Customer)</option>
                  <option value="booked">Booked (Waiting for Pickup)</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </div>

              {newStatus === 'delivered' && (
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Actual Delivery Date</label>
                  <Input
                    type="date"
                    value={actualDeliveryDate}
                    onChange={(e) => setActualDeliveryDate(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Delivery Remarks / Receiver Proof Notes
                </label>
                <textarea
                  value={deliveryRemarks}
                  onChange={(e) => setDeliveryRemarks(e.target.value)}
                  rows={3}
                  placeholder="e.g. Delivered at customer godown, signed by store manager with seal intact..."
                  className="w-full text-xs p-2.5 rounded border border-border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="secondary" onClick={() => setStatusModalEntry(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveStatusUpdate}
                disabled={isUpdatingStatus}
                className="gap-1.5 font-bold"
              >
                <CheckCircle2 size={14} />
                <span>{isUpdatingStatus ? 'Updating...' : 'Confirm Status Update'}</span>
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: VIEW & PRINT OFFICIAL A4 TRANSPORT WAYBILL / TRANSIT SLIP */}
      {/* ========================================================================= */}
      {viewEntry && (
        <Dialog
          isOpen={isViewOpen}
          onClose={() => setIsViewOpen(false)}
          title={`Transport Waybill: ${viewEntry.lr_no}`}
          maxWidth="full"
        >
          <div className="space-y-4">
            {/* Top Toolbar */}
            <div className="flex justify-between items-center pb-2.5 border-b border-border bg-surface p-2.5 rounded no-print">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-accent px-2.5 py-1 rounded bg-accent/10 border border-accent/20 flex items-center gap-1.5">
                  <FileText size={13} />
                  <span>Official Lorry Transit Waybill</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    viewEntry.status === 'delivered'
                      ? 'bg-success-light text-success'
                      : 'bg-accent/15 text-accent'
                  }`}
                >
                  {viewEntry.status.toUpperCase()}
                </span>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={handlePrintWaybill}
                disabled={isPrinting}
                className="gap-1.5 font-bold shadow-xs text-xs"
              >
                <Printer size={15} />
                <span>{isPrinting ? 'Printing...' : 'Print A4 Waybill'}</span>
              </Button>
            </div>

            {/* A4 PRINT CONTAINER */}
            <div id="transport-waybill-print-area" className="printable-area">
              <div className="p-6 bg-white text-gray-900 border-2 border-gray-800 rounded-sm shadow-xs space-y-4 print:p-0 print:border-none print:shadow-none text-xs font-sans max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-3">
                  <div>
                    <VnaLogo size="md" />
                    <div className="font-extrabold text-base uppercase text-gray-900 mt-1">VNA TRADERS</div>
                    <div className="text-[11px] text-gray-600 leading-tight">
                      Fireworks Wholesale &amp; Distribution<br />
                      Jeermangalam, Hosur, Krishnagiri Dist, Tamil Nadu - 635109<br />
                      Phone: +91 94431 23456 / +91 94432 98765<br />
                      <strong>GSTIN: 33ACSPV5299F1Z5</strong> • State Code: 33 (Tamil Nadu)
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-800 font-bold text-xs uppercase tracking-wider inline-block">
                      LORRY TRANSIT WAYBILL &amp; CONSIGNMENT NOTE
                    </span>
                    <div className="text-lg font-black font-mono text-gray-900 mt-1">LR: {viewEntry.lr_no}</div>
                    <div className="text-xs text-gray-600">
                      Dispatch Date: <strong>{formatDateDMY(viewEntry.dispatch_date)}</strong>
                    </div>
                    {viewEntry.so_no && (
                      <div className="text-xs text-gray-600">
                        Ref Sale Order: <strong>{viewEntry.so_no}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* Logistics Carrier Grid */}
                <div className="grid grid-cols-2 gap-4 border border-gray-300 p-3 rounded-sm bg-gray-50 text-xs">
                  <div>
                    <span className="font-bold uppercase text-[10px] text-gray-500 tracking-wider">
                      CONSIGNOR (SENDER)
                    </span>
                    <div className="font-extrabold text-gray-900 mt-0.5">VNA TRADERS - HOSUR</div>
                    <div className="text-gray-700">Jeermangalam Godown, Hosur, TN - 635109</div>
                    <div className="text-gray-700">GSTIN: 33ACSPV5299F1Z5 • Phone: 94431 23456</div>
                    <div className="text-gray-700 mt-1 font-semibold">
                      Source Station: {viewEntry.source_location || 'Hosur Central Godown'}
                    </div>
                  </div>

                  <div>
                    <span className="font-bold uppercase text-[10px] text-gray-500 tracking-wider">
                      CONSIGNEE (RECEIVER)
                    </span>
                    <div className="font-extrabold text-gray-900 mt-0.5">{viewEntry.consignee_name}</div>
                    <div className="text-gray-700">{viewEntry.consignee_address || 'Town Booking Office'}</div>
                    <div className="text-gray-700">Phone: {viewEntry.consignee_phone || 'N/A'}</div>
                    {viewEntry.consignee_gstin && (
                      <div className="text-gray-700">GSTIN: {viewEntry.consignee_gstin}</div>
                    )}
                    <div className="text-gray-900 mt-1 font-extrabold">
                      Destination Station: {viewEntry.destination}
                    </div>
                  </div>
                </div>

                {/* Transport & Carrier Details */}
                <div className="grid grid-cols-4 gap-2 border border-gray-300 p-2.5 rounded-sm text-xs">
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold">Transporter</span>
                    <div className="font-bold text-gray-900">{viewEntry.transport_name}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold">Vehicle / Lorry No</span>
                    <div className="font-mono font-bold text-gray-900">{viewEntry.vehicle_no || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold">Driver Phone</span>
                    <div className="font-mono font-bold text-gray-900">{viewEntry.driver_phone || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold">Freight Terms</span>
                    <div className="font-bold uppercase text-gray-900">
                      {viewEntry.freight_type.replace('_', ' ')}
                    </div>
                  </div>
                </div>

                {/* Consignment Particulars Table */}
                <table className="w-full border-collapse border border-gray-300 text-xs">
                  <thead className="bg-gray-100 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="border border-gray-300 p-2 text-center w-12">S.No</th>
                      <th className="border border-gray-300 p-2 text-left">Description of Fireworks Consignment</th>
                      <th className="border border-gray-300 p-2 text-center">HSN Code</th>
                      <th className="border border-gray-300 p-2 text-center">No. of Cartons / Boxes</th>
                      <th className="border border-gray-300 p-2 text-right">Approx Weight</th>
                      <th className="border border-gray-300 p-2 text-right">Declared Value (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 p-2 text-center font-bold">1</td>
                      <td className="border border-gray-300 p-2">
                        <div className="font-bold text-gray-900">
                          Class 1.4G Sparklers &amp; Fireworks Articles
                        </div>
                        <div className="text-[11px] text-gray-600 mt-0.5">
                          {viewEntry.items_summary || 'Standard Brand Certified Fireworks / Gift Boxes'}
                        </div>
                      </td>
                      <td className="border border-gray-300 p-2 text-center font-mono font-bold">3604</td>
                      <td className="border border-gray-300 p-2 text-center font-bold text-sm">
                        {viewEntry.total_boxes} Cartons
                      </td>
                      <td className="border border-gray-300 p-2 text-right font-mono">
                        {viewEntry.total_weight_kg ? `${viewEntry.total_weight_kg} kg` : 'As per lorry'}
                      </td>
                      <td className="border border-gray-300 p-2 text-right font-mono font-bold text-sm">
                        {formatINR(viewEntry.consignment_value)}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Freight Charges Summary */}
                <div className="flex justify-between items-start border border-gray-300 p-3 rounded-sm bg-gray-50 text-xs">
                  <div className="space-y-1">
                    <span className="font-bold uppercase text-[10px] text-gray-500">Logistics &amp; Safety Remarks</span>
                    <p className="text-[11px] text-gray-600 max-w-md">
                      Explosive Rules 2008 Compliant. Goods packed in strong double-cardboard cartons. Keep away from
                      heat, fire, and direct sunlight.
                    </p>
                    {viewEntry.delivery_remarks && (
                      <p className="text-[11px] text-green-700 font-semibold mt-1">
                        Delivery Note: {viewEntry.delivery_remarks}
                      </p>
                    )}
                  </div>

                  <div className="w-56 space-y-1 font-mono text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Freight Charges:</span>
                      <span>{formatINR(viewEntry.freight_amount)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Hamali / Coolie:</span>
                      <span>{formatINR(viewEntry.loading_charges || 0)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-sm text-gray-900 border-t border-gray-300 pt-1">
                      <span>Total Freight:</span>
                      <span>{formatINR(viewEntry.total_charges)}</span>
                    </div>
                  </div>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-6 pt-6 text-center text-xs">
                  <div>
                    <div className="border-t border-gray-400 pt-1 font-bold text-gray-800">
                      Consignor Dispatch In-Charge
                    </div>
                    <div className="text-[10px] text-gray-500">VNA Traders, Hosur</div>
                  </div>
                  <div>
                    <div className="border-t border-gray-400 pt-1 font-bold text-gray-800">
                      Lorry Driver / Transporter Sign
                    </div>
                    <div className="text-[10px] text-gray-500">{viewEntry.transport_name}</div>
                  </div>
                  <div>
                    <div className="border-t border-gray-400 pt-1 font-bold text-gray-800">
                      Consignee Receiver's Stamp
                    </div>
                    <div className="text-[10px] text-gray-500">Date &amp; Signature</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* HIDDEN PRINT CONTAINER: WAREHOUSE DAILY DISPATCH & LOADING SHEET */}
      {/* ========================================================================= */}
      <div id="transport-manifest-print-area" className="printable-area hidden">
        <div className="p-6 bg-white text-gray-900 border-2 border-gray-800 rounded-sm space-y-4 print:p-0 print:border-none text-xs font-sans max-w-4xl mx-auto">
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-2">
            <div>
              <VnaLogo size="sm" />
              <div className="font-extrabold text-sm uppercase text-gray-900 mt-1">VNA TRADERS - HOSUR</div>
              <div className="text-[10px] text-gray-600">
                DAILY LORRY DISPATCH &amp; CONSIGNMENT LOADING MANIFEST • GSTIN: 33ACSPV5299F1Z5
              </div>
            </div>
            <div className="text-right">
              <span className="font-bold uppercase text-[10px] text-gray-600">Date:</span>
              <strong className="text-xs ml-1">{new Date().toLocaleDateString('en-IN')}</strong>
            </div>
          </div>

          <table className="w-full border-collapse border border-gray-300 text-[11px]">
            <thead className="bg-gray-100 font-bold uppercase text-[10px]">
              <tr>
                <th className="border border-gray-300 p-1.5 text-center">S.No</th>
                <th className="border border-gray-300 p-1.5 text-left">LR No</th>
                <th className="border border-gray-300 p-1.5 text-left">Carrier</th>
                <th className="border border-gray-300 p-1.5 text-left">Vehicle No</th>
                <th className="border border-gray-300 p-1.5 text-left">Consignee &amp; Destination</th>
                <th className="border border-gray-300 p-1.5 text-center">Boxes</th>
                <th className="border border-gray-300 p-1.5 text-right">Value (₹)</th>
                <th className="border border-gray-300 p-1.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e, idx) => (
                <tr key={e.id}>
                  <td className="border border-gray-300 p-1.5 text-center">{idx + 1}</td>
                  <td className="border border-gray-300 p-1.5 font-mono font-bold">{e.lr_no}</td>
                  <td className="border border-gray-300 p-1.5">{e.transport_name}</td>
                  <td className="border border-gray-300 p-1.5 font-mono">{e.vehicle_no || '-'}</td>
                  <td className="border border-gray-300 p-1.5">
                    <strong>{e.consignee_name}</strong>, {e.destination}
                  </td>
                  <td className="border border-gray-300 p-1.5 text-center font-bold">{e.total_boxes}</td>
                  <td className="border border-gray-300 p-1.5 text-right font-mono font-bold">
                    {formatINR(e.consignment_value)}
                  </td>
                  <td className="border border-gray-300 p-1.5 text-center font-semibold uppercase text-[10px]">
                    {e.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center border-t border-gray-300 pt-3 text-xs">
            <div>
              Total Consignments: <strong>{filteredEntries.length}</strong> | Total Cartons:{' '}
              <strong>{filteredEntries.reduce((s, e) => s + (e.total_boxes || 0), 0)}</strong>
            </div>
            <div>
              Total Cargo Value:{' '}
              <strong className="font-mono">
                {formatINR(filteredEntries.reduce((s, e) => s + (e.consignment_value || 0), 0))}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
