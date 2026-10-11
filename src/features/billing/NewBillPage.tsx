import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { useCartStore } from './store';
import { db, getShopSettings, initLocalDatabase } from '@/db';
import { searchProducts, createProductSearchIndex } from '@/db/search';
import { Product, ShopSettings, PaymentMode, Bill, BillItem } from '@/types';
import { formatINR } from '@/lib/format';
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
} from 'lucide-react';

export const NewBillPage: React.FC = () => {
  const { user } = useAuth();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart store
  const {
    items,
    customer_name,
    customer_phone,
    discount_percent,
    payment_mode,
    editingBillNo,
    addItem,
    updateQty,
    updatePrice,
    removeItem,
    setCustomerName,
    setCustomerPhone,
    setDiscountPercent,
    setPaymentMode,
    clearCart,
    getTotals,
    saveBill,
  } = useCartStore();

  // Local search and category state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
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

  // Load products from Dexie and prepare MiniSearch
  useEffect(() => {
    async function loadData() {
      let all = await db.products.toArray();
      if (all.length === 0) {
        await initLocalDatabase();
        all = await db.products.toArray();
      }
      const prods = all.filter((p) => p.is_active);
      setAllProducts(prods);
      createProductSearchIndex(prods);

      const settings = await getShopSettings();
      setShopSettings(settings);
    }
    loadData();
  }, []);

  // Distinct categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    allProducts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set).sort()];
  }, [allProducts]);

  // Filtered search results
  const searchResults = useMemo(() => {
    let prods = searchProducts(searchQuery, allProducts);
    if (selectedCategory !== 'All') {
      prods = prods.filter((p) => p.category === selectedCategory);
    }
    return prods.slice(0, 40);
  }, [searchQuery, selectedCategory, allProducts]);

  // Keep highlighted index in bounds
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, selectedCategory]);

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // '/' to focus search box
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // 'Esc' to clear search box
      if (e.key === 'Escape') {
        setSearchQuery('');
        return;
      }

      // 'Ctrl+Enter' to save bill
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleSaveBill();
        return;
      }

      // Arrow keys in search box
      if (document.activeElement === searchInputRef.current) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < searchResults.length - 1 ? prev + 1 : prev
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (searchResults.length > 0 && searchResults[highlightedIndex]) {
            addItem(searchResults[highlightedIndex]);
            setSearchQuery('');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchResults, highlightedIndex, items, discount_percent, customer_name, customer_phone, payment_mode]);

  const handleProductSelect = (product: Product, quantity: number = 1) => {
    addItem(product, quantity);
    searchInputRef.current?.focus();
  };

  const handleSaveBill = async () => {
    if (!user) return;
    if (items.length === 0) {
      setSaveError('Please add at least one item to save the bill');
      return;
    }

    try {
      setIsSaving(true);
      setSaveError('');
      const saved = await saveBill(user);
      setIsMobileSheetOpen(false);
      setSavedReceiptData(saved);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save bill locally');
    } finally {
      setIsSaving(false);
    }
  };

  const { subtotal, discountPercent, discount, total } = getTotals();

  return (
    <div className="flex flex-col h-[calc(100dvh-5.5rem)]">
      {/* VNA Modern Header Bar & Shortcuts */}
      <div className="hidden lg:flex items-center justify-between pb-2.5 mb-2.5 text-xs border-b border-border">
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

        <div className="flex items-center gap-3 text-text-muted font-mono text-[11px]">
          <span><kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-text">/</kbd> Search</span>
          <span><kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-text">Enter</kbd> Add</span>
          <span><kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-text">Ctrl+Enter</kbd> Save</span>
        </div>
      </div>

      {/* Main Two-Pane Split Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        {/* LEFT PANE: Search & Product Browser (7 cols on desktop) */}
        <div className="lg:col-span-7 flex flex-col min-h-0 bg-surface border border-border rounded p-4">
          {/* Search Box Input */}
          <div className="relative mb-3">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search VNA crackers by code (e.g. SPK-01), name, or type... (/)"
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

          {/* Category Filter Chips Bar */}
          <div className="flex items-center gap-1.5 pb-2.5 mb-2 overflow-x-auto no-scrollbar border-b border-border">
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors min-h-[32px] ${
                    isSelected
                      ? 'bg-accent text-white shadow-subtle'
                      : 'bg-background text-text-muted hover:text-text hover:bg-border/60'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          {/* Instant Search Results / Product List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border border border-border rounded bg-background">
            {searchResults.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                No crackers found matching &ldquo;{searchQuery}&rdquo; in category {selectedCategory}
              </div>
            ) : (
              searchResults.map((prod, index) => {
                const isSelected = index === highlightedIndex;
                const inCart = items.find((i) => i.product_id === prod.id);

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
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 bg-surface border border-border rounded text-text">
                          {prod.code}
                        </span>
                        <span className="text-sm font-semibold text-text truncate">
                          {prod.name}
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

                      {/* Quick Add Action Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleProductSelect(prod, 1)}
                          className="px-2.5 py-1 text-xs font-bold bg-accent text-white rounded hover:bg-accent-hover min-h-[32px] transition-colors"
                          title="Add 1 to bill"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleProductSelect(prod, 5)}
                          className="px-2 py-1 text-xs font-medium bg-surface border border-border text-text rounded hover:bg-background min-h-[32px] hidden sm:inline-block"
                          title="Add 5 to bill"
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Current Bill Panel (5 cols on desktop) */}
        <div className="hidden lg:flex lg:col-span-5 flex-col min-h-0 bg-surface border border-border rounded p-4">
          <BillPaneContent
            items={items}
            subtotal={subtotal}
            discountPercent={discountPercent}
            discountAmount={discount}
            total={total}
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
            setPaymentMode={setPaymentMode}
            clearCart={clearCart}
            onSaveBill={handleSaveBill}
          />
        </div>
      </div>

      {/* MOBILE STICKY BOTTOM SUMMARY BAR */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 bg-surface border-t border-border px-4 py-3 flex items-center justify-between z-20">
        <div>
          <div className="text-xs text-text-muted">
            {items.length} {items.length === 1 ? 'item' : 'items'}
            {discountPercent > 0 && ` (${discountPercent}% off)`}
          </div>
          <div className="text-base font-bold tabular-nums text-accent">
            {formatINR(total)}
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

      {/* MOBILE FULL-SCREEN BILL SHEET */}
      {isMobileSheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-surface flex flex-col">
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

          <div className="flex-1 overflow-y-auto p-4">
            <BillPaneContent
              items={items}
              subtotal={subtotal}
              discountPercent={discountPercent}
              discountAmount={discount}
              total={total}
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

const EditablePriceField: React.FC<{
  initialPrice: number;
  onPriceChange: (newPrice: number) => void;
}> = ({ initialPrice, onPriceChange }) => {
  const [val, setVal] = useState(String(initialPrice));

  useEffect(() => {
    setVal(String(initialPrice));
  }, [initialPrice]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (/^\d*\.?\d*$/.test(raw)) {
      setVal(raw);
      const parsed = parseFloat(raw);
      if (!isNaN(parsed) && parsed >= 0) {
        onPriceChange(parsed);
      }
    }
  };

  const handleBlur = () => {
    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed < 0) {
      setVal(String(initialPrice));
      onPriceChange(initialPrice);
    } else {
      setVal(String(parsed));
      onPriceChange(parsed);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-surface border border-border rounded px-2 py-1 focus-within:ring-2 focus-within:ring-accent focus-within:border-accent transition-colors shadow-sm">
      <span className="text-text-muted font-bold text-xs select-none">@ ₹</span>
      <input
        type="text"
        inputMode="decimal"
        value={val}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        placeholder="0.00"
        className="w-20 text-right text-xs font-bold font-mono tabular-nums bg-transparent text-text focus:outline-none"
        title="Click to edit unit price (type new price directly)"
      />
    </div>
  );
};

interface BillPaneContentProps {
  items: any[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
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
  setPaymentMode,
  clearCart,
  onSaveBill,
}) => {
  const discountPresets = [0, 5, 10, 15, 20, 25];

  return (
    <div className="flex flex-col h-full">
      {/* Pane Title & Clear Button */}
      <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
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
        <div className="mb-3 p-2 bg-danger-light border border-danger rounded text-xs text-danger font-medium">
          {saveError}
        </div>
      )}

      {/* Bill Items List */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-sm text-text-muted p-8 text-center border border-dashed border-border rounded">
            <Sparkles size={24} className="text-accent mb-2" />
            <p className="font-medium text-text">Bill is Empty</p>
            <p className="text-xs text-text-muted mt-1">Select crackers from the left or press / to search</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="p-2.5 bg-background border border-border rounded flex flex-col gap-2 text-xs transition-colors hover:border-text-muted/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-text truncate max-w-[220px]">
                  {item.product_name}
                </span>
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
          ))
        )}
      </div>

      {/* Bill Metadata Inputs */}
      <div className="space-y-3 pt-3 border-t border-border">
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

        {/* MODERN PERCENTAGE DISCOUNT CONTROLLER */}
        <div className="space-y-1.5 bg-background p-2.5 rounded border border-border">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 font-semibold text-text">
              <Percent size={13} className="text-accent" />
              <span>Discount (%):</span>
            </div>
            {discountPercent > 0 && (
              <span className="text-xs font-semibold text-success tabular-nums">
                - {formatINR(discountAmount)} ({discountPercent}% off)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {discountPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDiscountPercent(preset)}
                className={`px-2 py-1 text-xs font-bold rounded border transition-colors min-h-[28px] ${
                  discountPercent === preset
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface text-text border-border hover:bg-border/40'
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
                value={discountPercent || ''}
                placeholder="0"
                onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                className="w-14 px-1.5 py-1 text-right text-xs font-bold font-mono tabular-nums bg-surface border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <span className="text-xs text-text-muted font-bold">%</span>
            </div>
          </div>
        </div>

        {/* Totals Summary */}
        <div className="space-y-1 pt-2 border-t border-border text-xs">
          <div className="flex justify-between text-text-muted font-medium">
            <span>Subtotal:</span>
            <span className="tabular-nums font-mono">{formatINR(subtotal)}</span>
          </div>

          {discountAmount > 0 && (
            <div className="flex justify-between text-success font-semibold">
              <span>Discount ({discountPercent}%):</span>
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
