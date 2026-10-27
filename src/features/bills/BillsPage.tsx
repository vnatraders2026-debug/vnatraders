import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useCartStore } from '@/features/billing/store';
import { db, getShopSettings } from '@/db';
import { Bill, BillItem, Profile, ShopSettings } from '@/types';
import { formatINR, formatISTDate, consolidateBillItems } from '@/lib/format';
import { checkBillEditPermission } from '@/lib/permissions';
import { ReceiptModal } from '@/features/billing/ReceiptModal';
import { WhatsAppModal } from '@/features/billing/WhatsAppModal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Search, Eye, Edit3, Printer, MessageSquare, RefreshCw } from 'lucide-react';
import { syncService } from '@/sync/syncService';
import { supabase, isConfigured } from '@/lib/supabase';

export const BillsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [bills, setBills] = useState<Bill[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPaymentMode, setFilterPaymentMode] = useState<string>('all');
  const [filterStaff, setFilterStaff] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');

  // Selected bill for viewing/reprint
  const [viewingBill, setViewingBill] = useState<{ bill: Bill; items: BillItem[] } | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [whatsAppBill, setWhatsAppBill] = useState<Bill | null>(null);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const allBills = await db.bills.orderBy('created_at').reverse().toArray();
      const allProfiles = await db.profiles.toArray();
      const profMap = new Map<string, Profile>();
      allProfiles.forEach((p) => profMap.set(p.id, p));

      setBills(allBills);
      setProfiles(profMap);

      const settings = await getShopSettings();
      setShopSettings(settings);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSyncCloud = async () => {
    setIsSyncing(true);
    try {
      await syncService.forceFreshPullFromSupabase();
      await loadData(true);
    } catch (err) {
      console.warn('Manual sync notice:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadData();

    // Pull latest bills from cloud when BillsPage opens
    if (navigator.onLine) {
      syncService.triggerSync().catch(console.warn);
    }

    const handleSyncEvent = () => {
      loadData(true);
    };

    window.addEventListener('bills-synced', handleSyncEvent);
    window.addEventListener('supabase-data-refreshed', handleSyncEvent);

    // Poll every 8 seconds to automatically show bills created on other devices
    const pollTimer = setInterval(() => {
      loadData(true);
    }, 8000);

    return () => {
      window.removeEventListener('bills-synced', handleSyncEvent);
      window.removeEventListener('supabase-data-refreshed', handleSyncEvent);
      clearInterval(pollTimer);
    };
  }, []);

  // Filtered bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Search query (bill no, customer name, phone)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNo = b.bill_no.toLowerCase().includes(q);
        const matchesName = b.customer_name?.toLowerCase().includes(q);
        const matchesPhone = b.customer_phone?.toLowerCase().includes(q);
        if (!matchesNo && !matchesName && !matchesPhone) return false;
      }

      // Payment mode filter
      if (filterPaymentMode !== 'all' && b.payment_mode !== filterPaymentMode) {
        return false;
      }

      // Staff filter
      if (filterStaff !== 'all' && b.created_by !== filterStaff) {
        return false;
      }

      // Date range filter
      if (dateRange !== 'all') {
        const billTime = new Date(b.created_at).getTime();
        const now = Date.now();
        if (dateRange === 'today') {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          if (billTime < startOfToday.getTime()) return false;
        } else if (dateRange === '7days') {
          if (now - billTime > 7 * 24 * 60 * 60 * 1000) return false;
        } else if (dateRange === '30days') {
          if (now - billTime > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }

      return true;
    });
  }, [bills, searchQuery, filterPaymentMode, filterStaff, dateRange]);

  const getBillItems = async (bill: Bill): Promise<BillItem[]> => {
    let rawItems: BillItem[] = [];

    // 1. Check local Dexie by bill.id
    try {
      rawItems = await db.bill_items.where('bill_id').equals(bill.id).toArray();
    } catch (e) {
      console.warn('Dexie bill_items query error:', e);
    }

    // 2. Check local Dexie by bill.bill_no
    if ((!rawItems || rawItems.length === 0) && bill.bill_no) {
      try {
        rawItems = await db.bill_items.where('bill_id').equals(bill.bill_no).toArray();
      } catch (e) {
        console.warn('Dexie bill_items bill_no query error:', e);
      }
    }

    // 3. Fallback: check db.outbox (if the bill is waiting in sync queue or was just created)
    if (!rawItems || rawItems.length === 0) {
      try {
        const allOutbox = await db.outbox.toArray();
        const outboxMatch = allOutbox.find(
          (o) =>
            o.payload?.id === bill.id ||
            o.payload?.bill_no === bill.bill_no ||
            (o.entity === 'bills' && (o.payload?.id === bill.id || o.payload?.bill_no === bill.bill_no))
        );
        if (
          outboxMatch &&
          Array.isArray(outboxMatch.payload?.items) &&
          outboxMatch.payload.items.length > 0
        ) {
          rawItems = outboxMatch.payload.items;
          await db.bill_items.bulkPut(rawItems);
        }
      } catch (oErr) {
        console.warn('Outbox items check fallback:', oErr);
      }
    }

    // 4. Fallback: fetch from Supabase if online
    if ((!rawItems || rawItems.length === 0) && navigator.onLine && isConfigured) {
      try {
        const { data: serverItems } = await supabase
          .from('bill_items')
          .select('*')
          .or(`bill_id.eq.${bill.id},bill_id.eq.${bill.bill_no}`);
        if (serverItems && serverItems.length > 0) {
          rawItems = serverItems as BillItem[];
          await db.bill_items.bulkPut(rawItems);
        }
      } catch (netErr) {
        console.warn('Remote bill_items fetch notice:', netErr);
      }
    }

    return consolidateBillItems(rawItems || []);
  };

  const handleOpenReceipt = async (bill: Bill) => {
    const items = await getBillItems(bill);
    setViewingBill({ bill, items });
  };

  const handleOpenDetailModal = async (bill: Bill) => {
    const items = await getBillItems(bill);
    setViewingBill({ bill, items });
    setIsDetailModalOpen(true);
  };

  const handleEditBill = async (bill: Bill) => {
    const items = await getBillItems(bill);
    useCartStore.getState().loadBillForEdit(bill, items);
    navigate('/billing');
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Header */}
      <div className="bg-surface border border-border rounded p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search bill no, customer, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 min-h-[40px] text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="grid grid-cols-3 gap-2 flex-1 md:w-auto">
            <Select
              value={filterPaymentMode}
              onChange={(e) => setFilterPaymentMode(e.target.value)}
              className="text-xs min-h-[40px]"
            >
              <option value="all">All Modes</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
            </Select>

            <Select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="text-xs min-h-[40px]"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="7days">Past 7 Days</option>
              <option value="30days">Past 30 Days</option>
            </Select>

            <Select
              value={filterStaff}
              onChange={(e) => setFilterStaff(e.target.value)}
              className="text-xs min-h-[40px]"
            >
              <option value="all">All Staff</option>
              {Array.from(profiles.values()).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleSyncCloud}
            disabled={isSyncing}
            className="min-h-[40px] px-3 text-xs text-accent border-accent/40 hover:bg-accent-light shrink-0"
            title="Sync latest bills from cloud across all devices"
          >
            <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Cloud'}</span>
          </Button>
        </div>
      </div>

      {/* Bill List State */}
      {loading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : filteredBills.length === 0 ? (
        <EmptyState
          message="No bills found for the selected search and filters"
          actionLabel="Create First Bill"
          onAction={() => navigate('/billing')}
        />
      ) : (
        <>
          {/* DESKTOP & TABLET TABLE */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill No</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total (₹)</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Billed By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBills.map((b) => {
                  const staff = profiles.get(b.created_by);
                  const editPermission = checkBillEditPermission(b, user, currentTimeMs);

                  return (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono font-semibold text-accent">
                        {b.bill_no}
                      </TableCell>
                      <TableCell className="text-xs text-text-muted">
                        {formatISTDate(b.created_at)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {b.customer_name ? (
                          <div>
                            <span className="font-medium text-text">{b.customer_name}</span>
                            {b.customer_phone && (
                              <span className="text-text-muted block">{b.customer_phone}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted">Walk-in</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatINR(b.total)}
                      </TableCell>
                      <TableCell className="uppercase text-xs font-medium text-text">
                        {b.payment_mode}
                      </TableCell>
                      <TableCell className="text-xs text-text">
                        {staff ? staff.full_name : 'Staff'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded ${
                            b.sync_status === 'synced'
                              ? 'bg-success-light text-success'
                              : 'bg-warning-light text-warning'
                          }`}
                        >
                          {b.sync_status === 'synced' ? 'Synced' : 'Pending'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenDetailModal(b)}
                            className="p-1.5 text-text-muted hover:text-text rounded hover:bg-background"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleOpenReceipt(b)}
                            className="p-1.5 text-text-muted hover:text-text rounded hover:bg-background"
                            title="Reprint Bill"
                          >
                            <Printer size={16} />
                          </button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!editPermission.canEdit}
                            disabledReason={editPermission.reason}
                            onClick={() => handleEditBill(b)}
                            className="min-h-[32px] py-1 text-xs"
                          >
                            <Edit3 size={14} />
                            <span>Edit</span>
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setWhatsAppBill(b);
                              setIsWhatsAppOpen(true);
                            }}
                            className="min-h-[32px] py-1 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                            title="Send Bill to WhatsApp"
                          >
                            <MessageSquare size={14} />
                            <span>WhatsApp</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* MOBILE CARDS LIST */}
          <div className="sm:hidden space-y-3">
            {filteredBills.map((b) => {
              const staff = profiles.get(b.created_by);
              const editPermission = checkBillEditPermission(b, user, currentTimeMs);

              return (
                <div key={b.id} className="bg-surface border border-border rounded p-3 space-y-2">
                  <div
                    className="flex justify-between items-start cursor-pointer group"
                    onClick={() => handleOpenDetailModal(b)}
                    title="Tap to view bill details"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-accent text-sm group-hover:underline">
                          {b.bill_no}
                        </span>
                        <span
                          className={`inline-block px-1.5 py-0.2 text-[10px] font-semibold rounded ${
                            b.sync_status === 'synced'
                              ? 'bg-success-light text-success'
                              : 'bg-warning-light text-warning'
                          }`}
                        >
                          {b.sync_status === 'synced' ? 'Synced' : 'Pending'}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {formatISTDate(b.created_at)}
                      </p>
                    </div>
                    <span className="text-base font-bold tabular-nums text-text">
                      {formatINR(b.total)}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs text-text-muted">
                    <span>
                      Customer: <span className="font-medium text-text">{b.customer_name || 'Walk-in'}</span>
                    </span>
                    <span className="uppercase font-medium text-text">
                      {b.payment_mode}
                    </span>
                  </div>

                  <div className="flex flex-col xs:flex-row justify-between items-start xs:items-center pt-2 border-t border-border gap-2">
                    <span className="text-xs text-text-muted">
                      By {staff ? staff.full_name : 'Staff'}
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 w-full xs:w-auto justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleOpenDetailModal(b)}
                        className="min-h-[34px] py-1 px-2.5 text-xs gap-1"
                        title="View Bill Details"
                      >
                        <Eye size={14} />
                        <span>View</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleOpenReceipt(b)}
                        className="min-h-[34px] py-1 px-2.5 text-xs gap-1"
                        title="Print Receipt"
                      >
                        <Printer size={14} />
                        <span>Print</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!editPermission.canEdit}
                        disabledReason={editPermission.reason}
                        onClick={() => handleEditBill(b)}
                        className="min-h-[34px] py-1 px-2.5 text-xs gap-1"
                        title="Edit Bill"
                      >
                        <Edit3 size={14} />
                        <span>Edit</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setWhatsAppBill(b);
                          setIsWhatsAppOpen(true);
                        }}
                        className="min-h-[34px] py-1 px-2.5 text-xs gap-1 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                        title="Send Bill to WhatsApp"
                      >
                        <MessageSquare size={14} />
                        <span>WhatsApp</span>
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* BILL DETAILS MODAL */}
      {isDetailModalOpen && viewingBill && (
        <Dialog
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Bill: ${viewingBill.bill.bill_no}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            {/* Bill Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-background border border-border rounded text-xs">
              <div>
                <span className="text-text-muted block">Date & Time:</span>
                <span className="font-medium text-text">{formatISTDate(viewingBill.bill.created_at)}</span>
              </div>
              <div>
                <span className="text-text-muted block">Customer:</span>
                <span className="font-medium text-text">{viewingBill.bill.customer_name || 'Walk-in'}</span>
                {viewingBill.bill.customer_phone && (
                  <span className="text-text-muted block text-[11px]">{viewingBill.bill.customer_phone}</span>
                )}
              </div>
              <div>
                <span className="text-text-muted block">Payment Mode:</span>
                <span className="font-medium uppercase text-text">{viewingBill.bill.payment_mode}</span>
              </div>
            </div>

            {/* Items list */}
            <div>
              <h3 className="text-xs font-semibold text-text uppercase mb-2">Purchased Items</h3>
              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-background border-b border-border">
                    <tr>
                      <th className="p-2 text-left">Item Name</th>
                      <th className="p-2 text-right">Qty</th>
                      <th className="p-2 text-right">Unit Price</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {viewingBill.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-xs text-text-muted">
                          No items found for this bill
                        </td>
                      </tr>
                    ) : (
                      viewingBill.items.map((item) => (
                        <tr key={item.id}>
                          <td className="p-2 font-medium">
                            {item.product_name}
                            {item.brand && item.brand !== 'General' && item.brand !== 'Standard' && (
                              <span className="text-[10px] text-text-muted block">{item.brand}</span>
                            )}
                          </td>
                          <td className="p-2 text-right tabular-nums">{item.qty}</td>
                          <td className="p-2 text-right tabular-nums">{formatINR(item.unit_price)}</td>
                          <td className="p-2 text-right tabular-nums font-semibold">{formatINR(item.line_total)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end text-xs">
              <div className="w-48 space-y-1">
                <div className="flex justify-between text-text-muted">
                  <span>Subtotal:</span>
                  <span className="tabular-nums">{formatINR(viewingBill.bill.subtotal)}</span>
                </div>
                {viewingBill.bill.discount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Discount:</span>
                    <span className="tabular-nums">- {formatINR(viewingBill.bill.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm text-text pt-1.5 border-t border-border">
                  <span>Grand Total:</span>
                  <span className="tabular-nums text-accent">{formatINR(viewingBill.bill.total)}</span>
                </div>
              </div>
            </div>

            {/* Modal Actions: Only Close and Print (NO Edit etc) */}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  handleOpenReceipt(viewingBill.bill);
                }}
                className="text-xs min-h-[34px] gap-1"
                title="Print Receipt"
              >
                <Printer size={14} />
                <span>Print</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsDetailModalOpen(false)}
                className="text-xs min-h-[34px]"
              >
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* REPRINT RECEIPT MODAL */}
      {viewingBill && !isDetailModalOpen && shopSettings && user && (
        <ReceiptModal
          bill={viewingBill.bill}
          items={viewingBill.items}
          settings={shopSettings}
          currentUser={user}
          billedBy={
            viewingBill.bill.created_by
              ? profiles.get(viewingBill.bill.created_by)?.full_name ||
                profiles.get(viewingBill.bill.created_by)?.email ||
                (viewingBill.bill.created_by === user.id ? user.full_name || user.email : 'Staff')
              : user.full_name || user.email || 'Admin'
          }
          onNewBill={() => {
            setViewingBill(null);
            navigate('/billing');
          }}
          onEditBill={() => {
            handleEditBill(viewingBill.bill);
            setViewingBill(null);
          }}
          onClose={() => setViewingBill(null)}
        />
      )}

      {/* WHATSAPP BILL SHARE MODAL */}
      {isWhatsAppOpen && whatsAppBill && (
        <WhatsAppModal
          isOpen={isWhatsAppOpen}
          onClose={() => {
            setIsWhatsAppOpen(false);
            setWhatsAppBill(null);
          }}
          bill={whatsAppBill}
          settings={shopSettings || undefined}
        />
      )}
    </div>
  );
};
