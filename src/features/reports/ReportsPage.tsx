import React, { useState, useEffect, useMemo } from 'react';
import { db, restoreMissingBills, initLocalDatabase } from '@/db';
import { Bill, BillItem, Profile, Product } from '@/types';
import { formatINR, formatISTDate, formatDateDMY, formatNumber } from '@/lib/format';
import { printFormattedElement } from '@/lib/printer/printService';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { VnaLogo } from '@/components/VnaLogo';
import {
  Download,
  Printer,
  Coins,
  Tag,
  TrendingUp,
  Receipt,
  Boxes,
  Percent,
  Search,
  FileText,
  CreditCard,
  UserCheck,
  RotateCcw,
} from 'lucide-react';

type ReportTab =
  | 'summary'
  | 'products'
  | 'brands'
  | 'gst'
  | 'payments'
  | 'staff'
  | 'register';

export const ReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('summary');
  const [bills, setBills] = useState<Bill[]>([]);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [registerSearch, setRegisterSearch] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  // Date filters
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const firstOfMonthStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const [fromDate, setFromDate] = useState(firstOfMonthStr);
  const [toDate, setToDate] = useState(todayStr);

  async function loadData() {
    setLoading(true);
    try {
      await initLocalDatabase();
      await restoreMissingBills();

      const [allBills, allItems, allProducts, allProfiles] = await Promise.all([
        db.bills.toArray(),
        db.bill_items.toArray(),
        db.products.toArray(),
        db.profiles.toArray(),
      ]);

      const profMap = new Map<string, Profile>();
      allProfiles.forEach((p) => profMap.set(p.id, p));

      setBills(allBills);
      setBillItems(allItems);
      setProducts(allProducts);
      setProfiles(profMap);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const handleSync = () => loadData();
    window.addEventListener('bills-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('bills-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, []);

  // Preset Date Range Helper
  const applyDatePreset = (preset: 'today' | 'yesterday' | '7days' | 'month' | 'last_month' | 'fy' | 'all') => {
    const cur = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const today = toYMD(cur);
      setFromDate(today);
      setToDate(today);
    } else if (preset === 'yesterday') {
      const yest = new Date(cur.getTime() - 24 * 60 * 60 * 1000);
      const yestStr = toYMD(yest);
      setFromDate(yestStr);
      setToDate(yestStr);
    } else if (preset === '7days') {
      const start = new Date(cur.getTime() - 7 * 24 * 60 * 60 * 1000);
      setFromDate(toYMD(start));
      setToDate(toYMD(cur));
    } else if (preset === 'month') {
      const start = new Date(cur.getFullYear(), cur.getMonth(), 1);
      setFromDate(toYMD(start));
      setToDate(toYMD(cur));
    } else if (preset === 'last_month') {
      const start = new Date(cur.getFullYear(), cur.getMonth() - 1, 1);
      const end = new Date(cur.getFullYear(), cur.getMonth(), 0);
      setFromDate(toYMD(start));
      setToDate(toYMD(end));
    } else if (preset === 'fy') {
      const currentYear = cur.getMonth() >= 3 ? cur.getFullYear() : cur.getFullYear() - 1;
      const start = new Date(currentYear, 3, 1);
      setFromDate(toYMD(start));
      setToDate(toYMD(cur));
    } else if (preset === 'all') {
      setFromDate('2024-01-01');
      setToDate(toYMD(cur));
    }
  };

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

  // Executive Period Metrics Summary
  const periodMetrics = useMemo(() => {
    const grossRevenue = filteredBills.reduce((acc, b) => acc + (b.total || 0), 0);
    const subtotal = filteredBills.reduce((acc, b) => acc + (b.subtotal || 0), 0);
    const discount = filteredBills.reduce((acc, b) => acc + (b.discount || 0), 0);
    const billCount = filteredBills.length;
    const boxesCount = filteredItems.reduce((acc, i) => acc + (i.qty || 0), 0);
    const aov = billCount > 0 ? grossRevenue / billCount : 0;

    return {
      grossRevenue,
      subtotal,
      discount,
      billCount,
      boxesCount,
      aov,
    };
  }, [filteredBills, filteredItems]);

  // 1. Sales Summary (Daily aggregation)
  const salesSummaryData = useMemo(() => {
    const map = new Map<string, { subtotal: number; discount: number; total: number; count: number }>();
    filteredBills.forEach((b) => {
      const day = b.created_at.slice(0, 10);
      const curr = map.get(day) || { subtotal: 0, discount: 0, total: 0, count: 0 };
      map.set(day, {
        subtotal: curr.subtotal + (b.subtotal || 0),
        discount: curr.discount + (b.discount || 0),
        total: curr.total + (b.total || 0),
        count: curr.count + 1,
      });
    });

    return Array.from(map.entries())
      .map(([date, data]) => ({
        date,
        count: data.count,
        subtotal: data.subtotal,
        discount: data.discount,
        total: data.total,
        avg: data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredBills]);

  // 2. Product-wise Sales
  const productSalesData = useMemo(() => {
    const prodMap = new Map<string, Product>();
    products.forEach((p) => prodMap.set(p.name.trim().toLowerCase(), p));

    const map = new Map<string, { brand: string; category: string; qty: number; revenue: number }>();
    filteredItems.forEach((i) => {
      const pName = i.product_name.trim();
      const pData = prodMap.get(pName.toLowerCase());
      const brand = i.brand || pData?.brand || 'Standard';
      const category = pData?.category || 'General';

      const curr = map.get(pName) || { brand, category, qty: 0, revenue: 0 };
      map.set(pName, {
        brand,
        category,
        qty: curr.qty + (i.qty || 0),
        revenue: curr.revenue + (i.line_total || 0),
      });
    });

    const totalRev = filteredBills.reduce((acc, b) => acc + (b.total || 0), 0) || 1;

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        brand: data.brand,
        category: data.category,
        qty: data.qty,
        revenue: data.revenue,
        sharePct: Math.round((data.revenue / totalRev) * 100),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems, products, filteredBills]);

  // 3. Brand Performance Report
  const brandPerformanceData = useMemo(() => {
    const map = new Map<string, { boxes: number; revenue: number; itemsCount: number }>();
    filteredItems.forEach((i) => {
      const bName = i.brand || 'Standard';
      const curr = map.get(bName) || { boxes: 0, revenue: 0, itemsCount: 0 };
      map.set(bName, {
        boxes: curr.boxes + (i.qty || 0),
        revenue: curr.revenue + (i.line_total || 0),
        itemsCount: curr.itemsCount + 1,
      });
    });

    const totalRev = filteredBills.reduce((acc, b) => acc + (b.total || 0), 0) || 1;

    return Array.from(map.entries())
      .map(([brand, data]) => ({
        brand,
        boxes: data.boxes,
        revenue: data.revenue,
        itemsCount: data.itemsCount,
        sharePct: Math.round((data.revenue / totalRev) * 100),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems, filteredBills]);

  // 4. GST & Tax Report (Fireworks HSN 3604: 18% GST)
  const gstReportData = useMemo(() => {
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    filteredBills.forEach((b) => {
      const taxable = Math.round((b.total / 1.18) * 100) / 100;
      const tax = b.total - taxable;
      totalTaxable += taxable;
      // Default Tamil Nadu Intra-State: CGST 9% + SGST 9%
      totalCgst += tax / 2;
      totalSgst += tax / 2;
    });

    return {
      taxableAmount: totalTaxable,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
      totalTax: totalCgst + totalSgst + totalIgst,
      totalGross: filteredBills.reduce((acc, b) => acc + (b.total || 0), 0),
      hsnCode: '3604',
      taxRate: '18% (CGST 9% + SGST 9%)',
    };
  }, [filteredBills]);

  // 5. Payment Mode Split
  const paymentModeData = useMemo(() => {
    const totalRevenue = filteredBills.reduce((acc, b) => acc + (b.total || 0), 0);
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

  // 6. Staff-wise Sales
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
        avgBill: data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredBills, profiles]);

  // 7. Filtered Bill Register with search
  const registerBills = useMemo(() => {
    if (!registerSearch.trim()) return filteredBills;
    const q = registerSearch.toLowerCase().trim();
    return filteredBills.filter(
      (b) =>
        b.bill_no.toLowerCase().includes(q) ||
        (b.customer_name && b.customer_name.toLowerCase().includes(q)) ||
        (b.customer_phone && b.customer_phone.includes(q)) ||
        b.payment_mode.toLowerCase().includes(q)
    );
  }, [filteredBills, registerSearch]);

  // Export current report as CSV
  const handleExportCSV = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    const filename = `VNA_Traders_${activeTab}_report_${fromDate}_to_${toDate}.csv`;

    if (activeTab === 'summary') {
      headers = ['Date', 'Bill Count', 'Gross Subtotal (INR)', 'Discount Allowed (INR)', 'Net Sales (INR)', 'Average Bill (INR)'];
      rows = salesSummaryData.map((d) => [d.date, String(d.count), String(d.subtotal), String(d.discount), String(d.total), String(Math.round(d.avg * 100) / 100)]);
    } else if (activeTab === 'products') {
      headers = ['Product Name', 'Brand', 'Category', 'Quantity Sold (Boxes)', 'Total Revenue (INR)', 'Share %'];
      rows = productSalesData.map((d) => [`"${d.name.replace(/"/g, '""')}"`, d.brand, d.category, String(d.qty), String(d.revenue), `${d.sharePct}%`]);
    } else if (activeTab === 'brands') {
      headers = ['Brand Name', 'Boxes Sold', 'Transaction Appearances', 'Revenue (INR)', 'Turnover Share %'];
      rows = brandPerformanceData.map((d) => [d.brand, String(d.boxes), String(d.itemsCount), String(d.revenue), `${d.sharePct}%`]);
    } else if (activeTab === 'gst') {
      headers = ['Description', 'HSN Code', 'Tax Rate', 'Taxable Turnover (INR)', 'CGST 9% (INR)', 'SGST 9% (INR)', 'Total Tax (INR)', 'Gross Turnover (INR)'];
      rows = [[
        'Fireworks & Pyrotechnics',
        gstReportData.hsnCode,
        gstReportData.taxRate,
        String(Math.round(gstReportData.taxableAmount * 100) / 100),
        String(Math.round(gstReportData.cgst * 100) / 100),
        String(Math.round(gstReportData.sgst * 100) / 100),
        String(Math.round(gstReportData.totalTax * 100) / 100),
        String(gstReportData.totalGross),
      ]];
    } else if (activeTab === 'payments') {
      headers = ['Payment Mode', 'Transaction Count', 'Total Amount (INR)', 'Share Percentage'];
      rows = paymentModeData.map((d) => [d.mode, String(d.count), String(d.total), `${d.share}%`]);
    } else if (activeTab === 'staff') {
      headers = ['Staff Name', 'Bills Handled', 'Total Sales (INR)', 'Average Bill Value (INR)'];
      rows = staffSalesData.map((d) => [`"${d.staff}"`, String(d.count), String(d.total), String(Math.round(d.avgBill * 100) / 100)]);
    } else if (activeTab === 'register') {
      headers = ['Bill No', 'Date', 'Customer Name', 'Phone', 'Items Count', 'Subtotal (INR)', 'Discount (INR)', 'Grand Total (INR)', 'Payment Mode', 'Staff'];
      rows = filteredBills.map((b) => [
        b.bill_no,
        formatISTDate(b.created_at),
        `"${b.customer_name || 'Counter Walk-in'}"`,
        b.customer_phone || '-',
        String(billItems.filter((i) => i.bill_id === b.id).length),
        String(b.subtotal),
        String(b.discount),
        String(b.total),
        b.payment_mode.toUpperCase(),
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

  // High-quality isolated A4 print
  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printFormattedElement('reports-print-area', {
        paperSize: 'a4',
        title: `VNA_Traders_${activeTab}_report`,
      });
    } catch {
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="space-y-5 pb-12 select-none">
      {/* Top Header: Shop branding & Date range controls */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3 shadow-xs print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <VnaLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-text tracking-tight">
                  VNA TRADERS
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                  Sales Reports &amp; Registers
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Hosur Main Depot • GSTIN: 33ACSPV5299F1Z5
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handlePrint} disabled={isPrinting} className="gap-1.5 font-bold">
              <Printer size={14} />
              <span>{isPrinting ? 'Printing...' : 'Print Report (A4)'}</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportCSV} className="gap-1.5 font-bold">
              <Download size={14} />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>

        {/* Quick Date Presets Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border/40">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className="text-text-muted text-[11px] mr-1">Presets:</span>
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: '7days', label: 'Last 7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'fy', label: 'FY 2026-27' },
              { id: 'all', label: 'All Records' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyDatePreset(p.id as any)}
                className="px-2.5 py-1 rounded bg-background border border-border text-text-muted hover:text-text hover:bg-surface text-[11px] font-bold transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Explicit Custom Date Pickers */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-text-muted text-[11px]">From:</span>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="text-xs min-h-[32px] w-36 py-0.5"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-text-muted text-[11px]">To:</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="text-xs min-h-[32px] w-36 py-0.5"
              />
            </div>
            <button
              type="button"
              onClick={loadData}
              className="p-1.5 rounded hover:bg-border/60 text-text-muted hover:text-text"
              title="Reload report data"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* EXECUTIVE PERIOD KPI SUMMARY HIGHLIGHT CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>Net Turnover</span>
            <TrendingUp size={13} className="text-accent" />
          </div>
          <div className="text-base sm:text-lg font-black font-mono tabular-nums text-accent">
            {formatINR(periodMetrics.grossRevenue)}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>Bills Count</span>
            <Receipt size={13} className="text-text-muted" />
          </div>
          <div className="text-base sm:text-lg font-black font-mono tabular-nums text-text">
            {periodMetrics.billCount}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>Boxes Sold</span>
            <Boxes size={13} className="text-accent" />
          </div>
          <div className="text-base sm:text-lg font-black font-mono tabular-nums text-text">
            {formatNumber(periodMetrics.boxesCount)}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>Avg Bill (AOV)</span>
            <Coins size={13} className="text-text-muted" />
          </div>
          <div className="text-base sm:text-lg font-black font-mono tabular-nums text-text">
            {formatINR(periodMetrics.aov)}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>Discounts Allowed</span>
            <Percent size={13} className="text-success" />
          </div>
          <div className="text-base sm:text-lg font-black font-mono tabular-nums text-success">
            - {formatINR(periodMetrics.discount)}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-3 space-y-1">
          <div className="flex items-center justify-between text-text-muted text-[10px] uppercase font-bold">
            <span>GST Collected</span>
            <FileText size={13} className="text-accent" />
          </div>
          <div className="text-base sm:text-lg font-black font-mono tabular-nums text-text">
            {formatINR(gstReportData.totalTax)}
          </div>
        </div>
      </div>

      {/* Tabs Navigation Bar (No emojis) */}
      <div className="flex border-b border-border bg-surface rounded-t-lg px-2 overflow-x-auto print:hidden">
        {[
          { id: 'summary', label: 'Sales Summary', icon: TrendingUp },
          { id: 'products', label: 'Product Performance', icon: Boxes },
          { id: 'brands', label: 'Brand Breakdown', icon: Tag },
          { id: 'gst', label: 'GST & Tax Summary', icon: FileText },
          { id: 'payments', label: 'Payment Modes', icon: CreditCard },
          { id: 'staff', label: 'Cashier Sales', icon: UserCheck },
          { id: 'register', label: 'Bill Register', icon: Receipt },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ReportTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap min-h-[44px] ${
                activeTab === tab.id
                  ? 'border-accent text-accent font-black'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Report Table Container */}
      <div className="bg-surface border border-border rounded-b-lg p-4 shadow-xs">
        {loading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : (
          <div id="reports-print-area" className="printable-area space-y-4">
            {/* Formal Report Letterhead (Included when printing) */}
            <div className="hidden print:block border-b-2 border-gray-800 pb-3 mb-4 text-xs font-sans">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-black text-base uppercase text-gray-900">VNA TRADERS</div>
                  <div className="text-[11px] text-gray-600">
                    Wholesale &amp; Retail Fireworks Merchant<br />
                    Jeermangalam, Hosur, Tamil Nadu - 635109 • GSTIN: 33ACSPV5299F1Z5
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-bold text-xs uppercase px-2 py-0.5 bg-gray-100 border border-gray-300">
                    {activeTab.toUpperCase()} REPORT
                  </span>
                  <div className="text-xs text-gray-600 mt-1">
                    Period: {formatDateDMY(fromDate)} to {formatDateDMY(toDate)}
                  </div>
                </div>
              </div>
            </div>

            {/* TAB 1: SALES SUMMARY (DAILY CHRONOLOGICAL) */}
            {activeTab === 'summary' && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Bill Count</TableHead>
                      <TableHead className="text-right">Gross Subtotal (₹)</TableHead>
                      <TableHead className="text-right">Discounts (₹)</TableHead>
                      <TableHead className="text-right">Net Sales (₹)</TableHead>
                      <TableHead className="text-right">Average Bill (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesSummaryData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-text-muted py-8">
                          No transactions found for the selected period
                        </TableCell>
                      </TableRow>
                    ) : (
                      salesSummaryData.map((row) => (
                        <TableRow key={row.date} className="hover:bg-background/80">
                          <TableCell className="font-mono font-bold text-text">
                            {formatDateDMY(row.date)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatINR(row.subtotal)}</TableCell>
                          <TableCell className="text-right tabular-nums text-success">
                            {row.discount > 0 ? `- ${formatINR(row.discount)}` : '0.00'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-accent">
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
              </div>
            )}

            {/* TAB 2: PRODUCT-WISE SALES PERFORMANCE */}
            {activeTab === 'products' && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Cracker Item Name</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Boxes Sold</TableHead>
                      <TableHead className="text-right">Total Revenue (₹)</TableHead>
                      <TableHead className="text-right">Turnover Share (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productSalesData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-text-muted py-8">
                          No cracker products sold in this date range
                        </TableCell>
                      </TableRow>
                    ) : (
                      productSalesData.map((row, idx) => (
                        <TableRow key={row.name} className="hover:bg-background/80">
                          <TableCell className="text-text-muted">{idx + 1}</TableCell>
                          <TableCell className="font-bold text-text">{row.name}</TableCell>
                          <TableCell>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/10 text-accent border border-accent/20">
                              {row.brand}
                            </span>
                          </TableCell>
                          <TableCell className="text-text-muted text-xs">{row.category}</TableCell>
                          <TableCell className="text-right font-mono font-bold tabular-nums">
                            {row.qty}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-accent tabular-nums">
                            {formatINR(row.revenue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {row.sharePct}%
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* TAB 3: BRAND BREAKDOWN (STANDARD FIREWORKS VS GENERAL) */}
            {activeTab === 'brands' && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand Name</TableHead>
                      <TableHead className="text-right">Total Boxes Sold</TableHead>
                      <TableHead className="text-right">Bill Appearances</TableHead>
                      <TableHead className="text-right">Gross Revenue (₹)</TableHead>
                      <TableHead className="text-right">Turnover Share (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brandPerformanceData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-text-muted py-8">
                          No brand records found for this period
                        </TableCell>
                      </TableRow>
                    ) : (
                      brandPerformanceData.map((row) => (
                        <TableRow key={row.brand} className="hover:bg-background/80">
                          <TableCell className="font-bold text-text">
                            <span className="px-2 py-0.5 rounded text-xs bg-surface border border-border">
                              {row.brand}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold tabular-nums">
                            {row.boxes} Boxes
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-text-muted">
                            {row.itemsCount} lines
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-accent tabular-nums">
                            {formatINR(row.revenue)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-black text-text">
                            {row.sharePct}%
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* TAB 4: GST & TAX REPORT (HSN 3604) */}
            {activeTab === 'gst' && (
              <div className="space-y-4">
                <div className="p-4 bg-background border border-border rounded-lg space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="text-sm font-bold text-text flex items-center gap-1.5">
                      <FileText size={16} className="text-accent" />
                      <span>Statutory GST Tax Computation (HSN 3604 - Fireworks)</span>
                    </h3>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-accent/10 text-accent">
                      Rate: 18% GST (CGST 9% + SGST 9%)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-text-muted block text-[11px]">Total Taxable Turnover:</span>
                      <span className="text-base font-black font-mono tabular-nums text-text">
                        {formatINR(gstReportData.taxableAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[11px]">Central Tax (CGST 9%):</span>
                      <span className="text-base font-bold font-mono tabular-nums text-text">
                        {formatINR(gstReportData.cgst)}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[11px]">State Tax (SGST 9%):</span>
                      <span className="text-base font-bold font-mono tabular-nums text-text">
                        {formatINR(gstReportData.sgst)}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[11px]">Gross Total Turnover:</span>
                      <span className="text-base font-black font-mono tabular-nums text-accent">
                        {formatINR(gstReportData.totalGross)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-surface border border-border rounded text-[11px] text-text-muted space-y-1">
                  <p className="font-bold text-text">GST Filing Note for VNA TRADERS:</p>
                  <p>• Intra-state sales within Tamil Nadu (State Code 33) are apportioned at 9% CGST and 9% SGST.</p>
                  <p>• All fireworks and sparkler supplies fall under Central Excise / GST Chapter 3604 (Fireworks, Signaling Flares, Rain Rockets, Bengal Lights).</p>
                </div>
              </div>
            )}

            {/* TAB 5: PAYMENT MODE SPLIT */}
            {activeTab === 'payments' && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Mode</TableHead>
                      <TableHead className="text-right">Transaction Count</TableHead>
                      <TableHead className="text-right">Total Amount Collected (₹)</TableHead>
                      <TableHead className="text-right">Share (%)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentModeData.map((row) => (
                      <TableRow key={row.mode} className="hover:bg-background/80">
                        <TableCell className="font-bold text-text uppercase">
                          <span className="px-2 py-0.5 rounded text-xs bg-surface border border-border">
                            {row.mode}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.count} bills</TableCell>
                        <TableCell className="text-right tabular-nums font-bold text-accent">
                          {formatINR(row.total)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-bold">{row.share}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* TAB 6: CASHIER / STAFF-WISE SALES */}
            {activeTab === 'staff' && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Member</TableHead>
                      <TableHead className="text-right">Bills Handled</TableHead>
                      <TableHead className="text-right">Total Sales Revenue (₹)</TableHead>
                      <TableHead className="text-right">Average Bill Value (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {staffSalesData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-text-muted py-8">
                          No staff billing records found for this period
                        </TableCell>
                      </TableRow>
                    ) : (
                      staffSalesData.map((row) => (
                        <TableRow key={row.staff} className="hover:bg-background/80">
                          <TableCell className="font-bold text-text">{row.staff}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-accent">
                            {formatINR(row.total)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-text-muted">
                            {formatINR(row.avgBill)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* TAB 7: DETAILED BILL REGISTER WITH SEARCH */}
            {activeTab === 'register' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 print:hidden">
                  <div className="relative max-w-sm w-full">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={registerSearch}
                      onChange={(e) => setRegisterSearch(e.target.value)}
                      placeholder="Search register by bill no, customer name or phone..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <span className="text-xs text-text-muted">
                    Showing {registerBills.length} of {filteredBills.length} bills
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill No</TableHead>
                        <TableHead>Date &amp; Time</TableHead>
                        <TableHead>Customer Name</TableHead>
                        <TableHead className="text-right">Subtotal (₹)</TableHead>
                        <TableHead className="text-right">Discount (₹)</TableHead>
                        <TableHead className="text-right">Grand Total (₹)</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Cashier</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registerBills.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-text-muted py-8">
                            No bills match the search filter
                          </TableCell>
                        </TableRow>
                      ) : (
                        registerBills.map((b) => (
                          <TableRow key={b.id} className="hover:bg-background/80">
                            <TableCell className="font-mono font-bold text-accent">
                              {b.bill_no}
                            </TableCell>
                            <TableCell className="text-xs text-text-muted">
                              {formatISTDate(b.created_at)}
                            </TableCell>
                            <TableCell className="text-xs font-semibold text-text">
                              {b.customer_name || 'Counter Walk-in'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatINR(b.subtotal)}</TableCell>
                            <TableCell className="text-right tabular-nums text-success">
                              {b.discount > 0 ? `- ${formatINR(b.discount)}` : '0.00'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-bold text-text">
                              {formatINR(b.total)}
                            </TableCell>
                            <TableCell className="uppercase text-[11px] font-bold">
                              <span className="px-1.5 py-0.5 rounded bg-surface border border-border">
                                {b.payment_mode}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-text-muted">
                              {profiles.get(b.created_by)?.full_name || 'Staff'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Bottom Signatures for Printed Reports */}
            <div className="hidden print:block pt-8 border-t border-gray-800 text-xs font-sans">
              <div className="flex justify-between items-end">
                <div className="text-center w-48">
                  <div className="h-12 border-b border-gray-400" />
                  <div className="font-bold text-gray-800 pt-1">Prepared By</div>
                  <div className="text-[10px] text-gray-500">Accounts &amp; Billing Dept</div>
                </div>
                <div className="text-center w-48">
                  <div className="h-12 border-b border-gray-400" />
                  <div className="font-bold text-gray-800 pt-1">For VNA TRADERS</div>
                  <div className="text-[10px] text-gray-500">Authorized Signatory</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};