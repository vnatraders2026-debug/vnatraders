import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/db';
import { TargetProgress } from '@/types';
import { formatINR, formatISTDate, formatNumber } from '@/lib/format';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import {
  TrendingUp,
  Receipt,
  Coins,
  PackageCheck,
  Target,
  Edit2,
  Calendar,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<'today' | '7days' | 'month' | 'fy'>('month');
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [newTargetAmount, setNewTargetAmount] = useState('500000');

  useEffect(() => {
    const handleSync = () => {
      queryClient.invalidateQueries({ queryKey: ['admin_dashboard_metrics'] });
    };
    window.addEventListener('bills-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('bills-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, [queryClient]);

  // Fetch all bills and items from Dexie (instant and offline-ready)
  const { data, isLoading } = useQuery({
    queryKey: ['admin_dashboard_metrics', dateRange],
    queryFn: async () => {
      const allBills = await db.bills.toArray();
      const allItems = await db.bill_items.toArray();
      const allLogs = await db.activity_logs.orderBy('id').reverse().limit(10).toArray();
      const allProfiles = await db.profiles.toArray();
      const profMap = new Map<string, string>();
      allProfiles.forEach((p) => profMap.set(p.id, p.full_name));

      // Target from settings or monthly_targets table
      const targetSetting = await db.settings.get('monthly_target');
      const targetAmount = targetSetting ? Number(targetSetting.value) : 500000;

      // Filter by period
      const now = new Date();
      let startTime = 0;
      let prevStartTime = 0;
      let prevEndTime = 0;

      if (dateRange === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        startTime = start.getTime();
        prevStartTime = startTime - 24 * 60 * 60 * 1000;
        prevEndTime = startTime;
      } else if (dateRange === '7days') {
        startTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;
        prevStartTime = startTime - 7 * 24 * 60 * 60 * 1000;
        prevEndTime = startTime;
      } else if (dateRange === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        startTime = start.getTime();
        const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevStartTime = prevStart.getTime();
        prevEndTime = startTime;
      } else if (dateRange === 'fy') {
        // Indian Financial Year: April 1st to March 31st
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const start = new Date(currentYear, 3, 1);
        startTime = start.getTime();
        prevStartTime = new Date(currentYear - 1, 3, 1).getTime();
        prevEndTime = startTime;
      }

      const currentPeriodBills = allBills.filter(
        (b) => new Date(b.created_at).getTime() >= startTime
      );
      const prevPeriodBills = allBills.filter((b) => {
        const t = new Date(b.created_at).getTime();
        return t >= prevStartTime && t < prevEndTime;
      });

      // KPI calculations
      const totalSales = currentPeriodBills.reduce((acc, b) => acc + b.total, 0);
      const prevSales = prevPeriodBills.reduce((acc, b) => acc + b.total, 0);

      const billCount = currentPeriodBills.length;
      const prevBillCount = prevPeriodBills.length;

      const avgBill = billCount > 0 ? totalSales / billCount : 0;
      const prevAvgBill = prevBillCount > 0 ? prevSales / prevBillCount : 0;

      const currentBillIds = new Set(currentPeriodBills.map((b) => b.id));
      const itemsSold = allItems
        .filter((item) => currentBillIds.has(item.bill_id))
        .reduce((acc, i) => acc + i.qty, 0);

      const prevBillIds = new Set(prevPeriodBills.map((b) => b.id));
      const prevItemsSold = allItems
        .filter((item) => prevBillIds.has(item.bill_id))
        .reduce((acc, i) => acc + i.qty, 0);

      // Daily sales chart data
      const dailySalesMap = new Map<string, number>();
      currentPeriodBills.forEach((b) => {
        const dateKey = b.created_at.slice(0, 10);
        dailySalesMap.set(dateKey, (dailySalesMap.get(dateKey) || 0) + b.total);
      });

      const dailySalesChart = Array.from(dailySalesMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => ({
          date: date.slice(5),
          amount,
        }));

      // Top 10 products
      const productSalesMap = new Map<string, { qty: number; revenue: number }>();
      allItems
        .filter((item) => currentBillIds.has(item.bill_id))
        .forEach((item) => {
          const existing = productSalesMap.get(item.product_name) || { qty: 0, revenue: 0 };
          productSalesMap.set(item.product_name, {
            qty: existing.qty + item.qty,
            revenue: existing.revenue + item.line_total,
          });
        });

      const topProducts = Array.from(productSalesMap.entries())
        .map(([name, stat]) => ({ name, ...stat }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Sales by staff
      const staffMap = new Map<string, number>();
      currentPeriodBills.forEach((b) => {
        const staffName = profMap.get(b.created_by) || 'Staff';
        staffMap.set(staffName, (staffMap.get(staffName) || 0) + b.total);
      });

      const salesByStaff = Array.from(staffMap.entries()).map(([staff, amount]) => ({
        staff,
        amount,
      }));

      // Payment mode split
      const modeMap = new Map<string, { count: number; total: number }>();
      currentPeriodBills.forEach((b) => {
        const existing = modeMap.get(b.payment_mode) || { count: 0, total: 0 };
        modeMap.set(b.payment_mode, {
          count: existing.count + 1,
          total: existing.total + b.total,
        });
      });

      const paymentModes = Array.from(modeMap.entries()).map(([mode, data]) => ({
        mode: mode.toUpperCase(),
        ...data,
      }));

      // Monthly target progress
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const currentDay = now.getDate();
      const daysRemaining = Math.max(0, daysInMonth - currentDay);
      const achievedMonth = allBills
        .filter((b) => {
          const d = new Date(b.created_at);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        })
        .reduce((acc, b) => acc + b.total, 0);

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

      // Recent 10 bills
      const recentBills = allBills
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

      return {
        kpis: {
          totalSales: { current: totalSales, prev: prevSales },
          billCount: { current: billCount, prev: prevBillCount },
          avgBill: { current: avgBill, prev: prevAvgBill },
          itemsSold: { current: itemsSold, prev: prevItemsSold },
        },
        dailySalesChart,
        topProducts,
        salesByStaff,
        paymentModes,
        targetProgress,
        recentBills,
        recentLogs: allLogs,
        profiles: profMap,
      };
    },
    staleTime: 30000,
  });

  const saveTargetMutation = useMutation({
    mutationFn: async (amount: number) => {
      await db.settings.put({ key: 'monthly_target', value: amount });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_dashboard_metrics'] });
      setIsTargetModalOpen(false);
      toast('Monthly target updated successfully', 'success');
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center pb-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { kpis, dailySalesChart, topProducts, salesByStaff, paymentModes, targetProgress, recentBills, recentLogs } = data;

  const getPctDiff = (current: number, prev: number) => {
    if (prev === 0) return current > 0 ? '+100%' : '0%';
    const pct = Math.round(((current - prev) / prev) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  };

  return (
    <div className="space-y-6">
      {/* Date Range Selector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-border rounded p-4">
        <div>
          <h2 className="text-base font-semibold text-text">Business Performance</h2>
          <p className="text-xs text-text-muted">Real-time revenue, targets and store telemetry</p>
        </div>

        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-text-muted" />
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="text-xs min-h-[38px] w-48"
          >
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="month">This Month</option>
            <option value="fy">Financial Year (FY)</option>
          </Select>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Sales */}
        <div className="bg-surface border border-border rounded p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Total Sales</span>
            <TrendingUp size={16} className="text-accent" />
          </div>
          <div className="text-xl font-bold tabular-nums text-text">
            {formatINR(kpis.totalSales.current)}
          </div>
          <div className="text-[11px] text-text-muted">
            <span className="font-semibold text-text">{getPctDiff(kpis.totalSales.current, kpis.totalSales.prev)}</span>{' '}
            vs previous period
          </div>
        </div>

        {/* Bill Count */}
        <div className="bg-surface border border-border rounded p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Total Bills</span>
            <Receipt size={16} className="text-text-muted" />
          </div>
          <div className="text-xl font-bold tabular-nums text-text">
            {kpis.billCount.current}
          </div>
          <div className="text-[11px] text-text-muted">
            <span className="font-semibold text-text">{getPctDiff(kpis.billCount.current, kpis.billCount.prev)}</span>{' '}
            vs previous period
          </div>
        </div>

        {/* Average Bill Value */}
        <div className="bg-surface border border-border rounded p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Average Bill</span>
            <Coins size={16} className="text-text-muted" />
          </div>
          <div className="text-xl font-bold tabular-nums text-text">
            {formatINR(kpis.avgBill.current)}
          </div>
          <div className="text-[11px] text-text-muted">
            <span className="font-semibold text-text">{getPctDiff(kpis.avgBill.current, kpis.avgBill.prev)}</span>{' '}
            vs previous period
          </div>
        </div>

        {/* Items Sold */}
        <div className="bg-surface border border-border rounded p-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>Items Sold</span>
            <PackageCheck size={16} className="text-text-muted" />
          </div>
          <div className="text-xl font-bold tabular-nums text-text">
            {formatNumber(kpis.itemsSold.current)}
          </div>
          <div className="text-[11px] text-text-muted">
            <span className="font-semibold text-text">{getPctDiff(kpis.itemsSold.current, kpis.itemsSold.prev)}</span>{' '}
            vs previous period
          </div>
        </div>
      </div>

      {/* MONTHLY TARGET PROGRESS PANEL */}
      <div className="bg-surface border border-border rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={18} className="text-accent" />
            <h3 className="text-sm font-semibold text-text">Monthly Target & Progress</h3>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setNewTargetAmount(String(targetProgress.target_amount));
              setIsTargetModalOpen(true);
            }}
            className="min-h-[32px] py-1 text-xs"
          >
            <Edit2 size={12} />
            <span>Set Target</span>
          </Button>
        </div>

        {/* Plain progress bar with solid flat fill */}
        <div className="w-full bg-border rounded-full h-3 overflow-hidden">
          <div
            className="bg-accent h-full transition-all duration-150"
            style={{ width: `${Math.min(100, targetProgress.percentage)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
          <div>
            <span className="text-text-muted block">Monthly Target:</span>
            <span className="font-semibold tabular-nums text-text">{formatINR(targetProgress.target_amount)}</span>
          </div>
          <div>
            <span className="text-text-muted block">Achieved Revenue:</span>
            <span className="font-semibold tabular-nums text-accent">{formatINR(targetProgress.achieved_amount)} ({targetProgress.percentage}%)</span>
          </div>
          <div>
            <span className="text-text-muted block">Days Remaining:</span>
            <span className="font-semibold text-text">{targetProgress.days_remaining} days</span>
          </div>
          <div>
            <span className="text-text-muted block">Req. Daily Average:</span>
            <span className="font-semibold tabular-nums text-text">{formatINR(targetProgress.required_daily_avg)}/day</span>
          </div>
        </div>
      </div>

      {/* CHARTS ROW (Solid flat fills only, no gradients) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Sales Trend */}
        <div className="bg-surface border border-border rounded p-4 space-y-3">
          <h3 className="text-sm font-semibold text-text">Daily Sales Trend (₹)</h3>
          <div className="h-64 w-full">
            {dailySalesChart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-text-muted">
                No billing entries in this date range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySalesChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E2DE" strokeDasharray="3 3" />
                  <XAxis dataKey="date" stroke="#6B6B66" fontSize={11} />
                  <YAxis stroke="#6B6B66" fontSize={11} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip
                    formatter={(val: any) => [formatINR(Number(val)), 'Sales']}
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E2DE', borderRadius: '6px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#C2410C"
                    strokeWidth={2}
                    dot={{ fill: '#C2410C', r: 3 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top 10 Products */}
        <div className="bg-surface border border-border rounded p-4 space-y-3">
          <h3 className="text-sm font-semibold text-text">Top Selling Products</h3>
          <div className="h-64 w-full">
            {topProducts.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-text-muted">
                No items sold yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                  <CartesianGrid stroke="#E2E2DE" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="#6B6B66" fontSize={11} tickFormatter={(val) => `₹${val}`} />
                  <YAxis type="category" dataKey="name" stroke="#6B6B66" fontSize={10} width={90} />
                  <Tooltip
                    formatter={(val: any) => [formatINR(Number(val)), 'Revenue']}
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E2DE', borderRadius: '6px' }}
                  />
                  <Bar dataKey="revenue" fill="#C2410C" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* SECOND CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales by Staff */}
        <div className="bg-surface border border-border rounded p-4 space-y-3">
          <h3 className="text-sm font-semibold text-text">Sales by Cashier / Staff</h3>
          <div className="h-56 w-full">
            {salesByStaff.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-text-muted">
                No records found
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByStaff} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#E2E2DE" strokeDasharray="3 3" />
                  <XAxis dataKey="staff" stroke="#6B6B66" fontSize={11} />
                  <YAxis stroke="#6B6B66" fontSize={11} tickFormatter={(val) => `₹${val}`} />
                  <Tooltip
                    formatter={(val: any) => [formatINR(Number(val)), 'Sales']}
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E2DE', borderRadius: '6px' }}
                  />
                  <Bar dataKey="amount" fill="#1C1C1A" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Payment Mode Split */}
        <div className="bg-surface border border-border rounded p-4 space-y-3">
          <h3 className="text-sm font-semibold text-text">Payment Mode Split</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-background border-b border-border">
                <tr>
                  <th className="p-2 text-left">Payment Mode</th>
                  <th className="p-2 text-right">Bill Count</th>
                  <th className="p-2 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paymentModes.map((pm) => (
                  <tr key={pm.mode}>
                    <td className="p-2 font-semibold text-text">{pm.mode}</td>
                    <td className="p-2 text-right tabular-nums">{pm.count}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{formatINR(pm.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RECENT ACTIVITY & RECENT BILLS PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Bills (Last 10) */}
        <div className="bg-surface border border-border rounded p-4 space-y-3">
          <h3 className="text-sm font-semibold text-text">Recent Bills</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-background border-b border-border">
                <tr>
                  <th className="p-2 text-left">Bill No</th>
                  <th className="p-2 text-left">Customer</th>
                  <th className="p-2 text-right">Amount</th>
                  <th className="p-2 text-left">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentBills.map((b) => (
                  <tr key={b.id}>
                    <td className="p-2 font-mono font-medium text-accent">{b.bill_no}</td>
                    <td className="p-2">{b.customer_name || 'Walk-in'}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{formatINR(b.total)}</td>
                    <td className="p-2 uppercase text-text-muted">{b.payment_mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity Log (Last 10) */}
        <div className="bg-surface border border-border rounded p-4 space-y-3">
          <h3 className="text-sm font-semibold text-text">Recent Activity Logs</h3>
          <div className="divide-y divide-border max-h-60 overflow-y-auto">
            {recentLogs.length === 0 ? (
              <p className="text-xs text-text-muted p-4 text-center">No logs recorded yet</p>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="py-2 text-xs flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-text">{log.summary}</span>
                    <p className="text-[11px] text-text-muted">By {log.user_name || 'User'}</p>
                  </div>
                  <span className="text-[10px] text-text-muted shrink-0 ml-2">
                    {formatISTDate(log.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* SET TARGET MODAL */}
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
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setIsTargetModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => saveTargetMutation.mutate(parseFloat(newTargetAmount) || 0)}
            >
              Save Target
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
