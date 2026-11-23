import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, DEFAULT_COMPANY_ID, initLocalDatabase } from '@/db';
import { useCompany } from '@/features/companies/CompanyContext';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, PackageX, X, ChevronDown, ChevronUp, ArrowRight, BellRing } from 'lucide-react';

export interface StockAlertItem {
  id: string;
  code: string;
  name: string;
  brand: string;
  stock: number;
  min_stock: number;
  severity: 'zero' | 'low';
}

export const StockAlertBanner: React.FC = () => {
  const navigate = useNavigate();
  const { activeCompanyId, isAllCompanies } = useCompany();
  const [zeroItems, setZeroItems] = useState<StockAlertItem[]>([]);
  const [lowItems, setLowItems] = useState<StockAlertItem[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchStockAlerts = useCallback(async () => {
    try {
      await initLocalDatabase();
      const allProducts = await db.products.toArray();

      const companyProducts = allProducts.filter(
        (p) =>
          p.is_active !== false &&
          (isAllCompanies ||
            !p.company_id ||
            p.company_id === activeCompanyId ||
            (!p.company_id && activeCompanyId === DEFAULT_COMPANY_ID) ||
            activeCompanyId === DEFAULT_COMPANY_ID)
      );

      const zero: StockAlertItem[] = [];
      const low: StockAlertItem[] = [];

      companyProducts.forEach((p) => {
        const stock = Number(p.stock) || 0;
        const minStock = Number(p.min_stock) || 20;
        const item: StockAlertItem = {
          id: p.id,
          code: p.code || '',
          name: p.name,
          brand: p.brand || '',
          stock,
          min_stock: minStock,
          severity: stock === 0 ? 'zero' : 'low',
        };
        if (stock === 0) {
          zero.push(item);
        } else if (stock > 0 && stock <= minStock) {
          low.push(item);
        }
      });

      zero.sort((a, b) => a.name.localeCompare(b.name));
      low.sort((a, b) => a.stock - b.stock);

      setZeroItems(zero);
      setLowItems(low);
    } catch (err) {
      console.warn('StockAlertBanner: failed to load stock data', err);
    } finally {
      setLoaded(true);
    }
  }, [activeCompanyId, isAllCompanies]);

  useEffect(() => {
    fetchStockAlerts();

    const handleUpdate = () => {
      fetchStockAlerts();
    };

    window.addEventListener('stock-changed', handleUpdate);
    window.addEventListener('supabase-data-refreshed', handleUpdate);
    window.addEventListener('bills-synced', handleUpdate);

    return () => {
      window.removeEventListener('stock-changed', handleUpdate);
      window.removeEventListener('supabase-data-refreshed', handleUpdate);
      window.removeEventListener('bills-synced', handleUpdate);
    };
  }, [fetchStockAlerts]);

  if (!loaded || dismissed) return null;

  const totalAlerts = zeroItems.length + lowItems.length;
  if (totalAlerts === 0) return null;

  const displayItems = expanded
    ? [...zeroItems, ...lowItems]
    : [...zeroItems.slice(0, 4), ...lowItems.slice(0, Math.max(0, 6 - zeroItems.length))];

  return (
    <div className="mx-4 mt-3 mb-1 rounded-xl border-2 border-red-500/50 bg-red-500/10 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Alert Header */}
      <div className="flex items-center justify-between p-3 pb-2 border-b border-red-500/20">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="flex items-center justify-center p-1 rounded-full bg-red-600 text-white animate-bounce">
              <BellRing size={14} />
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-red-700 dark:text-red-400">
              CRITICAL STOCK ALERTS:
            </span>
          </div>

          <div className="flex items-center gap-2">
            {zeroItems.length > 0 && (
              <span className="flex items-center gap-1 bg-red-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full shadow-sm stock-blink-danger">
                <PackageX size={12} />
                {zeroItems.length} OUT OF STOCK
              </span>
            )}
            {lowItems.length > 0 && (
              <span className="flex items-center gap-1 bg-amber-500 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full shadow-sm stock-blink-warning">
                <AlertTriangle size={12} />
                {lowItems.length} LOW STOCK
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/stock')}
            className="text-xs font-bold gap-1 h-7 px-3 bg-red-600 hover:bg-red-700 text-white shadow-sm"
          >
            <ArrowRight size={13} />
            <span>Manage Stock</span>
          </Button>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="text-text-muted hover:text-text p-1 rounded hover:bg-surface/50"
            title={expanded ? 'Collapse' : 'Expand all products'}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-text-muted hover:text-danger p-1 rounded hover:bg-surface/50"
            title="Hide for now"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Items list */}
      <div className="p-3 pt-2.5 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {displayItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs border ${
                item.severity === 'zero'
                  ? 'bg-red-500/15 border-red-500/40 text-red-800 dark:text-red-300 font-medium'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300 font-medium'
              }`}
            >
              <div className="min-w-0 pr-1">
                <span className="font-mono text-[10px] opacity-75 mr-1 font-bold">[{item.code}]</span>
                <span className="font-bold truncate">{item.name}</span>
                {item.brand && (
                  <span className="ml-1 text-[10px] opacity-70">({item.brand})</span>
                )}
              </div>
              <span className="font-black whitespace-nowrap shrink-0 font-mono">
                {item.severity === 'zero' ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] stock-blink-danger">
                    <PackageX size={10} /> 0 Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] stock-blink-warning">
                    {item.stock} (Min: {item.min_stock})
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        {!expanded && totalAlerts > displayItems.length && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[11px] text-red-700 dark:text-red-400 font-bold hover:underline underline-offset-2 flex items-center gap-1 mt-1"
          >
            + View all {totalAlerts} affected products (click to expand)
          </button>
        )}
      </div>
    </div>
  );
};
