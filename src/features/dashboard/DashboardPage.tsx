import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, restoreMissingBills, initLocalDatabase } from '@/db';
import { syncService } from '@/sync/syncService';
import { Product, Bill, TargetProgress } from '@/types';
import { formatINR, formatNumber, formatISTDate } from '@/lib/format';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { VnaLogo } from '@/components/VnaLogo';
import {
  TrendingUp,
  Receipt,
  Boxes,
  Coins,
  Flame,
  AlertTriangle,
  PackageX,
  Calendar,
  Search,
  Eye,
  Target,
  Edit2,
  Tag,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  ShoppingBag,
  Layers,
  X,
} from 'lucide-react';

export interface ProductSalesStat {
  productId: string;
  code: string;
  name: string;
  category: string;
  brand: string;
  unit: string;
  price: number;
  wholesalePrice: number;
  stock: number;
  minStock: number;
  qtySold: number;
  revenue: number;
  billCount: number;
  recentSales: Array<{
    billId: string;
    billNo: string;
    createdAt: string;
    customerName: string;
    customerPhone: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
    paymentMode: string;
  }>;
  hourlyOrDailyTrend: Array<{
    label: string;
    qty: number;
    revenue: number;
  }>;
}

export const DashboardPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Control state - default to 'month' so data is populated on first load
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | '7days' | 'month' | 'all'>('month');
  const [productTab, setProductTab] = useState<'high' | 'low' | 'zero'>('high');
  const [productSortBy, setProductSortBy] = useState<'qty' | 'revenue'>('qty');
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [breakdownMode, setBreakdownMode] = useState<'category' | 'brand'>('category');
  const [selectedProduct, setSelectedProduct] = useState<ProductSalesStat | null>(null);

  // Target modal state
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [newTargetAmount, setNewTargetAmount] = useState('500000');

  // Auto-refresh when bills or sync events fire
  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ['vna_dashboard_analytics'] });
    };
    window.addEventListener('bills-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('bills-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, [queryClient]);

  // Main data query for all metrics & sales telemetry
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['vna_dashboard_analytics', dateRange],
    queryFn: async () => {
      await initLocalDatabase();
      await restoreMissingBills();
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        syncService.triggerSync().catch(() => {});
      }

      const [allBills, allItems, allProducts, allProfiles, targetSetting] = await Promise.all([
        db.bills.toArray(),
        db.bill_items.toArray(),
        db.products.toArray(),
        db.profiles.toArray(),
        db.settings.get('monthly_target'),
      ]);

      const profMap = new Map<string, string>();
      allProfiles.forEach((p) => profMap.set(p.id, p.full_name || p.email || 'Staff'));

      const targetAmount = targetSetting ? Number(targetSetting.value) || 500000 : 500000;

      // Product map by ID, code, and normalized name
      const prodMap = new Map<string, Product>();
      const prodCodeMap = new Map<string, Product>();
      const prodNameMap = new Map<string, Product>();
      allProducts.forEach((p) => {
        prodMap.set(p.id, p);
        if (p.code) prodCodeMap.set(p.code.trim().toUpperCase(), p);
        if (p.name) prodNameMap.set(p.name.trim().toLowerCase(), p);
      });

      // Bills map
      const billMap = new Map<string, Bill>();
      allBills.forEach((b) => billMap.set(b.id, b));

      // Calculate time windows
      const now = new Date();
      let startTime = 0;
      let endTime = Number.MAX_SAFE_INTEGER;
      let prevStartTime = 0;
      let prevEndTime = 0;

      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const endOfToday = startOfToday + 24 * 60 * 60 * 1000;

      if (dateRange === 'today') {
        startTime = startOfToday;
        endTime = endOfToday;
        prevStartTime = startOfToday - 24 * 60 * 60 * 1000;
        prevEndTime = startOfToday;
      } else if (dateRange === 'yesterday') {
        startTime = startOfToday - 24 * 60 * 60 * 1000;
        endTime = startOfToday;
        prevStartTime = startTime - 24 * 60 * 60 * 1000;
        prevEndTime = startTime;
      } else if (dateRange === '7days') {
        startTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;
        endTime = now.getTime();
        prevStartTime = startTime - 7 * 24 * 60 * 60 * 1000;
        prevEndTime = startTime;
      } else if (dateRange === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        startTime = startOfMonth;
        endTime = now.getTime();
        prevStartTime = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        prevEndTime = startOfMonth;
      } else if (dateRange === 'all') {
        startTime = 0;
        endTime = Number.MAX_SAFE_INTEGER;
        prevStartTime = 0;
        prevEndTime = 0;
      }

      // Filter bills for current period and previous period
      const currentBills = allBills.filter((b) => {
        const t = new Date(b.created_at).getTime();
        return t >= startTime && t < endTime;
      });

      const prevBills = allBills.filter((b) => {
        const t = new Date(b.created_at).getTime();
        return t >= prevStartTime && t < prevEndTime;
      });

      const currentBillIds = new Set(currentBills.map((b) => b.id));

      // Items sold in current period
      const currentItems = allItems.filter((i) => currentBillIds.has(i.bill_id));

      // Financial KPIs
      const currentRevenue = currentBills.reduce((acc, b) => acc + (b.total || 0), 0);
      const prevRevenue = prevBills.reduce((acc, b) => acc + (b.total || 0), 0);

      const billCount = currentBills.length;
      const prevBillCount = prevBills.length;

      const avgTicket = billCount > 0 ? currentRevenue / billCount : 0;
      const prevAvgTicket = prevBillCount > 0 ? prevRevenue / prevBillCount : 0;

      const totalBoxesSold = currentItems.reduce((acc, i) => acc + (i.qty || 0), 0);
      const prevBoxesSold = allItems
        .filter((i) => prevBills.some((pb) => pb.id === i.bill_id))
        .reduce((acc, i) => acc + (i.qty || 0), 0);

      // Payment Modes Breakdown
      let cashTotal = 0;
      let upiTotal = 0;
      let cardTotal = 0;
      let cashCount = 0;
      let upiCount = 0;
      let cardCount = 0;

      currentBills.forEach((b) => {
        const mode = (b.payment_mode || 'cash').toLowerCase();
        if (mode === 'upi') {
          upiTotal += b.total || 0;
          upiCount++;
        } else if (mode === 'card') {
          cardTotal += b.total || 0;
          cardCount++;
        } else {
          cashTotal += b.total || 0;
          cashCount++;
        }
      });

      // Velocity / Rush Timeline Chart (Hourly if today/yesterday, Daily if 7days/month/all)
      const isHourly = dateRange === 'today' || dateRange === 'yesterday';
      const trendMap = new Map<string, { label: string; revenue: number; boxes: number; bills: number }>();

      if (isHourly) {
        // Standard fireworks shop business hours: 8 AM to 10 PM
        const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
        hours.forEach((h) => {
          const ampm = h >= 12 ? 'PM' : 'AM';
          const disp = h > 12 ? `${h - 12} ${ampm}` : `${h} ${ampm}`;
          trendMap.set(String(h), { label: disp, revenue: 0, boxes: 0, bills: 0 });
        });

        currentBills.forEach((b) => {
          const d = new Date(b.created_at);
          const h = d.getHours();
          const key = String(h);
          if (trendMap.has(key)) {
            const cur = trendMap.get(key)!;
            cur.revenue += b.total || 0;
            cur.bills += 1;
          }
        });

        currentItems.forEach((i) => {
          const b = billMap.get(i.bill_id);
          if (b) {
            const h = new Date(b.created_at).getHours();
            const key = String(h);
            if (trendMap.has(key)) {
              trendMap.get(key)!.boxes += i.qty || 0;
            }
          }
        });
      } else {
        // Daily timeline
        currentBills.forEach((b) => {
          const dKey = b.created_at.slice(0, 10);
          if (!trendMap.has(dKey)) {
            const d = new Date(b.created_at);
            const label = `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })}`;
            trendMap.set(dKey, { label, revenue: 0, boxes: 0, bills: 0 });
          }
          const cur = trendMap.get(dKey)!;
          cur.revenue += b.total || 0;
          cur.bills += 1;
        });

        currentItems.forEach((i) => {
          const b = billMap.get(i.bill_id);
          if (b) {
            const dKey = b.created_at.slice(0, 10);
            if (trendMap.has(dKey)) {
              trendMap.get(dKey)!.boxes += i.qty || 0;
            }
          }
        });
      }

      const timelineChart = Array.from(trendMap.values());

      // Category breakdown
      const categorySalesMap = new Map<string, { category: string; revenue: number; boxes: number }>();
      currentItems.forEach((item) => {
        let cat = 'General';
        const matchedProd =
          (item.product_id ? prodMap.get(item.product_id) : null) ||
          prodNameMap.get((item.product_name || '').trim().toLowerCase());
        if (matchedProd && matchedProd.category) {
          cat = matchedProd.category;
        }

        if (!categorySalesMap.has(cat)) {
          categorySalesMap.set(cat, { category: cat, revenue: 0, boxes: 0 });
        }
        const c = categorySalesMap.get(cat)!;
        c.revenue += item.line_total || 0;
        c.boxes += item.qty || 0;
      });

      const categoryChart = Array.from(categorySalesMap.values()).sort((a, b) => b.revenue - a.revenue);

      // Brand breakdown
      const brandSalesMap = new Map<string, { brand: string; revenue: number; boxes: number }>();
      currentItems.forEach((item) => {
        const bName = item.brand || 'Standard';
        if (!brandSalesMap.has(bName)) {
          brandSalesMap.set(bName, { brand: bName, revenue: 0, boxes: 0 });
        }
        const b = brandSalesMap.get(bName)!;
        b.revenue += item.line_total || 0;
        b.boxes += item.qty || 0;
      });

      const brandChart = Array.from(brandSalesMap.values()).sort((a, b) => b.revenue - a.revenue);

      // Comprehensive Product Sales Intelligence (High, Low, Zero sales)
      const productStatsMap = new Map<string, ProductSalesStat>();

      // Seed all active inventory products
      allProducts
        .filter((p) => p.is_active)
        .forEach((p) => {
          productStatsMap.set(p.id, {
            productId: p.id,
            code: p.code || 'CKR',
            name: p.name,
            category: p.category || 'Crackers',
            brand: p.brand || 'Standard',
            unit: p.unit || 'box',
            price: Number(p.price) || 0,
            wholesalePrice: Number(p.wholesale_price) || 0,
            stock: Number(p.stock) || 0,
            minStock: Number(p.min_stock) || 20,
            qtySold: 0,
            revenue: 0,
            billCount: 0,
            recentSales: [],
            hourlyOrDailyTrend: [],
          });
        });

      // Accumulate item sales onto products
      currentItems.forEach((item) => {
        const prod =
          (item.product_id ? prodMap.get(item.product_id) : null) ||
          prodNameMap.get((item.product_name || '').trim().toLowerCase());

        const statKey = prod ? prod.id : item.product_name;

        if (!productStatsMap.has(statKey)) {
          productStatsMap.set(statKey, {
            productId: prod ? prod.id : '',
            code: prod?.code || 'CKR',
            name: item.product_name,
            category: prod?.category || 'Crackers',
            brand: item.brand || prod?.brand || 'Standard',
            unit: 'box',
            price: Number(item.unit_price) || 0,
            wholesalePrice: Number(prod?.wholesale_price) || 0,
            stock: prod ? Number(prod.stock) : 0,
            minStock: prod ? Number(prod.min_stock) || 20 : 20,
            qtySold: 0,
            revenue: 0,
            billCount: 0,
            recentSales: [],
            hourlyOrDailyTrend: [],
          });
        }

        const stat = productStatsMap.get(statKey)!;
        stat.qtySold += item.qty || 0;
        stat.revenue += item.line_total || 0;
        stat.billCount += 1;

        const parentBill = billMap.get(item.bill_id);
        if (parentBill) {
          stat.recentSales.push({
            billId: parentBill.id,
            billNo: parentBill.bill_no,
            createdAt: parentBill.created_at,
            customerName: parentBill.customer_name || 'Counter Customer',
            customerPhone: parentBill.customer_phone || '-',
            qty: item.qty,
            unitPrice: item.unit_price,
            lineTotal: item.line_total,
            paymentMode: parentBill.payment_mode,
          });
        }
      });

      // Sort recent sales inside each product stat
      productStatsMap.forEach((stat) => {
        stat.recentSales.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Build product specific timeline trend
        const pTrendMap = new Map<string, { label: string; qty: number; revenue: number }>();
        stat.recentSales.forEach((s) => {
          const d = new Date(s.createdAt);
          const tLabel = isHourly
            ? `${d.getHours()}:00`
            : `${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })}`;
          if (!pTrendMap.has(tLabel)) {
            pTrendMap.set(tLabel, { label: tLabel, qty: 0, revenue: 0 });
          }
          const pt = pTrendMap.get(tLabel)!;
          pt.qty += s.qty;
          pt.revenue += s.lineTotal;
        });
        stat.hourlyOrDailyTrend = Array.from(pTrendMap.values());
      });

      const allStatsList = Array.from(productStatsMap.values());

      // Partition into High, Low, and Zero
      const highSelling = allStatsList
        .filter((s) => s.qtySold > 0)
        .sort((a, b) => b.qtySold - a.qtySold);

      const lowSelling = allStatsList
        .filter((s) => s.qtySold > 0 && s.qtySold <= 5)
        .sort((a, b) => a.qtySold - b.qtySold);

      const zeroSelling = allStatsList
        .filter((s) => s.qtySold === 0 && s.stock > 0)
        .sort((a, b) => b.stock - a.stock);

      // Monthly target progress
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const currentDay = now.getDate();
      const daysRemaining = Math.max(0, daysInMonth - currentDay);
      const achievedMonth = allBills
        .filter((b) => {
          const d = new Date(b.created_at);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        })
        .reduce((acc, b) => acc + (b.total || 0), 0);

      const targetProgress: TargetProgress = {
        target_amount: targetAmount,
        achieved_amount: achievedMonth,
        percentage: targetAmount > 0 ? Math.min(100, Math.round((achievedMonth / targetAmount) * 100)) : 0,
        days_in_month: daysInMonth,
        days_elapsed: currentDay,
        days_remaining: daysRemaining,
        required_daily_avg:
          daysRemaining > 0 && achievedMonth < targetAmount
            ? Math.round((targetAmount - achievedMonth) / daysRemaining)
            : 0,
      };

      // Recent 8 Bills
      const recentBills = allBills
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8);

      return {
        kpis: {
          revenue: { current: currentRevenue, prev: prevRevenue },
          bills: { current: billCount, prev: prevBillCount },
          avgTicket: { current: avgTicket, prev: prevAvgTicket },
          boxesSold: { current: totalBoxesSold, prev: prevBoxesSold },
          payments: {
            cash: { amount: cashTotal, count: cashCount },
            upi: { amount: upiTotal, count: upiCount },
            card: { amount: cardTotal, count: cardCount },
          },
        },
        timelineChart,
        isHourly,
        categoryChart,
        brandChart,
        highSelling,
        lowSelling,
        zeroSelling,
        allStatsList,
        targetProgress,
        recentBills,
        profiles: profMap,
      };
    },
    staleTime: 15000,
  });

  const saveTargetMutation = useMutation({
    mutationFn: async (amount: number) => {
      await db.settings.put({ key: 'monthly_target', value: amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vna_dashboard_analytics'] });
      setIsTargetModalOpen(false);
      toast('Monthly sales target updated successfully', 'success');
    },
  });

  // Calculate percentage difference helper
  const getPctDiff = (current: number, prev: number) => {
    if (prev === 0) return current > 0 ? '+100%' : '0%';
    const pct = Math.round(((current - prev) / prev) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  };

  // Distinct categories from data for filter bar
  const categoriesList = useMemo(() => {
    if (!data?.allStatsList) return ['All'];
    const set = new Set<string>();
    data.allStatsList.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set).sort()];
  }, [data?.allStatsList]);

  // Filtered and sorted product list for the active tab
  const displayedProducts = useMemo(() => {
    if (!data) return [];
    let list: ProductSalesStat[] = [];
    if (productTab === 'high') {
      list = [...data.highSelling];
    } else if (productTab === 'low') {
      list = [...data.lowSelling];
    } else {
      list = [...data.zeroSelling];
    }

    // Filter by search
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q)
      );
    }

    // Filter by category
    if (selectedCategoryFilter !== 'All') {
      list = list.filter((p) => p.category === selectedCategoryFilter);
    }

    // Sort by selected criteria
    if (productSortBy === 'revenue') {
      list.sort((a, b) => b.revenue - a.revenue);
    } else if (productSortBy === 'qty') {
      if (productTab === 'low') {
        list.sort((a, b) => a.qtySold - b.qtySold);
      } else {
        list.sort((a, b) => b.qtySold - a.qtySold);
      }
    }

    return list;
  }, [data, productTab, productSearch, selectedCategoryFilter, productSortBy]);

  // Max quantity for relative progress bar calculation
  const maxQtyInTab = useMemo(() => {
    if (displayedProducts.length === 0) return 1;
    return Math.max(...displayedProducts.map((p) => p.qtySold), 1);
  }, [displayedProducts]);

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-2 sm:p-4">
        <div className="flex justify-between items-center pb-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-44" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const { kpis, timelineChart, isHourly, categoryChart, brandChart, targetProgress, recentBills } = data;

  const totalPaymentSum = kpis.payments.cash.amount + kpis.payments.upi.amount + kpis.payments.card.amount || 1;
  const cashPct = Math.round((kpis.payments.cash.amount / totalPaymentSum) * 100);
  const upiPct = Math.round((kpis.payments.upi.amount / totalPaymentSum) * 100);
  const cardPct = Math.max(0, 100 - cashPct - upiPct);

  return (
    <div className="space-y-5 pb-12 select-none">
      {/* TOP HEADER: Branding, Status, Date Selector & Refresh */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface border border-border rounded-lg p-3 sm:p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <VnaLogo size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-text tracking-tight">
                VNA TRADERS
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                Live Sales Analytics
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Fireworks Merchant Analytics • Hosur Main Depot
            </p>
          </div>
        </div>

        {/* Date Filters & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Date Range Pills */}
          <div className="flex rounded-md border border-border p-1 bg-background text-xs font-semibold">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7days', label: 'Last 7 Days' },
                { id: 'month', label: 'This Month' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((rng) => (
              <button
                key={rng.id}
                type="button"
                onClick={() => setDateRange(rng.id)}
                className={`px-3 py-1.5 rounded transition-all min-h-[30px] font-bold ${
                  dateRange === rng.id
                    ? 'bg-accent text-white shadow-xs'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
              >
                {rng.label}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="min-h-[34px] px-2.5 text-xs gap-1.5"
            title="Refresh sales data"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin text-accent' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Helpful notification when selected period has no bills */}
      {kpis.bills.current === 0 && (
        <div className="p-3 bg-accent/5 border border-accent/20 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-accent shrink-0" />
            <span className="text-text">
              No bills recorded for <strong>{dateRange === 'today' ? 'Today' : dateRange}</strong>. You can switch to <strong>This Month</strong> or <strong>All Time</strong> to view sales history.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDateRange('month')}
              className="px-2.5 py-1 text-xs font-bold bg-accent text-white rounded hover:bg-accent-hover transition-colors"
            >
              View This Month
            </button>
            <button
              type="button"
              onClick={() => setDateRange('all')}
              className="px-2.5 py-1 text-xs font-bold bg-surface border border-border text-text rounded hover:bg-border/60 transition-colors"
            >
              View All Time
            </button>
          </div>
        </div>
      )}

      {/* 4 PRIMARY EXECUTIVE METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Total Revenue */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-2 shadow-xs hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Gross Revenue</span>
            <div className="p-1.5 rounded-md bg-accent/10 text-accent">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="text-2xl font-black tabular-nums text-text font-mono">
            {formatINR(kpis.revenue.current)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted pt-1 border-t border-border/40">
            {kpis.revenue.current >= kpis.revenue.prev ? (
              <span className="flex items-center text-success font-bold text-[11px]">
                <ArrowUpRight size={13} />
                {getPctDiff(kpis.revenue.current, kpis.revenue.prev)}
              </span>
            ) : (
              <span className="flex items-center text-danger font-bold text-[11px]">
                <ArrowDownRight size={13} />
                {getPctDiff(kpis.revenue.current, kpis.revenue.prev)}
              </span>
            )}
            <span>vs previous period ({formatINR(kpis.revenue.prev)})</span>
          </div>
        </div>

        {/* Metric 2: Bills Count & Average Ticket */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-2 shadow-xs hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Bills Generated</span>
            <div className="p-1.5 rounded-md bg-surface text-text-muted border border-border">
              <Receipt size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tabular-nums text-text font-mono">
              {kpis.bills.current}
            </span>
            <span className="text-xs text-text-muted font-medium">customer bills</span>
          </div>
          <div className="flex items-center justify-between text-xs text-text-muted pt-1 border-t border-border/40">
            <span>Avg Bill (AOV):</span>
            <strong className="text-text font-mono font-bold">{formatINR(kpis.avgTicket.current)}</strong>
          </div>
        </div>

        {/* Metric 3: Physical Cracker Boxes Sold */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-2 shadow-xs hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Cracker Boxes Sold</span>
            <div className="p-1.5 rounded-md bg-accent/10 text-accent">
              <Boxes size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tabular-nums text-text font-mono">
              {formatNumber(kpis.boxesSold.current)}
            </span>
            <span className="text-xs text-text-muted font-medium">total boxes</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted pt-1 border-t border-border/40">
            {kpis.boxesSold.current >= kpis.boxesSold.prev ? (
              <span className="text-success font-bold text-[11px]">
                {getPctDiff(kpis.boxesSold.current, kpis.boxesSold.prev)} volume
              </span>
            ) : (
              <span className="text-danger font-bold text-[11px]">
                {getPctDiff(kpis.boxesSold.current, kpis.boxesSold.prev)} volume
              </span>
            )}
            <span>vs previous period ({kpis.boxesSold.prev} boxes)</span>
          </div>
        </div>

        {/* Metric 4: Payment Mode Mix */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-2 shadow-xs hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Payment Collection Mix</span>
            <div className="p-1.5 rounded-md bg-surface text-text-muted border border-border">
              <Coins size={16} />
            </div>
          </div>

          {/* Segmented color bar */}
          <div className="w-full h-3 bg-border rounded-full flex overflow-hidden">
            <div
              style={{ width: `${cashPct}%` }}
              className="bg-emerald-600 h-full"
              title={`Cash: ${cashPct}% (${formatINR(kpis.payments.cash.amount)})`}
            />
            <div
              style={{ width: `${upiPct}%` }}
              className="bg-accent h-full"
              title={`UPI: ${upiPct}% (${formatINR(kpis.payments.upi.amount)})`}
            />
            <div
              style={{ width: `${cardPct}%` }}
              className="bg-amber-500 h-full"
              title={`Card: ${cardPct}% (${formatINR(kpis.payments.card.amount)})`}
            />
          </div>

          <div className="grid grid-cols-3 gap-1 text-[11px] pt-1">
            <div className="flex flex-col">
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                Cash
              </span>
              <span className="text-text font-mono font-bold text-[10px]">{formatINR(kpis.payments.cash.amount)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-accent font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-accent" />
                UPI
              </span>
              <span className="text-text font-mono font-bold text-[10px]">{formatINR(kpis.payments.upi.amount)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-amber-700 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Card
              </span>
              <span className="text-text font-mono font-bold text-[10px]">{formatINR(kpis.payments.card.amount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MONTHLY TARGET METER */}
      <div className="bg-surface border border-border rounded-lg p-3 sm:p-4 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-accent" />
            <h2 className="text-xs sm:text-sm font-bold text-text">
              Monthly Sales Target • Goal Tracking
            </h2>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setNewTargetAmount(String(targetProgress.target_amount));
              setIsTargetModalOpen(true);
            }}
            className="min-h-[28px] py-0.5 px-2 text-xs gap-1"
          >
            <Edit2 size={12} />
            <span>Set Target</span>
          </Button>
        </div>

        <div className="w-full bg-border rounded-full h-3 overflow-hidden">
          <div
            className="bg-accent h-full transition-all duration-300"
            style={{ width: `${Math.min(100, targetProgress.percentage)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <span className="text-text-muted block text-[11px]">Monthly Goal:</span>
            <span className="font-bold tabular-nums text-text font-mono">{formatINR(targetProgress.target_amount)}</span>
          </div>
          <div>
            <span className="text-text-muted block text-[11px]">Achieved Revenue:</span>
            <span className="font-black tabular-nums text-accent font-mono">
              {formatINR(targetProgress.achieved_amount)} ({targetProgress.percentage}%)
            </span>
          </div>
          <div>
            <span className="text-text-muted block text-[11px]">Days Remaining:</span>
            <span className="font-bold text-text">{targetProgress.days_remaining} days left in month</span>
          </div>
          <div>
            <span className="text-text-muted block text-[11px]">Required Daily Run-Rate:</span>
            <span className="font-bold tabular-nums text-text font-mono">
              {formatINR(targetProgress.required_daily_avg)}/day
            </span>
          </div>
        </div>
      </div>

      {/* CHARTS ROW: Sales Velocity Rush (Hourly / Daily) & Category Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Sales Velocity Rush */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-text flex items-center gap-1.5">
                <Clock size={16} className="text-accent" />
                <span>{isHourly ? 'Peak Sales Rush Hours (Today)' : 'Daily Revenue Pace (₹)'}</span>
              </h3>
              <p className="text-[11px] text-text-muted mt-0.5">
                {isHourly ? 'Real-time billing distribution by hour of the day' : 'Revenue trajectory over selected period'}
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-background border border-border text-text-muted uppercase">
              {isHourly ? 'Hourly Pace' : 'Daily Pace'}
            </span>
          </div>

          <div className="h-64 w-full">
            {timelineChart.length === 0 || timelineChart.every((t) => t.revenue === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-text-muted border border-dashed border-border rounded">
                <Calendar size={24} className="text-text-muted/40 mb-1" />
                <p className="font-semibold text-text">No sales entries recorded</p>
                <p className="text-[11px] text-text-muted">Start billing to see the rush velocity curve</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C2410C" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#C2410C" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E2E2DE" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="#6B6B66" fontSize={10} tickLine={false} />
                  <YAxis
                    stroke="#6B6B66"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatINR(Number(val)), 'Sales Revenue']}
                    labelFormatter={(label) => `Time / Date: ${label}`}
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E2DE', borderRadius: '6px', fontSize: '11px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#C2410C"
                    strokeWidth={2.5}
                    fill="url(#salesGrad)"
                    dot={{ fill: '#C2410C', r: 3 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Category & Brand Revenue Breakdown */}
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-bold text-text flex items-center gap-1.5">
                <Layers size={16} className="text-accent" />
                <span>{breakdownMode === 'category' ? 'Sales by Cracker Category' : 'Sales by Brand Share'}</span>
              </h3>
              <p className="text-[11px] text-text-muted mt-0.5">
                {breakdownMode === 'category'
                  ? 'Sparklers, Chakkars, Flower Pots, Rockets & Sky Shots'
                  : 'Standard Fireworks vs General vs Other Brands'}
              </p>
            </div>

            <div className="flex rounded border border-border p-0.5 bg-background font-semibold text-[10px]">
              <button
                type="button"
                onClick={() => setBreakdownMode('category')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  breakdownMode === 'category' ? 'bg-accent text-white font-bold' : 'text-text-muted hover:text-text'
                }`}
              >
                Category
              </button>
              <button
                type="button"
                onClick={() => setBreakdownMode('brand')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  breakdownMode === 'brand' ? 'bg-accent text-white font-bold' : 'text-text-muted hover:text-text'
                }`}
              >
                Brand
              </button>
            </div>
          </div>

          <div className="h-64 w-full">
            {breakdownMode === 'category' ? (
              categoryChart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-xs text-text-muted border border-dashed border-border rounded">
                  <Tag size={24} className="text-text-muted/40 mb-1" />
                  <p className="font-semibold text-text">No category data</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChart.slice(0, 6)} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid stroke="#E2E2DE" strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="#6B6B66"
                      fontSize={10}
                      tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <YAxis type="category" dataKey="category" stroke="#6B6B66" fontSize={10} width={90} />
                    <Tooltip
                      formatter={(val: any) => [formatINR(Number(val)), 'Revenue']}
                      contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E2DE', borderRadius: '6px', fontSize: '11px' }}
                    />
                    <Bar dataKey="revenue" fill="#C2410C" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )
            ) : brandChart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-text-muted border border-dashed border-border rounded">
                <Tag size={24} className="text-text-muted/40 mb-1" />
                <p className="font-semibold text-text">No brand data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={brandChart.slice(0, 6)} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid stroke="#E2E2DE" strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="#6B6B66"
                    fontSize={10}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                  />
                  <YAxis type="category" dataKey="brand" stroke="#6B6B66" fontSize={10} width={90} />
                  <Tooltip
                    formatter={(val: any) => [formatINR(Number(val)), 'Revenue']}
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E2DE', borderRadius: '6px', fontSize: '11px' }}
                  />
                  <Bar dataKey="revenue" fill="#1C1C1A" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* CORE PRODUCT INTELLIGENCE: HIGH SELLING VS LOW SELLING DRILL-DOWN */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Flame size={20} className="text-accent" />
              <h2 className="text-base font-black text-text">
                Product Sales Velocity & Movement Analysis
              </h2>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              Click any cracker product to drill down into detailed customer bills, quantities sold, and stock health.
            </p>
          </div>

          {/* High Selling vs Low Selling Tabs */}
          <div className="flex rounded-md border border-border p-1 bg-background text-xs font-semibold">
            <button
              type="button"
              onClick={() => setProductTab('high')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors font-bold ${
                productTab === 'high' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
              }`}
            >
              <Flame size={14} />
              <span>High Selling ({data.highSelling.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setProductTab('low')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors font-bold ${
                productTab === 'low' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
              }`}
            >
              <AlertTriangle size={14} />
              <span>Slow Moving ({data.lowSelling.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setProductTab('zero')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded transition-colors font-bold ${
                productTab === 'zero' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
              }`}
            >
              <PackageX size={14} />
              <span>Zero Sales ({data.zeroSelling.length})</span>
            </button>
          </div>
        </div>

        {/* Product Filter Toolbar: Search, Category, and Sort Mode */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            {/* Search Box */}
            <div className="relative min-w-[200px] max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search products by name, code or brand..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {productSearch && (
                <button
                  type="button"
                  onClick={() => setProductSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {categoriesList.slice(0, 6).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold whitespace-nowrap transition-colors ${
                    selectedCategoryFilter === cat
                      ? 'bg-text text-surface font-bold'
                      : 'bg-background text-text-muted hover:text-text hover:bg-border/60'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Sort By Toggle */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-text-muted font-medium text-[11px]">Rank by:</span>
            <div className="flex rounded border border-border p-0.5 bg-background font-semibold text-[11px]">
              <button
                type="button"
                onClick={() => setProductSortBy('qty')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  productSortBy === 'qty' ? 'bg-accent text-white font-bold' : 'text-text-muted hover:text-text'
                }`}
              >
                Boxes Sold
              </button>
              <button
                type="button"
                onClick={() => setProductSortBy('revenue')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  productSortBy === 'revenue' ? 'bg-accent text-white font-bold' : 'text-text-muted hover:text-text'
                }`}
              >
                Revenue (₹)
              </button>
            </div>
          </div>
        </div>

        {/* PRODUCTS LIST TABLE WITH CLICKABLE DRILL-DOWN */}
        <div className="border border-border rounded-lg overflow-hidden bg-background">
          {displayedProducts.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-muted">
              <ShoppingBag size={24} className="mx-auto text-text-muted/40 mb-2" />
              <p className="font-bold text-text">No products found in this category / tab</p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Try switching date filters, tabs, or clearing your search query.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {displayedProducts.slice(0, 30).map((prod, idx) => {
                const rank = idx + 1;
                const rankColor =
                  productTab === 'high' && rank === 1
                    ? 'bg-amber-500 text-white'
                    : productTab === 'high' && rank === 2
                    ? 'bg-slate-400 text-white'
                    : productTab === 'high' && rank === 3
                    ? 'bg-amber-700 text-white'
                    : 'bg-surface text-text-muted border border-border';

                const stockColor =
                  prod.stock <= 0
                    ? 'text-danger font-bold'
                    : prod.stock <= prod.minStock
                    ? 'text-amber-600 font-bold'
                    : 'text-success font-semibold';

                const volumePct = Math.min(100, Math.round((prod.qtySold / maxQtyInTab) * 100));

                return (
                  <div
                    key={prod.productId || prod.name}
                    onClick={() => setSelectedProduct(prod)}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-surface/80 cursor-pointer transition-colors group"
                    title={`Click to view full sales telemetry & bills for ${prod.name}`}
                  >
                    {/* Rank & Product Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${rankColor}`}
                      >
                        {rank}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-text group-hover:text-accent transition-colors truncate max-w-sm">
                            {prod.name}
                          </span>
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-surface border border-border rounded text-text-muted">
                            {prod.code}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                            {prod.brand}
                          </span>
                          <span className="text-[10px] text-text-muted hidden sm:inline">
                            • {prod.category}
                          </span>
                        </div>

                        {/* Relative Volume Bar */}
                        {productTab !== 'zero' && (
                          <div className="w-full max-w-xs bg-border/40 rounded-full h-1.5 mt-1.5 overflow-hidden">
                            <div
                              className="bg-accent h-full group-hover:bg-accent-hover transition-all"
                              style={{ width: `${volumePct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Sales Metrics & Stock */}
                    <div className="flex items-center gap-4 sm:gap-6 shrink-0 text-right">
                      {/* Physical Stock Status */}
                      <div className="hidden sm:block">
                        <span className="text-[10px] text-text-muted block">In Godown</span>
                        <span className={`text-xs tabular-nums font-mono ${stockColor}`}>
                          {prod.stock} {prod.unit}
                        </span>
                      </div>

                      {/* Boxes Sold */}
                      <div>
                        <span className="text-[10px] text-text-muted block">Quantity Sold</span>
                        <span className="text-xs sm:text-sm font-black tabular-nums font-mono text-text">
                          {prod.qtySold} {prod.unit}
                        </span>
                      </div>

                      {/* Total Revenue */}
                      <div className="w-24 sm:w-28 text-right">
                        <span className="text-[10px] text-text-muted block">Total Revenue</span>
                        <span className="text-xs sm:text-sm font-black tabular-nums font-mono text-accent">
                          {formatINR(prod.revenue)}
                        </span>
                      </div>

                      {/* Drill-down arrow indicator */}
                      <div className="p-1 rounded bg-surface group-hover:bg-accent group-hover:text-white text-text-muted transition-colors">
                        <Eye size={14} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RECENT BILLS TELESCOPE & ACTIVITY LOGS */}
      <div className="bg-surface border border-border rounded-lg p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="flex items-center gap-2">
            <Receipt size={16} className="text-accent" />
            <h3 className="text-sm font-bold text-text">Recent Store Billing Activity</h3>
          </div>
          <span className="text-[11px] text-text-muted font-medium">Last 8 processed bills</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-background border-b border-border text-text-muted text-left font-semibold">
              <tr>
                <th className="p-2">Bill No</th>
                <th className="p-2">Date &amp; Time</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Payment Mode</th>
                <th className="p-2 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentBills.map((b) => (
                <tr key={b.id} className="hover:bg-background/80 transition-colors">
                  <td className="p-2 font-mono font-bold text-accent">{b.bill_no}</td>
                  <td className="p-2 text-text-muted text-[11px]">{formatISTDate(b.created_at)}</td>
                  <td className="p-2 font-semibold text-text">{b.customer_name || 'Counter Walk-in'}</td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-surface border border-border">
                      {b.payment_mode}
                    </span>
                  </td>
                  <td className="p-2 text-right font-mono font-bold text-text">{formatINR(b.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* INTERACTIVE PRODUCT SALES DRILL-DOWN MODAL */}
      {selectedProduct && (
        <Dialog
          isOpen={Boolean(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
          title={`Product Intelligence: ${selectedProduct.name}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            {/* Header Product Card */}
            <div className="p-3.5 bg-background border border-border rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-black text-text">{selectedProduct.name}</h3>
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-surface border border-border rounded text-accent">
                    Code: {selectedProduct.code}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                    {selectedProduct.brand}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
                  <span>Category: <strong className="text-text">{selectedProduct.category}</strong></span>
                  <span>•</span>
                  <span>Retail MRP: <strong className="text-text">{formatINR(selectedProduct.price)}</strong></span>
                  {selectedProduct.wholesalePrice > 0 && (
                    <>
                      <span>•</span>
                      <span>Wholesale Rate: <strong className="text-accent">{formatINR(selectedProduct.wholesalePrice)}</strong></span>
                    </>
                  )}
                </div>
              </div>

              {/* Godown Stock Status Badge */}
              <div className="flex items-center gap-3 bg-surface border border-border px-3 py-2 rounded shrink-0">
                <Boxes size={18} className="text-accent" />
                <div>
                  <span className="text-[10px] text-text-muted block uppercase font-bold">Godown Stock:</span>
                  <span
                    className={`text-sm font-black font-mono ${
                      selectedProduct.stock <= 0
                        ? 'text-danger'
                        : selectedProduct.stock <= selectedProduct.minStock
                        ? 'text-amber-600'
                        : 'text-success'
                    }`}
                  >
                    {selectedProduct.stock} {selectedProduct.unit} available
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Quick Stat Cards for Selected Product */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 bg-surface border border-border rounded-lg space-y-1">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Units Sold in Period</span>
                <span className="text-lg font-black font-mono text-text">
                  {selectedProduct.qtySold} {selectedProduct.unit}
                </span>
              </div>
              <div className="p-3 bg-surface border border-border rounded-lg space-y-1">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Total Revenue Earned</span>
                <span className="text-lg font-black font-mono text-accent">
                  {formatINR(selectedProduct.revenue)}
                </span>
              </div>
              <div className="p-3 bg-surface border border-border rounded-lg space-y-1">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Bill Appearances</span>
                <span className="text-lg font-black font-mono text-text">
                  {selectedProduct.billCount} bills
                </span>
              </div>
              <div className="p-3 bg-surface border border-border rounded-lg space-y-1">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Avg Selling Rate</span>
                <span className="text-lg font-black font-mono text-text">
                  {selectedProduct.qtySold > 0 ? formatINR(selectedProduct.revenue / selectedProduct.qtySold) : '₹0'}
                </span>
              </div>
            </div>

            {/* Product Movement Timeline Chart (if any) */}
            {selectedProduct.hourlyOrDailyTrend.length > 0 && (
              <div className="p-3 bg-surface border border-border rounded-lg space-y-2">
                <h4 className="text-xs font-bold text-text flex items-center gap-1.5">
                  <Clock size={14} className="text-accent" />
                  <span>Sales Velocity Timeline for this Cracker ({isHourly ? 'By Hour' : 'By Day'})</span>
                </h4>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedProduct.hourlyOrDailyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid stroke="#E2E2DE" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="#6B6B66" fontSize={10} />
                      <YAxis stroke="#6B6B66" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(val: any) => [`${val} boxes`, 'Quantity Sold']}
                        contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E2DE', borderRadius: '6px', fontSize: '11px' }}
                      />
                      <Bar dataKey="qty" fill="#C2410C" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Individual Customer Transactions Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-text flex items-center justify-between">
                <span>Recent Customer Invoices Containing this Cracker:</span>
                <span className="text-[11px] text-text-muted font-normal">
                  {selectedProduct.recentSales.length} total entries
                </span>
              </h4>

              <div className="border border-border rounded-lg max-h-56 overflow-y-auto">
                {selectedProduct.recentSales.length === 0 ? (
                  <p className="p-4 text-center text-xs text-text-muted">
                    No transactions recorded for this item in the selected period.
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-surface border-b border-border text-text-muted text-left sticky top-0 font-semibold">
                      <tr>
                        <th className="p-2">Bill No</th>
                        <th className="p-2">Date &amp; Time</th>
                        <th className="p-2">Customer</th>
                        <th className="p-2 text-right">Qty</th>
                        <th className="p-2 text-right">Rate (₹)</th>
                        <th className="p-2 text-right">Total (₹)</th>
                        <th className="p-2 text-center">Mode</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedProduct.recentSales.map((s, idx) => (
                        <tr key={idx} className="hover:bg-surface/50">
                          <td className="p-2 font-mono font-bold text-accent">{s.billNo}</td>
                          <td className="p-2 text-text-muted text-[11px]">{formatISTDate(s.createdAt)}</td>
                          <td className="p-2 font-semibold text-text">{s.customerName}</td>
                          <td className="p-2 text-right font-mono font-bold">{s.qty}</td>
                          <td className="p-2 text-right font-mono text-text-muted">{formatINR(s.unitPrice)}</td>
                          <td className="p-2 text-right font-mono font-bold text-text">{formatINR(s.lineTotal)}</td>
                          <td className="p-2 text-center">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-background border border-border">
                              {s.paymentMode}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setSelectedProduct(null)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* SET MONTHLY SALES TARGET MODAL */}
      <Dialog
        isOpen={isTargetModalOpen}
        onClose={() => setIsTargetModalOpen(false)}
        title="Set Monthly Sales Target"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <Input
            label="Target Revenue Amount (₹)"
            type="number"
            value={newTargetAmount}
            onChange={(e) => setNewTargetAmount(e.target.value)}
            placeholder="500000"
          />
          <p className="text-xs text-text-muted">
            The target is used to calculate daily run-rate goals for your VNA Traders fireworks store.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setIsTargetModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveTargetMutation.mutate(parseFloat(newTargetAmount) || 0)}
              disabled={saveTargetMutation.isPending}
            >
              {saveTargetMutation.isPending ? 'Saving...' : 'Save Target'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};