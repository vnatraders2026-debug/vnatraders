import React, { useState, useEffect, useMemo } from 'react';
import { db, adjustProductStock, initLocalDatabase, DEFAULT_COMPANY_ID } from '@/db';
import { useCompany } from '@/features/companies/CompanyContext';
import { Product, StockMovement, StockMovementType } from '@/types';
import { formatINR } from '@/lib/format';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Boxes,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  History,
  RotateCcw,
  SlidersHorizontal,
  Tag,
} from 'lucide-react';

export const StockPage: React.FC = () => {
  const { user } = useAuth();
  const { activeCompanyId, isAllCompanies } = useCompany();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs: 'inventory' | 'ledger'
  const [activeTab, setActiveTab] = useState<'inventory' | 'ledger'>('inventory');

  // Inventory Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');

  // Ledger Filter
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');

  // Stock Adjustment Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustmentMode, setAdjustmentMode] = useState<'set' | 'delta'>('set');
  const [newStockValue, setNewStockValue] = useState<number>(0);
  const [deltaValue, setDeltaValue] = useState<number>(0);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Inventory count reconciliation');
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      let prods = await db.products.toArray();
      if (prods.length === 0) {
        await initLocalDatabase();
        prods = await db.products.toArray();
      }
      setProducts(prods);

      const m = await db.stock_movements.reverse().sortBy('created_at');
      setMovements(m);
    } catch (err: any) {
      toast(err?.message || 'Failed to load stock data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleRefreshed = () => loadData();
    window.addEventListener('supabase-data-refreshed', handleRefreshed);
    return () => {
      window.removeEventListener('supabase-data-refreshed', handleRefreshed);
    };
  }, []);

  // Company scoped products
  const companyProducts = useMemo(() => {
    return products.filter(
      (p) =>
        isAllCompanies ||
        p.company_id === activeCompanyId ||
        (!p.company_id && activeCompanyId === DEFAULT_COMPANY_ID)
    );
  }, [products, isAllCompanies, activeCompanyId]);

  // Company scoped movements
  const companyMovements = useMemo(() => {
    return movements.filter(
      (m) =>
        isAllCompanies ||
        m.company_id === activeCompanyId ||
        (!m.company_id && activeCompanyId === DEFAULT_COMPANY_ID)
    );
  }, [movements, isAllCompanies, activeCompanyId]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalItems = companyProducts.length;
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let totalStockUnits = 0;
    let retailValuation = 0;
    let wholesaleValuation = 0;

    companyProducts.forEach((p) => {
      const s = p.stock || 0;
      totalStockUnits += s;
      retailValuation += s * (p.price || 0);
      wholesaleValuation += s * (p.wholesale_price || p.price || 0);

      if (s === 0) {
        outOfStock++;
      } else if (s <= 20) {
        lowStock++;
      } else {
        inStock++;
      }
    });

    return {
      totalItems,
      inStock,
      lowStock,
      outOfStock,
      totalStockUnits,
      retailValuation,
      wholesaleValuation,
    };
  }, [companyProducts]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return companyProducts.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (brandFilter !== 'all' && (p.brand || 'Standard') !== brandFilter) return false;

      const s = p.stock || 0;
      if (stockStatusFilter === 'out_of_stock' && s !== 0) return false;
      if (stockStatusFilter === 'low_stock' && (s === 0 || s > 20)) return false;
      if (stockStatusFilter === 'in_stock' && s <= 20) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesCode = p.code.toLowerCase().includes(q);
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesBrand = (p.brand || '').toLowerCase().includes(q);
        return matchesCode || matchesName || matchesBrand;
      }
      return true;
    });
  }, [companyProducts, searchQuery, categoryFilter, brandFilter, stockStatusFilter]);

  // Filtered Ledger Movements
  const filteredMovements = useMemo(() => {
    return companyMovements.filter((m) => {
      if (movementTypeFilter !== 'all' && m.type !== movementTypeFilter) return false;
      if (ledgerSearchQuery.trim()) {
        const q = ledgerSearchQuery.toLowerCase().trim();
        const matchesProd = m.product_name.toLowerCase().includes(q) || m.product_code.toLowerCase().includes(q);
        const matchesRef = (m.reference_no || '').toLowerCase().includes(q);
        const matchesReason = (m.reason || '').toLowerCase().includes(q);
        return matchesProd || matchesRef || matchesReason;
      }
      return true;
    });
  }, [companyMovements, movementTypeFilter, ledgerSearchQuery]);

  const handleOpenAdjustModal = (product: Product) => {
    setSelectedProduct(product);
    setNewStockValue(product.stock || 0);
    setDeltaValue(0);
    setAdjustmentMode('set');
    setAdjustmentReason('Physical stock audit count');
    setIsAdjustModalOpen(true);
  };

  const handleSaveStockAdjustment = async () => {
    if (!selectedProduct) return;
    setIsSavingAdjustment(true);
    try {
      const finalStock =
        adjustmentMode === 'set'
          ? Math.max(0, Math.round(Number(newStockValue) || 0))
          : Math.max(0, Math.round((selectedProduct.stock || 0) + Number(deltaValue) || 0));

      const updated = await adjustProductStock(
        selectedProduct.id,
        finalStock,
        adjustmentReason.trim() || 'Inventory stock reconciliation',
        user?.full_name || user?.email || 'Admin'
      );

      if (updated) {
        toast(`Updated stock for ${selectedProduct.name} to ${finalStock} ${selectedProduct.unit}`, 'success');
        setIsAdjustModalOpen(false);
        loadData();
      }
    } catch (err: any) {
      toast(err?.message || 'Failed to update stock', 'error');
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  const getMovementTypeBadge = (type: StockMovementType) => {
    switch (type) {
      case 'purchase':
      case 'in':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-success-light text-success border border-success/20">STOCK IN</span>;
      case 'sale':
      case 'out':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent/10 text-accent border border-accent/20">SALE OUT</span>;
      case 'damage':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-danger-light text-danger border border-danger/20">DAMAGE</span>;
      case 'return':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">RETURN</span>;
      case 'adjustment':
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">ADJUSTMENT</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-black text-text tracking-tight flex items-center gap-2">
            <Boxes className="text-accent" size={24} />
            <span>Stock & Inventory Management</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Accurate live stock control, physical reconciliation, and movement history for VNA Traders.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-surface border border-border rounded p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-colors ${
              activeTab === 'inventory' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
            }`}
          >
            <Boxes size={14} />
            <span>Live Stock ({products.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-colors ${
              activeTab === 'ledger' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
            }`}
          >
            <History size={14} />
            <span>Movement Ledger ({movements.length})</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted uppercase">Total SKUs</span>
          <div className="text-xl font-black text-text mt-1">{metrics.totalItems}</div>
          <span className="text-[10px] text-text-muted">{metrics.totalStockUnits.toLocaleString()} total units</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-success flex items-center gap-1">
            <CheckCircle2 size={13} /> In Stock
          </span>
          <div className="text-xl font-black text-success mt-1">{metrics.inStock}</div>
          <span className="text-[10px] text-text-muted">Healthy quantity</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
            <AlertTriangle size={13} /> Low Stock (≤ 20)
          </span>
          <div className="text-xl font-black text-amber-600 mt-1">{metrics.lowStock}</div>
          <span className="text-[10px] text-text-muted">Needs reorder soon</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-danger flex items-center gap-1">
            <XCircle size={13} /> Out of Stock
          </span>
          <div className="text-xl font-black text-danger mt-1">{metrics.outOfStock}</div>
          <span className="text-[10px] text-text-muted">Zero inventory</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs col-span-1 md:col-span-2 lg:col-span-1">
          <span className="text-[11px] font-semibold text-text-muted uppercase">Retail Valuation</span>
          <div className="text-base font-bold text-accent font-mono mt-1">{formatINR(metrics.retailValuation)}</div>
          <span className="text-[10px] text-text-muted">At MRP rates</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs col-span-1 md:col-span-2 lg:col-span-1">
          <span className="text-[11px] font-semibold text-text-muted uppercase">Wholesale Value</span>
          <div className="text-base font-bold text-text font-mono mt-1">{formatINR(metrics.wholesaleValuation)}</div>
          <span className="text-[10px] text-text-muted">At wholesale cost</span>
        </div>
      </div>

      {/* TAB 1: LIVE INVENTORY */}
      {activeTab === 'inventory' && (
        <div className="space-y-3">
          {/* Filters Bar */}
          <div className="bg-surface border border-border rounded p-3 flex flex-wrap gap-2.5 items-center justify-between">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                placeholder="Search by code, product name, or brand..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs min-h-[38px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={stockStatusFilter}
                onChange={(e) => setStockStatusFilter(e.target.value as any)}
                className="text-xs min-h-[38px]"
              >
                <option value="all">All Stock Statuses</option>
                <option value="in_stock">In Stock (&gt; 20)</option>
                <option value="low_stock">Low Stock (1 - 20)</option>
                <option value="out_of_stock">Out of Stock (0)</option>
              </Select>

              <Select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="text-xs min-h-[38px]"
              >
                <option value="all">All Brands</option>
                {Array.from(new Set(products.map((p) => p.brand || 'Standard'))).sort().map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>

              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs min-h-[38px]"
              >
                <option value="all">All Categories</option>
                {Array.from(new Set(products.map((p) => p.category))).sort().map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>

              {(searchQuery || categoryFilter !== 'all' || brandFilter !== 'all' || stockStatusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setBrandFilter('all');
                    setStockStatusFilter('all');
                  }}
                  className="text-danger hover:underline text-xs font-semibold px-2 flex items-center gap-1"
                >
                  <RotateCcw size={12} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : filteredProducts.length === 0 ? (
            <EmptyState message="No inventory products match your criteria" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Retail (₹)</TableHead>
                  <TableHead className="text-right">Wholesale (₹)</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => {
                  const s = p.stock || 0;
                  const isLow = s > 0 && s <= 20;
                  const isOut = s === 0;

                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-bold text-accent">{p.code}</TableCell>
                      <TableCell className="font-semibold text-text">{p.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-background border border-border">
                          <Tag size={10} className="text-accent" />
                          {p.brand || 'Standard'}
                        </span>
                      </TableCell>
                      <TableCell className="text-text-muted text-xs">{p.category}</TableCell>
                      <TableCell className="text-right font-mono font-medium">{formatINR(p.price)}</TableCell>
                      <TableCell className="text-right font-mono font-medium text-accent">
                        {p.wholesale_price && p.wholesale_price > 0 ? (
                          formatINR(p.wholesale_price)
                        ) : (
                          <span className="text-text-muted text-[11px]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-base">
                        <span className={isOut ? 'text-danger' : isLow ? 'text-amber-600' : 'text-text'}>
                          {s} <span className="text-[10px] text-text-muted font-normal">{p.unit}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-danger-light text-danger">
                            <XCircle size={11} /> Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600">
                            <AlertTriangle size={11} /> Low Stock ({s})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-success-light text-success">
                            <CheckCircle2 size={11} /> In Stock
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenAdjustModal(p)}
                            className="gap-1 min-h-[30px] text-xs font-semibold"
                            title="Adjust or audit stock quantity"
                          >
                            <SlidersHorizontal size={12} />
                            <span>Adjust</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* TAB 2: STOCK MOVEMENT HISTORY LEDGER */}
      {activeTab === 'ledger' && (
        <div className="space-y-3">
          <div className="bg-surface border border-border rounded p-3 flex flex-wrap gap-2.5 items-center justify-between">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                placeholder="Search ledger by product, reference number, or reason..."
                value={ledgerSearchQuery}
                onChange={(e) => setLedgerSearchQuery(e.target.value)}
                className="pl-9 text-xs min-h-[38px]"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="text-xs min-h-[38px]"
              >
                <option value="all">All Movement Types</option>
                <option value="sale">Sale (Out)</option>
                <option value="purchase">Purchase (In)</option>
                <option value="adjustment">Stock Adjustment</option>
                <option value="damage">Damage / Breakage</option>
                <option value="return">Customer Return</option>
              </Select>
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : filteredMovements.length === 0 ? (
            <EmptyState message="No stock ledger records found" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Movement Type</TableHead>
                  <TableHead>Reference No</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty Change</TableHead>
                  <TableHead className="text-right">Before ➔ After</TableHead>
                  <TableHead>Reason / Notes</TableHead>
                  <TableHead>Logged By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs text-text-muted whitespace-nowrap">
                      {new Date(m.created_at).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>{getMovementTypeBadge(m.type)}</TableCell>
                    <TableCell className="font-mono font-bold text-xs text-accent">
                      {m.reference_no || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-text">{m.product_name}</div>
                      <span className="font-mono text-[10px] text-text-muted">{m.product_code}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-black text-sm">
                      <span className={m.qty > 0 ? 'text-success' : m.qty < 0 ? 'text-danger' : 'text-text'}>
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-text-muted whitespace-nowrap">
                      {m.prev_stock} ➔ <strong className="text-text font-bold">{m.new_stock}</strong>
                    </TableCell>
                    <TableCell className="text-xs text-text-muted max-w-[220px] truncate" title={m.reason}>
                      {m.reason || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-text-muted">{m.created_by || 'System'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      {selectedProduct && (
        <Dialog
          isOpen={isAdjustModalOpen}
          onClose={() => setIsAdjustModalOpen(false)}
          title={`Adjust Stock: ${selectedProduct.name}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="bg-background border border-border rounded p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-text-muted">Product Code:</span>
                <span className="font-mono font-bold text-accent">{selectedProduct.code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Brand / Category:</span>
                <span className="font-semibold text-text">{selectedProduct.brand || 'Standard'} • {selectedProduct.category}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5">
                <span className="text-text-muted font-medium">Current System Stock:</span>
                <span className="font-mono font-black text-sm text-text">
                  {selectedProduct.stock} {selectedProduct.unit}
                </span>
              </div>
            </div>

            {/* Mode Selector */}
            <div className="flex rounded border border-border p-0.5 bg-background text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAdjustmentMode('set')}
                className={`flex-1 py-1.5 rounded transition-colors ${
                  adjustmentMode === 'set' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                }`}
              >
                Set Exact Physical Count
              </button>
              <button
                type="button"
                onClick={() => setAdjustmentMode('delta')}
                className={`flex-1 py-1.5 rounded transition-colors ${
                  adjustmentMode === 'delta' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                }`}
              >
                Add / Deduct Quantity (+ / -)
              </button>
            </div>

            {adjustmentMode === 'set' ? (
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  New Verified Stock Count ({selectedProduct.unit}) <span className="text-danger">*</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  value={newStockValue}
                  onChange={(e) => setNewStockValue(Math.max(0, parseInt(e.target.value) || 0))}
                  className="font-mono text-base font-bold"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Add (+) or Deduct (-) Quantity ({selectedProduct.unit}) <span className="text-danger">*</span>
                </label>
                <Input
                  type="number"
                  value={deltaValue}
                  onChange={(e) => setDeltaValue(parseInt(e.target.value) || 0)}
                  placeholder="e.g. 50 or -10"
                  className="font-mono text-base font-bold"
                />
                <span className="text-[11px] text-text-muted mt-1 block">
                  Resulting Stock: <strong>{Math.max(0, (selectedProduct.stock || 0) + (Number(deltaValue) || 0))}</strong> {selectedProduct.unit}
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Reason / Audit Note <span className="text-danger">*</span>
              </label>
              <Input
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                placeholder="e.g. Annual Diwali physical audit, Damage unpacking, Free sample"
                className="text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setIsAdjustModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveStockAdjustment}
                disabled={isSavingAdjustment}
              >
                {isSavingAdjustment ? 'Saving...' : 'Confirm Stock Update'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
