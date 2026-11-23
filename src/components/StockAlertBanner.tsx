import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, DEFAULT_COMPANY_ID } from '@/db';
import { useCompany } from '@/features/companies/CompanyContext';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, PackageX, X, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';

interface StockAlertItem {
  id: string;
  code: string;
  name: string;
  brand: string;
  stock: number;
  min_stock: number;
  severity: 'zero' | 'low';
}

const DISMISSED_KEY = 'vna_stock_alert_dismissed';

export const StockAlertBanner: React.FC = () => {
  const navigate = useNavigate();
  const { activeCompanyId, isAllCompanies } = useCompany();
  const [zeroItems, setZeroItems] = useState<StockAlertItem[]>([]);
  const [lowItems, setLowItems] = useState<StockAlertItem[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Check if already dismissed this session
    const sessionKey = `${DISMISSED_KEY}_${activeCompanyId}`;
    if (sessionStorage.getItem(sessionKey) === 'true') {
      setDismissed(true);
      setLoaded(true);
      return;
    }

    const fetchStockAlerts = async () => {
      try {
        const allProducts = await db.products.toArray();
        const companyProducts = allProducts.filter(
          (p) =>
            p.is_active &&
            (isAllCompanies ||
              p.company_id === activeCompanyId ||
              (!p.company_id && activeCompanyId === DEFAULT_COMPANY_ID))
        );

        const zero: StockAlertItem[] = [];
        const low: StockAlertItem[] = [];

        companyProducts.forEach((p) => {
          const stock = p.stock ?? 0;
          const minStock = p.min_stock ?? 20;
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

        // Sort worst first
        zero.sort((a, b) => a.name.localeCompare(b.name));
        low.sort((a, b) => a.stock - b.stock);

        setZeroItems(zero);
        setLowItems(low);
      } catch (err) {
        console.warn('StockAlertBanner: failed to load stock data', err);
      } finally {
        setLoaded(true);
      }
    };

    fetchStockAlerts();
  }, [activeCompanyId, isAllCompanies]);

  const handleDismiss = () => {
    const sessionKey = `${DISMISSED_KEY}_${activeCompanyId}`;
    sessionStorage.setItem(sessionKey, 'true');
    setDismissed(true);
  };

  if (!loaded || dismissed) return null;

  const totalAlerts = zeroItems.length + lowItems.length;
  if (totalAlerts === 0) return null;

  const displayItems = expanded
    ? [...zeroItems, ...lowItems]
    : [...zeroItems.slice(0, 3), ...lowItems.slice(0, Math.max(0, 5 - zeroItems.length))];

  return (
    <div className="mx-4 mt-3 mb-0 rounded-lg border-2 border-red-500/40 bg-red-500/5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-3 pb-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            {zeroItems.length > 0 && (
              <span className="flex items-center gap-1 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                <PackageX size={11} />
                {zeroItems.length} OUT OF STOCK
              </span>
            )}
            {lowItems.length > 0 && (
              <span className="flex items-center gap-1 bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full">
                <AlertTriangle size={11} />
                {lowItems.length} LOW STOCK
              </span>
            )}
          </div>
          <span className="text-xs font-semibold text-text-muted hidden sm:block">
            — Stock alert for {totalAlerts} product{totalAlerts !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/stock')}
            className="text-[10px] font-bold gap-1 h-7 px-2 border-red-500/30 text-red-600 hover:bg-red-500/10"
          >
            <ArrowRight size={12} />
            Manage Stock
          </Button>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="text-text-muted hover:text-text p-1 rounded"
            title={expanded ? 'Collapse' : 'Expand list'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={handleDismiss}
            className="text-text-muted hover:text-danger p-1 rounded"
            title="Dismiss alerts for this session"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Items list */}
      <div className="px-3 pb-3 space-y-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
          {displayItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-xs border ${
                item.severity === 'zero'
                  ? 'bg-red-500/10 border-red-500/25 text-red-700 dark:text-red-400'
                  : 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-400'
              }`}
            >
              <div className="min-w-0">
                <span className="font-mono text-[10px] opacity-70 mr-1">{item.code}</span>
                <span className="font-semibold truncate">{item.name}</span>
                {item.brand && (
                  <span className="ml-1 text-[10px] opacity-60">({item.brand})</span>
                )}
              </div>
              <span className="font-black whitespace-nowrap shrink-0 font-mono">
                {item.severity === 'zero' ? (
                  <span className="flex items-center gap-0.5">
                    <PackageX size={11} /> 0
                  </span>
                ) : (
                  <span>
                    {item.stock}
                    <span className="text-[9px] font-normal opacity-60">
                      /{item.min_stock} min
                    </span>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>

        {!expanded && totalAlerts > displayItems.length && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[11px] text-text-muted hover:text-text underline underline-offset-2 mt-1"
          >
            + {totalAlerts - displayItems.length} more products — click to expand
          </button>
        )}
      </div>
    </div>
  );
};

