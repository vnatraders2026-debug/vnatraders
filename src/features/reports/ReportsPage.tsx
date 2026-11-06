import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/db';
import { Bill, BillItem, Profile } from '@/types';
import { formatINR, formatISTDate } from '@/lib/format';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Download, Printer, Filter } from 'lucide-react';

type ReportTab = 'summary' | 'products' | 'staff' | 'payments' | 'register';

export const ReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('summary');
  const [bills, setBills] = useState<Bill[]>([]);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);

  // Default date filter: First of current month to today
  const todayStr = new Date().toISOString().slice(0, 10);
  const firstOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [fromDate, setFromDate] = useState(firstOfMonthStr);
  const [toDate, setToDate] = useState(todayStr);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const allBills = await db.bills.toArray();
        const allItems = await db.bill_items.toArray();
        const allProfiles = await db.profiles.toArray();
        const profMap = new Map<string, Profile>();
        allProfiles.forEach((p) => profMap.set(p.id, p));

        setBills(allBills);
        setBillItems(allItems);
        setProfiles(profMap);
      } finally {
        setLoading(false);
      }
    }
    loadData();

    const handleSync = () => loadData();
    window.addEventListener('bills-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('bills-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, []);

  // Filter bills within selected date range (inclusive)
  const filteredBills = useMemo(() => {
    const fromTime = new Date(`${fromDate}T00:00:00`).getTime();
    const toTime = new Date(`${toDate}T23:59:59.999`).getTime();

    return bills.filter((b) => {
      const billTime = new Date(b.created_at).getTime();
      return billTime >= fromTime && billTime <= toTime;
    });
  }, [bills, fromDate, toDate]);

  const filteredBillIds = useMemo(() => {
    return new Set(filteredBills.map((b) => b.id));
  }, [filteredBills]);

  const filteredItems = useMemo(() => {
    return billItems.filter((i) => filteredBillIds.has(i.bill_id));
  }, [billItems, filteredBillIds]);

  // 1. Sales Summary (Daily aggregation)
  const salesSummaryData = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    filteredBills.forEach((b) => {
      const day = b.created_at.slice(0, 10);
      const curr = map.get(day) || { total: 0, count: 0 };
      map.set(day, { total: curr.total + b.total, count: curr.count + 1 });
    });

    return Array.from(map.entries())
      .map(([date, data]) => ({
        date,
        count: data.count,
        total: data.total,
        avg: data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredBills]);

  // 2. Product-wise Sales
  const productSalesData = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    filteredItems.forEach((i) => {
      const curr = map.get(i.product_name) || { qty: 0, revenue: 0 };
      map.set(i.product_name, {
        qty: curr.qty + i.qty,
        revenue: curr.revenue + i.line_total,
      });
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        qty: data.qty,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems]);

  // 3. Staff-wise Sales
  const staffSalesData = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    filteredBills.forEach((b) => {
      const staffName = profiles.get(b.created_by)?.full_name || 'Staff Member';
      const curr = map.get(staffName) || { count: 0, total: 0 };
      map.set(staffName, { count: curr.count + 1, total: curr.total + b.total });
    });

    return Array.from(map.entries())
      .map(([staff, data]) => ({
        staff,
        count: data.count,
        total: data.total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredBills, profiles]);

  // 4. Payment Mode Split
  const paymentModeData = useMemo(() => {
    const totalRevenue = filteredBills.reduce((acc, b) => acc + b.total, 0);
    const map = new Map<string, { count: number; total: number }>();
    filteredBills.forEach((b) => {
      const curr = map.get(b.payment_mode) || { count: 0, total: 0 };
      map.set(b.payment_mode, { count: curr.count + 1, total: curr.total + b.total });
    });

    return Array.from(map.entries()).map(([mode, data]) => ({
      mode: mode.toUpperCase(),
      count: data.count,
      total: data.total,
      share: totalRevenue > 0 ? Math.round((data.total / totalRevenue) * 100) : 0,
    }));
  }, [filteredBills]);

  // Export current report as CSV
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = `report_${activeTab}_${fromDate}_to_${toDate}.csv`;

    if (activeTab === 'summary') {
      headers = ['Date', 'Bill Count', 'Total Sales (INR)', 'Average Bill (INR)'];
      rows = salesSummaryData.map((d) => [d.date, String(d.count), String(d.total), String(d.avg)]);
    } else if (activeTab === 'products') {
      headers = ['Product Name', 'Quantity Sold', 'Total Revenue (INR)'];
      rows = productSalesData.map((d) => [`"${d.name.replace(/"/g, '""')}"`, String(d.qty), String(d.revenue)]);
    } else if (activeTab === 'staff') {
      headers = ['Staff Name', 'Bills Handled', 'Total Sales (INR)'];
      rows = staffSalesData.map((d) => [`"${d.staff}"`, String(d.count), String(d.total)]);
    } else if (activeTab === 'payments') {
      headers = ['Payment Mode', 'Transaction Count', 'Total Amount (INR)', 'Share Percentage'];
      rows = paymentModeData.map((d) => [d.mode, String(d.count), String(d.total), `${d.share}%`]);
    } else if (activeTab === 'register') {
      headers = ['Bill No', 'Date', 'Customer', 'Items Count', 'Subtotal', 'Discount', 'Total', 'Payment Mode', 'Staff'];
      rows = filteredBills.map((b) => [
        b.bill_no,
        formatISTDate(b.created_at),
        `"${b.customer_name || 'Walk-in'}"`,
        String(billItems.filter((i) => i.bill_id === b.id).length),
        String(b.subtotal),
        String(b.discount),
        String(b.total),
        b.payment_mode,
        `"${profiles.get(b.created_by)?.full_name || 'Staff'}"`,
      ]);
    }

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      {/* Date Filter & Export Header */}
      <div className="bg-surface border border-border rounded p-4 flex flex-col md:flex-row gap-3 items-center justify-between print:hidden">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Filter size={14} />
            <span>Range:</span>
          </div>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="text-xs min-h-[38px] w-36"
          />
          <span className="text-xs text-text-muted">to</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="text-xs min-h-[38px] w-36"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <Button variant="secondary" size="sm" onClick={handlePrint}>
            <Printer size={14} />
            <span>Print Report</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCSV}>
            <Download size={14} />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-border bg-surface rounded-t px-2 overflow-x-auto print:hidden">
        {[
          { id: 'summary', label: 'Sales Summary' },
          { id: 'products', label: 'Product-wise Sales' },
          { id: 'staff', label: 'Staff-wise Sales' },
          { id: 'payments', label: 'Payment Mode Split' },
          { id: 'register', label: 'Bill Register' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as ReportTab)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap min-h-[44px] ${
              activeTab === tab.id
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report Content */}
      <div className="bg-surface border border-border rounded-b p-4">
        {loading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : (
          <>
            {/* 1. SALES SUMMARY */}
            {activeTab === 'summary' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Bill Count</TableHead>
                    <TableHead className="text-right">Total Revenue (₹)</TableHead>
                    <TableHead className="text-right">Avg Bill Value (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesSummaryData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-text-muted py-6">
                        No transactions found for this date range
                      </TableCell>
                    </TableRow>
                  ) : (
                    salesSummaryData.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell className="font-mono">{row.date}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatINR(row.total)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-text-muted">
                          {formatINR(row.avg)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}

            {/* 2. PRODUCT-WISE SALES */}
            {activeTab === 'products' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Total Revenue (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productSalesData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-text-muted py-6">
                        No cracker sales recorded for this date range
                      </TableCell>
                    </TableRow>
                  ) : (
                    productSalesData.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.qty}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatINR(row.revenue)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}

            {/* 3. STAFF-WISE SALES */}
            {activeTab === 'staff' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead className="text-right">Bills Handled</TableHead>
                    <TableHead className="text-right">Total Sales (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffSalesData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-text-muted py-6">
                        No records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    staffSalesData.map((row) => (
                      <TableRow key={row.staff}>
                        <TableCell className="font-medium">{row.staff}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatINR(row.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}

            {/* 4. PAYMENT MODE SPLIT */}
            {activeTab === 'payments' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Mode</TableHead>
                    <TableHead className="text-right">Transaction Count</TableHead>
                    <TableHead className="text-right">Total Amount (₹)</TableHead>
                    <TableHead className="text-right">Share (%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentModeData.map((row) => (
                    <TableRow key={row.mode}>
                      <TableCell className="font-semibold text-text">{row.mode}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatINR(row.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.share}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* 5. BILL REGISTER */}
            {activeTab === 'register' && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill No</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Staff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-text-muted py-6">
                        No bills in register for this range
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBills.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono font-medium text-accent">
                          {b.bill_no}
                        </TableCell>
                        <TableCell className="text-xs text-text-muted">
                          {formatISTDate(b.created_at)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {b.customer_name || 'Walk-in'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatINR(b.subtotal)}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">
                          {b.discount > 0 ? `- ${formatINR(b.discount)}` : '0.00'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatINR(b.total)}
                        </TableCell>
                        <TableCell className="uppercase text-xs">{b.payment_mode}</TableCell>
                        <TableCell className="text-xs text-text-muted">
                          {profiles.get(b.created_by)?.full_name || 'Staff'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </div>
    </div>
  );
};
