import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useCartStore } from '@/features/billing/store';
import { db, getShopSettings } from '@/db';
import { Bill, BillItem, Profile, ShopSettings } from '@/types';
import { formatINR, formatISTDate } from '@/lib/format';
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
import { Search, Eye, Edit3, Printer, History, MessageSquare } from 'lucide-react';

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

  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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

  const handleOpenReceipt = async (bill: Bill) => {
    const items = await db.bill_items.where('bill_id').equals(bill.id).toArray();
    setViewingBill({ bill, items });
  };

  const handleOpenDetailModal = async (bill: Bill) => {
    const items = await db.bill_items.where('bill_id').equals(bill.id).toArray();
    setViewingBill({ bill, items });
    setIsDetailModalOpen(true);
  };

  const handleEditBill = async (bill: Bill) => {
    const items = await db.bill_items.where('bill_id').equals(bill.id).toArray();
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

        <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
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
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono font-bold text-accent text-sm">
                        {b.bill_no}
                      </span>
                      <p className="text-[11px] text-text-muted">
                        {formatISTDate(b.created_at)}
                      </p>
                    </div>
                    <span className="text-base font-bold tabular-nums text-text">
                      {formatINR(b.total)}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs text-text-muted">
                    <span>
                      Customer: {b.customer_name || 'Walk-in'}
                    </span>
                    <span className="uppercase font-medium text-text">
                      {b.payment_mode}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-border">
                    <span className="text-xs text-text-muted">
                      By {staff ? staff.full_name : 'Staff'}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleOpenReceipt(b)}
                        className="min-h-[36px] py-1 text-xs"
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
                        className="min-h-[36px] py-1 text-xs"
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
                        className="min-h-[36px] py-1 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
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

      {/* BILL DETAILS MODAL (WITH EDIT HISTORY FOR ADMIN) */}
      {isDetailModalOpen && viewingBill && (
        <Dialog
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Bill Details: ${viewingBill.bill.bill_no}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            {/* Metadata summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-background border border-border rounded text-xs">
              <div>
                <span className="text-text-muted block">Created:</span>
                <span className="font-medium text-text">{formatISTDate(viewingBill.bill.created_at)}</span>
              </div>
              <div>
                <span className="text-text-muted block">Payment:</span>
                <span className="font-medium uppercase text-text">{viewingBill.bill.payment_mode}</span>
              </div>
              <div>
                <span className="text-text-muted block">Customer:</span>
                <span className="font-medium text-text">{viewingBill.bill.customer_name || 'Walk-in'}</span>
              </div>
              <div>
                <span className="text-text-muted block">Sync Status:</span>
                <span className="font-semibold text-success capitalize">{viewingBill.bill.sync_status || 'synced'}</span>
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
                      <th className="p-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {viewingBill.items.map((item) => (
                      <tr key={item.id}>
                        <td className="p-2">{item.product_name}</td>
                        <td className="p-2 text-right tabular-nums">{item.qty}</td>
                        <td className="p-2 text-right tabular-nums">{formatINR(item.unit_price)}</td>
                        <td className="p-2 text-right tabular-nums font-semibold">{formatINR(item.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end text-xs space-y-1">
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
                <div className="flex justify-between font-bold text-sm text-text pt-1 border-t border-border">
                  <span>Total:</span>
                  <span className="tabular-nums text-accent">{formatINR(viewingBill.bill.total)}</span>
                </div>
              </div>
            </div>

            {/* Admin Edit History */}
            {user?.role === 'admin' && (
              <div className="p-3 bg-background border border-border rounded text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-text">
                  <History size={14} />
                  <span>Audit / Edit History</span>
                </div>
                {viewingBill.bill.edited_at ? (
                  <p className="text-text-muted">
                    Last modified on {formatISTDate(viewingBill.bill.edited_at)} by{' '}
                    {profiles.get(viewingBill.bill.edited_by || '')?.full_name || 'Staff'}.
                  </p>
                ) : (
                  <p className="text-text-muted">Original bill record. No subsequent edits made.</p>
                )}
              </div>
            )}
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
