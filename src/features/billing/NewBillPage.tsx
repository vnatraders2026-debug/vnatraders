import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { useCartStore, CartItem } from './store';
import { db, getShopSettings, initLocalDatabase } from '@/db';
import { searchProducts, createProductSearchIndex } from '@/db/search';
import { Product, ShopSettings, PaymentMode, Bill, BillItem } from '@/types';
import { formatINR, BrandTotalBreakdown } from '@/lib/format';
import { ReceiptModal } from './ReceiptModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { VnaLogo } from '@/components/VnaLogo';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  CreditCard,
  Banknote,
  Smartphone,
  ChevronUp,
  X,
  Percent,
  Sparkles,
  Tag,
  RotateCcw,
} from 'lucide-react';

export const NewBillPage: React.FC = () => {
  const { user } = useAuth();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart store
  const {
    items,
    customer_name,
    customer_phone,
    brand_discounts,
    payment_mode,
    editingBillNo,
    addItem,
    updateQty,
    updatePrice,
    removeItem,
    setCustomerName,
    setCustomerPhone,
    setDiscountPercent,
    setBrandDiscount,
    clearBrandDiscounts,
    setPaymentMode,
    clearCart,
    getTotals,
    saveBill,
  } = useCartStore();

  // Local search and category state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedBrand, setSelectedBrand] = useState<string>('All');
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Mobile bill sheet state
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  // Receipt Modal state
  const [savedReceiptData, setSavedReceiptData] = useState<{
    bill: Bill;
    items: BillItem[];
  } | null>(null);
  const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);

  async function loadData() {
    await initLocalDatabase();
    const all = await db.products.toArray();
    const prods = all.filter((p) => p.is_active);
    setAllProducts(prods);
    createProductSearchIndex(prods);

    // Synchronize brands in cart if any item was added previously with older brand metadata
    useCartStore.getState().syncCartBrands(prods);

    const settings = await getShopSettings();
    setShopSettings(settings);
  }

  // Load products from Dexie, run brand migration, and prepare MiniSearch
  useEffect(() => {
    loadData();

    // Auto-reload when cloud data is refreshed
    const handleRefreshed = () => {
      loadData();
    };
    window.addEventListener('supabase-data-refreshed', handleRefreshed);
    return () => {
      window.removeEventListener('supabase-data-refreshed', handleRefreshed);
    };
  }, []);

  // Distinct categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    allProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set).sort()];
  }, [allProducts]);

  // Distinct brand list for search filtering
  const brandsList = useMemo(() => {
    const set = new Set<string>();
    allProducts.forEach((p) => {
      if (p.brand) set.add(p.brand);
    });
    return ['All', ...Array.from(set).sort()];
  }, [allProducts]);

  // Filtered search results
  const searchResults = useMemo(() => {
    let prods = searchProducts(searchQuery, allProducts);
    if (selectedCategory !== 'All') {
      prods = prods.filter((p) => p.category === selectedCategory);
    }
    if (selectedBrand !== 'All') {
      prods = prods.filter((p) => (p.brand || 'Standard') === selectedBrand);
    }
    return prods.slice(0, 40);
  }, [searchQuery, selectedCategory, selectedBrand, allProducts]);

  // Keep highlighted index in bounds
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, selectedCategory, selectedBrand]);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (e.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
        } else {
          searchInputRef.current?.blur();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        if (searchResults.length > 0) {
          e.preventDefault();
          setHighlightedIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        if (searchResults.length > 0) {
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        }
        return;
      }

      if (e.key === 'Enter' && document.activeElement === searchInputRef.current) {
        if (searchResults.length > 0 && highlightedIndex < searchResults.length) {
          e.preventDefault();
          const selected = searchResults[highlightedIndex];
          handleProductSelect(selected, 1);
        }
        return;
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveBill();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchResults, highlightedIndex, searchQuery]);

  const handleProductSelect = (product: Product, quantity: number = 1) => {
    addItem(product, quantity);
  };

  const totals = getTotals();

  const handleSaveBill = async () => {
    if (!user) {
      setSaveError('You must be logged in to save bills.');
      return;
    }

    if (items.length === 0) {
      setSaveError('Cannot save an empty bill. Add at least one cracker item.');
      return;
    }

    setIsSaving(true);
    setSaveError('');

    try {
      const result = await saveBill(user);
      setSavedReceiptData(result);
      setIsMobileSheetOpen(false);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save bill. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-[calc(100dvh-5rem)] flex flex-col select-none">
      {/* Top Banner with VNA branding & shortcut helpers */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-border text-xs shrink-0">
        <div className="flex items-center gap-3">
          <VnaLogo size="sm" />
          <span className="text-text-muted">•</span>
          <span className="text-text-muted font-medium">Terminal Mode: Instant Offline</span>
          {editingBillNo && (
            <span className="font-bold text-accent px-2 py-0.5 rounded bg-accent/10">
              Editing Bill: {editingBillNo}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-text-muted font-mono text-[11px]">
          <div className="hidden sm:flex items-center gap-2">
            <span><kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-text">/</kbd> Search</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-text">Enter</kbd> Add</span>
            <span><kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-text">Ctrl+Enter</kbd> Save</span>
          </div>
        </div>
      </div>

      {/* Main Two-Pane Split Layout (Works side-by-side on both Tablets & Desktops) */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 lg:gap-4 min-h-0">
        {/* LEFT PANE: Search & Product Browser (7 cols on tablet & desktop) */}
        <div className="md:col-span-7 flex flex-col min-h-0 bg-surface border border-border rounded p-3 sm:p-4">
          {/* Search Box Input */}
          <div className="relative mb-3 shrink-0">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search crackers by name, code, or price... (/)"
              autoFocus
              className="w-full pl-9 pr-8 min-h-[44px] text-base sm:text-sm bg-background text-text border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Brand Filter Pills Bar */}
          <div className="flex items-center gap-1.5 pb-2 mb-2 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
              <Tag size={12} className="text-accent" />
              Brand:
            </span>
            {brandsList.map((brand) => {
              const isSelected = selectedBrand === brand;
              return (
                <button
                  key={brand}
                  onClick={() => setSelectedBrand(brand)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors min-h-[28px] ${
                    isSelected
                      ? 'bg-accent text-white shadow-subtle'
                      : 'bg-background text-text-muted hover:text-text hover:bg-border/60'
                  }`}
                >
                  {brand}
                </button>
              );
            })}
          </div>

          {/* Category Filter Chips Bar */}
          <div className="flex items-center gap-1.5 pb-2.5 mb-2 overflow-x-auto no-scrollbar border-b border-border shrink-0">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider shrink-0 mr-1">
              Category:
            </span>
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors min-h-[30px] ${
                    isSelected
                      ? 'bg-text text-surface font-bold'
                      : 'bg-background text-text-muted hover:text-text hover:bg-border/60'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Instant Search Results / Product List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border border border-border rounded bg-background min-h-0">
            {searchResults.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                <p className="font-semibold text-text">No crackers found</p>
                <p className="text-xs text-text-muted mt-1">Try adjusting your search query, brand, or category</p>
              </div>
            ) : (
              searchResults.map((prod, index) => {
                const inCart = items.find((item) => item.product_id === prod.id);
                const isSelected = index === highlightedIndex;
                const brandName = prod.brand || 'Standard';
                const isStandard = brandName === 'Standard';

                return (
                  <div
                    key={prod.id}
                    className={`p-3 flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-accent/10 border-l-4 border-accent'
                        : 'hover:bg-surface border-l-4 border-transparent'
                    }`}
                  >
                    <div
                      className="min-w-0 pr-3 flex-1 cursor-pointer"
                      onClick={() => handleProductSelect(prod, 1)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-surface border border-border rounded text-text">
                          {prod.code}
                        </span>
                        <span className="text-sm font-semibold text-text truncate">
                          {prod.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            isStandard
                              ? 'bg-accent/10 text-accent border border-accent/20'
                              : 'bg-surface text-text border border-border'
                          }`}
                        >
                          <Tag size={10} />
                          {brandName}
                        </span>
                        {inCart && (
                          <span className="text-[11px] font-bold px-2 py-0.5 bg-accent text-white rounded">
                            {inCart.qty} added
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                        <span className="font-medium text-text">{prod.category}</span>
                        <span>•</span>
                        <span
                          className={`font-medium ${
                            prod.stock <= 20 ? 'text-danger font-semibold' : 'text-text-muted'
                          }`}
                        >
                          Stock: {prod.stock} {prod.unit}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-sm font-bold tabular-nums text-text">
                          {formatINR(prod.price)}
                        </span>
                        <p className="text-[10px] text-text-muted">per {prod.unit}</p>
                      </div>

                      {/* Add Action Button */}
                      <button
                        type="button"
                        onClick={() => handleProductSelect(prod, 1)}
                        className="px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded hover:bg-accent-hover min-h-[32px] transition-colors"
                        title={`Add ${prod.name} to bill`}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Current Bill Panel (5 cols on tablet & desktop) */}
        <div className="hidden md:flex md:col-span-5 flex-col min-h-0 bg-surface border border-border rounded p-3 sm:p-4">
          <BillPaneContent
            items={items}
            subtotal={totals.subtotal}
            discountPercent={totals.discountPercent}
            discountAmount={totals.discount}
            total={totals.total}
            brandTotals={totals.brandTotals}
            brand_discounts={brand_discounts}
            customer_name={customer_name}
            customer_phone={customer_phone}
            payment_mode={payment_mode}
            isSaving={isSaving}
            saveError={saveError}
            editingBillNo={editingBillNo}
            updateQty={updateQty}
            updatePrice={updatePrice}
            removeItem={removeItem}
            setCustomerName={setCustomerName}
            setCustomerPhone={setCustomerPhone}
            setDiscountPercent={setDiscountPercent}
            setBrandDiscount={setBrandDiscount}
            clearBrandDiscounts={clearBrandDiscounts}
            setPaymentMode={setPaymentMode}
            clearCart={clearCart}
            onSaveBill={handleSaveBill}
          />
        </div>
      </div>

      {/* MOBILE STICKY BOTTOM SUMMARY BAR (Phones < 768px only) */}
      <div className="md:hidden fixed bottom-16 inset-x-0 bg-surface border-t border-border px-4 py-3 flex items-center justify-between z-20">
        <div>
          <div className="text-xs text-text-muted">
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {totals.discount > 0 && ` (${totals.discountPercent}% off)`}
          </div>
          <div className="text-base font-bold tabular-nums text-accent">
            {formatINR(totals.total)}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsMobileSheetOpen(true)}
            disabled={items.length === 0}
          >
            <span>Bill ({items.length})</span>
            <ChevronUp size={16} />
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleSaveBill}
            disabled={items.length === 0 || isSaving}
          >
            <Printer size={16} />
            <span>{isSaving ? 'Saving...' : 'Print'}</span>
          </Button>
        </div>
      </div>

      {/* MOBILE FULL-SCREEN BILL SHEET (Phones < 768px only) */}
      {isMobileSheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-surface flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-text">VNA Crackers - Current Bill</h2>
              <p className="text-xs text-text-muted">{items.length} items added</p>
            </div>
            <button
              onClick={() => setIsMobileSheetOpen(false)}
              className="p-2 text-text-muted hover:text-text rounded"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <BillPaneContent
              items={items}
              subtotal={totals.subtotal}
              discountPercent={totals.discountPercent}
              discountAmount={totals.discount}
              total={totals.total}
              brandTotals={totals.brandTotals}
              brand_discounts={brand_discounts}
              customer_name={customer_name}
              customer_phone={customer_phone}
              payment_mode={payment_mode}
              isSaving={isSaving}
              saveError={saveError}
              editingBillNo={editingBillNo}
              updateQty={updateQty}
              updatePrice={updatePrice}
              removeItem={removeItem}
              setCustomerName={setCustomerName}
              setCustomerPhone={setCustomerPhone}
              setDiscountPercent={setDiscountPercent}
              setBrandDiscount={setBrandDiscount}
              clearBrandDiscounts={clearBrandDiscounts}
              setPaymentMode={setPaymentMode}
              clearCart={clearCart}
              onSaveBill={handleSaveBill}
            />
          </div>
        </div>
      )}

      {/* RECEIPT MODAL ON SAVE */}
      {savedReceiptData && shopSettings && user && (
        <ReceiptModal
          bill={savedReceiptData.bill}
          items={savedReceiptData.items}
          settings={shopSettings}
          currentUser={user}
          onNewBill={() => {
            setSavedReceiptData(null);
            clearCart();
            searchInputRef.current?.focus();
          }}
          onEditBill={() => {
            useCartStore.getState().loadBillForEdit(savedReceiptData.bill, savedReceiptData.items);
            setSavedReceiptData(null);
          }}
          onClose={() => setSavedReceiptData(null)}
        />
      )}
    </div>
  );
};

/**
 * Highly responsive direct unit-price editor
 */
const EditablePriceField: React.FC<{
  initialPrice: number;
  onPriceChange: (newPrice: number) => void;
}> = ({ initialPrice, onPriceChange }) => {
  const [val, setVal] = useState<string>(initialPrice.toString());
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setVal(initialPrice.toString());
    }
  }, [initialPrice, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setVal(raw);
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 0) {
      onPriceChange(parsed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed < 0) {
      setVal(initialPrice.toString());
      onPriceChange(initialPrice);
    } else {
      setVal(parsed.toString());
      onPriceChange(parsed);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    e.target.select();
  };

  return (
    <div className="flex items-center gap-1 bg-surface border border-border rounded px-2 py-1 focus-within:ring-2 focus-within:ring-accent focus-within:border-accent transition-colors shadow-sm">
      <span className="text-text-muted font-bold text-xs select-none">@ ₹</span>
      <input
        type="text"
        inputMode="decimal"
        value={val}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder="0.00"
        className="w-20 text-right text-xs font-bold font-mono tabular-nums bg-transparent text-text focus:outline-none"
        title="Click to edit unit price (type new price directly)"
      />
    </div>
  );
};

interface BillPaneContentProps {
  items: CartItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  brandTotals: Record<string, BrandTotalBreakdown>;
  brand_discounts: Record<string, number>;
  customer_name: string;
  customer_phone: string;
  payment_mode: PaymentMode;
  isSaving: boolean;
  saveError: string;
  editingBillNo: string | null;
  updateQty: (id: string, qty: number) => void;
  updatePrice: (id: string, price: number) => void;
  removeItem: (id: string) => void;
  setCustomerName: (name: string) => void;
  setCustomerPhone: (phone: string) => void;
  setDiscountPercent: (percent: number) => void;
  setBrandDiscount: (brand: string, percent: number) => void;
  clearBrandDiscounts: () => void;
  setPaymentMode: (mode: PaymentMode) => void;
  clearCart: () => void;
  onSaveBill: () => void;
}

const BillPaneContent: React.FC<BillPaneContentProps> = ({
  items,
  subtotal,
  discountPercent,
  discountAmount,
  total,
  brandTotals,
  brand_discounts,
  customer_name,
  customer_phone,
  payment_mode,
  isSaving,
  saveError,
  editingBillNo,
  updateQty,
  updatePrice,
  removeItem,
  setCustomerName,
  setCustomerPhone,
  setDiscountPercent,
  setBrandDiscount,
  clearBrandDiscounts,
  setPaymentMode,
  clearCart,
  onSaveBill,
}) => {
  // Detect unique brands present in the cart
  const brandsInCart = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => set.add(item.brand || 'Standard'));
    return Array.from(set).sort();
  }, [items]);

  // Always make both Standard and General visible for discount selection
  const displayBrands = useMemo(() => {
    const set = new Set<string>(['Standard', 'General']);
    brandsInCart.forEach((b) => set.add(b));
    return Array.from(set);
  }, [brandsInCart]);

  // Selected brand for setting brand-specific discount
  const [selectedBrandTab, setSelectedBrandTab] = useState<string>('Standard');

  // Keep selected brand tab in sync
  useEffect(() => {
    if (brandsInCart.length > 0 && !displayBrands.includes(selectedBrandTab)) {
      setSelectedBrandTab(brandsInCart[0] || 'Standard');
    }
  }, [brandsInCart, displayBrands, selectedBrandTab]);

  // Presets tailored to cracker industry (Standard: 70%, General: 20-30%)
  const standardPresets = [0, 50, 60, 70, 75, 80];
  const generalPresets = [0, 10, 20, 25, 30, 40];
  const activePresets = selectedBrandTab === 'Standard' ? standardPresets : generalPresets;

  const currentBrandDiscount = brand_discounts[selectedBrandTab] || 0;
  const currentBrandData = brandTotals[selectedBrandTab];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Pane Title & Clear Button */}
      <div className="flex items-center justify-between pb-2.5 border-b border-border mb-2.5 shrink-0">
        <div>
          <h2 className="text-sm font-bold text-text">
            {editingBillNo ? `Editing Bill: ${editingBillNo}` : 'Current Bill'}
          </h2>
          <span className="text-xs text-text-muted">
            {items.length} {items.length === 1 ? 'line item' : 'line items'}
          </span>
        </div>
        {items.length > 0 && (
          <button
            onClick={clearCart}
            className="text-xs text-danger hover:underline font-semibold focus:outline-none"
          >
            Clear All
          </button>
        )}
      </div>

      {saveError && (
        <div className="mb-2 p-2 bg-danger-light border border-danger rounded text-xs text-danger font-medium shrink-0">
          {saveError}
        </div>
      )}

      {/* SCROLLABLE BODY: Both items list and form inputs scroll smoothly so nothing is crushed */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {/* Bill Items List */}
        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="p-8 flex flex-col items-center justify-center text-sm text-text-muted text-center border border-dashed border-border rounded">
              <Sparkles size={24} className="text-accent mb-2" />
              <p className="font-medium text-text">Bill is Empty</p>
              <p className="text-xs text-text-muted mt-1">Select crackers from the left or press / to search</p>
            </div>
          ) : (
            items.map((item) => {
              const brandName = item.brand || 'Standard';
              const bDiscount = brand_discounts[brandName] || 0;

              return (
                <div
                  key={item.id}
                  className="p-2.5 bg-background border border-border rounded flex flex-col gap-2 text-xs transition-colors hover:border-text-muted/40 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-text truncate max-w-[200px]">
                        {item.product_name}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 flex items-center gap-1">
                        <Tag size={10} />
                        {brandName}
                      </span>
                      {bDiscount > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-success-light text-success">
                          {bDiscount}% off
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1 text-text-muted hover:text-danger rounded focus:outline-none"
                      aria-label="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {/* Stepper with direct quantity input */}
                    <div className="flex items-center border border-border rounded bg-surface">
                      <button
                        onClick={() => updateQty(item.id, item.qty - 1)}
                        disabled={item.qty <= 1}
                        className="p-1.5 text-text-muted hover:text-text disabled:opacity-30 min-w-[32px] flex items-center justify-center font-bold"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.qty}
                        onChange={(e) => updateQty(item.id, parseInt(e.target.value) || 1)}
                        className="w-12 text-center text-xs font-bold tabular-nums bg-transparent border-x border-border focus:outline-none"
                      />
                      <button
                        onClick={() => updateQty(item.id, item.qty + 1)}
                        className="p-1.5 text-text-muted hover:text-text min-w-[32px] flex items-center justify-center font-bold"
                        aria-label="Increase quantity"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    {/* Editable Unit Price Field */}
                    <EditablePriceField
                      initialPrice={item.unit_price}
                      onPriceChange={(newPrice) => updatePrice(item.id, newPrice)}
                    />

                    {/* Line Total */}
                    <div className="text-right font-bold text-text tabular-nums text-xs">
                      {formatINR(item.line_total)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bill Metadata Inputs */}
        <div className="space-y-3 pt-2.5 border-t border-border">
          {/* Customer fields */}
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Customer name (optional)"
              value={customer_name}
              onChange={(e) => setCustomerName(e.target.value)}
              className="text-xs min-h-[36px]"
            />
            <Input
              placeholder="Phone number (optional)"
              type="tel"
              value={customer_phone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="text-xs min-h-[36px]"
            />
          </div>

          {/* Payment Mode Pills */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted font-semibold">Payment:</span>
            <div className="grid grid-cols-3 gap-2 flex-1">
              {(['cash', 'upi', 'card'] as PaymentMode[]).map((mode) => {
                const icons = { cash: Banknote, upi: Smartphone, card: CreditCard };
                const Icon = icons[mode];
                const isSelected = payment_mode === mode;

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPaymentMode(mode)}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border text-xs font-bold uppercase transition-colors min-h-[36px] ${
                      isSelected
                        ? 'border-accent bg-accent text-white shadow-subtle'
                        : 'border-border bg-surface text-text hover:bg-background'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{mode}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* BRAND-WISE DISCOUNT MODULE */}
          <div className="space-y-2 bg-background p-2.5 rounded border border-border">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1 font-semibold text-text">
                <Percent size={13} className="text-accent" />
                <span>Brand-Wise Discounts:</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-success tabular-nums">
                    - {formatINR(discountAmount)} ({discountPercent}% net)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearBrandDiscounts();
                      setDiscountPercent(0);
                    }}
                    className="p-0.5 text-text-muted hover:text-danger"
                    title="Reset discounts"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Clickable Brand Selector Chips */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-text-muted font-medium">Select Brand:</span>
                {displayBrands.map((bName) => {
                  const bSubtotal = brandTotals[bName]?.subtotal || 0;
                  const bPct = brand_discounts[bName] || 0;
                  const isSelected = selectedBrandTab === bName;

                  return (
                    <button
                      key={bName}
                      type="button"
                      onClick={() => setSelectedBrandTab(bName)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded border transition-colors ${
                        isSelected
                          ? 'border-accent bg-accent text-white shadow-subtle'
                          : 'border-border bg-surface text-text hover:bg-border/40'
                      }`}
                    >
                      <Tag size={11} />
                      <span>{bName}</span>
                      <span className={`text-[10px] px-1 rounded font-mono ${isSelected ? 'bg-white/20' : 'bg-background'}`}>
                        {formatINR(bSubtotal)}
                      </span>
                      {bPct > 0 && (
                        <span className={`text-[10px] font-black px-1 rounded ${isSelected ? 'bg-white text-accent' : 'bg-success text-white'}`}>
                          {bPct}% off
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Discount Controller for Selected Brand */}
              <div className="p-2 rounded bg-surface border border-border space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text">
                    Discount for <strong className="text-accent">{selectedBrandTab}</strong> items:
                  </span>
                  {currentBrandData && currentBrandDiscount > 0 && (
                    <span className="text-xs font-bold text-success font-mono">
                      - {formatINR(currentBrandData.discount)} ({currentBrandDiscount}% off)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {activePresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBrandDiscount(selectedBrandTab, preset)}
                      className={`px-2 py-1 text-xs font-bold rounded border transition-colors min-h-[28px] ${
                        currentBrandDiscount === preset
                          ? 'bg-accent text-white border-accent'
                          : 'bg-background text-text border-border hover:bg-border/40'
                      }`}
                    >
                      {preset}%
                    </button>
                  ))}

                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-[11px] text-text-muted font-medium">Custom:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={currentBrandDiscount || ''}
                      placeholder="0"
                      onChange={(e) =>
                        setBrandDiscount(selectedBrandTab, parseFloat(e.target.value) || 0)
                      }
                      className="w-14 px-1.5 py-1 text-right text-xs font-bold font-mono tabular-nums bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <span className="text-xs text-text-muted font-bold">%</span>
                  </div>
                </div>
              </div>

              {/* Live Brand-wise breakdown if any brand has discount */}
              {Object.entries(brandTotals).some(([_, d]) => d.discount > 0) && (
                <div className="p-2 rounded bg-surface/50 border border-border/60 text-[11px] space-y-1">
                  <div className="font-semibold text-text-muted">Brand Discount Breakdown:</div>
                  {Object.entries(brandTotals).map(([bName, bData]) => (
                    <div key={bName} className="flex justify-between items-center text-text">
                      <span>
                        <strong className="text-text">{bName}</strong> (Subtotal: {formatINR(bData.subtotal)})
                      </span>
                      <span className="font-mono tabular-nums">
                        {bData.discountPercent > 0 ? (
                          <strong className="text-success">
                            -{bData.discountPercent}% (-{formatINR(bData.discount)})
                          </strong>
                        ) : (
                          <span className="text-text-muted">0%</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PINNED FOOTER: Totals Summary & Save Button */}
      <div className="pt-2.5 border-t border-border shrink-0 space-y-2 bg-surface">
        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-text-muted font-medium">
            <span>Subtotal:</span>
            <span className="tabular-nums font-mono">{formatINR(subtotal)}</span>
          </div>

          {discountAmount > 0 && (
            <div className="flex justify-between text-success font-semibold">
              <span>Total Discount ({discountPercent}% effective):</span>
              <span className="tabular-nums font-mono">- {formatINR(discountAmount)}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm font-bold text-text pt-1 border-t border-border">
            <span>Grand Total:</span>
            <span className="text-lg text-accent tabular-nums font-mono font-black">
              {formatINR(total)}
            </span>
          </div>
        </div>

        {/* Save & Print Action Button */}
        <Button
          variant="primary"
          onClick={onSaveBill}
          disabled={items.length === 0 || isSaving}
          fullWidth
          className="text-sm font-bold py-2.5"
        >
          <Printer size={16} />
          <span>{isSaving ? 'Saving Bill...' : 'Save & Print Receipt (Ctrl+Enter)'}</span>
        </Button>
      </div>
    </div>
  );
};
