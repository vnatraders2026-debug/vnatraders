import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { useCartStore } from './store';
import { db, getShopSettings } from '@/db';
import { searchProducts, createProductSearchIndex } from '@/db/search';
import { Product, ShopSettings, PaymentMode, Bill, BillItem } from '@/types';
import { formatINR } from '@/lib/format';
import { ReceiptModal } from './ReceiptModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  Save,
  CreditCard,
  Banknote,
  Smartphone,
  ChevronUp,
  X,
} from 'lucide-react';

export const NewBillPage: React.FC = () => {
  const { user } = useAuth();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart store
  const {
    items,
    customer_name,
    customer_phone,
    discount,
    payment_mode,
    editingBillNo,
    addItem,
    updateQty,
    updatePrice,
    removeItem,
    setCustomerName,
    setCustomerPhone,
    setDiscount,
    setPaymentMode,
    clearCart,
    getTotals,
    saveBill,
  } = useCartStore();

  // Local search state
  const [searchQuery, setSearchQuery] = useState('');
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
      const prods = await db.products.where('is_active').equals(1).toArray();
      setAllProducts(prods);
      createProductSearchIndex(prods);

      const settings = await getShopSettings();
      setShopSettings(settings);
    }
    loadData();
  }, []);

  // Filtered search results
  const searchResults = useMemo(() => {
    return searchProducts(searchQuery, allProducts).slice(0, 30);
  }, [searchQuery, allProducts]);

  // Keep highlighted index in bounds
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

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
  }, [searchResults, highlightedIndex, items, discount, customer_name, customer_phone, payment_mode]);

  const handleProductSelect = (product: Product) => {
    addItem(product);
    setSearchQuery('');
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

  const { subtotal, discount: validDiscount, total } = getTotals();

  return (
    <div className="flex flex-col h-[calc(100dvh-5.5rem)]">
      {/* Keyboard Shortcuts Hint Bar (Desktop) */}
      <div className="hidden lg:flex items-center justify-between pb-2 mb-2 text-xs text-text-muted border-b border-border">
        <div className="flex items-center gap-4">
          <span>
            <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded font-mono text-[11px]">/</kbd>{' '}
            Focus Search
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded font-mono text-[11px]">↑ / ↓</kbd>{' '}
            Navigate
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded font-mono text-[11px]">Enter</kbd>{' '}
            Add Item
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded font-mono text-[11px]">Ctrl+Enter</kbd>{' '}
            Save Bill
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded font-mono text-[11px]">Esc</kbd>{' '}
            Clear
          </span>
        </div>
        {editingBillNo && (
          <span className="text-accent font-semibold">Editing Bill: {editingBillNo}</span>
        )}
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
              placeholder="Search crackers by name, code or category... (/)"
              autoFocus
              className="w-full pl-9 pr-8 min-h-[44px] text-base sm:text-sm bg-background text-text border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
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

          {/* Instant Search Results / Product List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border border border-border rounded bg-background">
            {searchResults.length === 0 ? (
              <div className="p-8 text-center text-sm text-text-muted">
                No matching crackers found for &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              searchResults.map((prod, index) => {
                const isSelected = index === highlightedIndex;
                const inCart = items.find((i) => i.product_id === prod.id);

                return (
                  <div
                    key={prod.id}
                    onClick={() => handleProductSelect(prod)}
                    className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-accent/10 border-l-4 border-accent'
                        : 'hover:bg-surface border-l-4 border-transparent'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 bg-surface border border-border rounded text-text">
                          {prod.code}
                        </span>
                        <span className="text-sm font-medium text-text truncate">
                          {prod.name}
                        </span>
                        {inCart && (
                          <span className="text-xs font-semibold px-2 py-0.5 bg-accent text-white rounded">
                            {inCart.qty} in bill
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                        <span>{prod.category}</span>
                        <span>•</span>
                        <span>Stock: {prod.stock} {prod.unit}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-semibold tabular-nums text-text">
                        {formatINR(prod.price)}
                      </span>
                      <p className="text-[10px] text-text-muted">per {prod.unit}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: Current Bill Panel (5 cols on desktop, hidden on mobile in favor of bottom sheet) */}
        <div className="hidden lg:flex lg:col-span-5 flex-col min-h-0 bg-surface border border-border rounded p-4">
          <BillPaneContent
            items={items}
            subtotal={subtotal}
            discount={validDiscount}
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
            setDiscount={setDiscount}
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
            <span>View Bill</span>
            <ChevronUp size={16} />
          </Button>

          <Button
            size="sm"
            variant="primary"
            onClick={handleSaveBill}
            disabled={items.length === 0 || isSaving}
          >
            <Save size={16} />
            <span>{isSaving ? 'Saving...' : 'Save'}</span>
          </Button>
        </div>
      </div>

      {/* MOBILE FULL-SCREEN BILL SHEET */}
      {isMobileSheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-surface flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-text">Current Bill</h2>
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
              discount={validDiscount}
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
              setDiscount={setDiscount}
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
            // Load bill into cart for editing
            useCartStore.getState().loadBillForEdit(savedReceiptData.bill, savedReceiptData.items);
            setSavedReceiptData(null);
          }}
          onClose={() => setSavedReceiptData(null)}
        />
      )}
    </div>
  );
};

interface BillPaneContentProps {
  items: any[];
  subtotal: number;
  discount: number;
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
  setDiscount: (discount: number) => void;
  setPaymentMode: (mode: PaymentMode) => void;
  clearCart: () => void;
  onSaveBill: () => void;
}

const BillPaneContent: React.FC<BillPaneContentProps> = ({
  items,
  subtotal,
  discount,
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
  setDiscount,
  setPaymentMode,
  clearCart,
  onSaveBill,
}) => {
  return (
    <div className="flex flex-col h-full">
      {/* Pane Title & Clear Button */}
      <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
        <div>
          <h2 className="text-sm font-semibold text-text">
            {editingBillNo ? `Editing ${editingBillNo}` : 'Current Bill'}
          </h2>
          <span className="text-xs text-text-muted">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        {items.length > 0 && (
          <button
            onClick={clearCart}
            className="text-xs text-danger hover:underline font-medium focus:outline-none"
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
          <div className="h-full flex items-center justify-center text-sm text-text-muted p-8 text-center border border-dashed border-border rounded">
            No items in bill yet. Type cracker name or code to add.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="p-2.5 bg-background border border-border rounded flex flex-col gap-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-text truncate max-w-[200px]">
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
                    className="p-1.5 text-text-muted hover:text-text disabled:opacity-30 min-w-[32px] flex items-center justify-center"
                    aria-label="Decrease quantity"
                  >
                    <Minus size={12} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => updateQty(item.id, parseInt(e.target.value) || 1)}
                    className="w-12 text-center text-xs font-semibold tabular-nums bg-transparent border-x border-border focus:outline-none"
                  />
                  <button
                    onClick={() => updateQty(item.id, item.qty + 1)}
                    className="p-1.5 text-text-muted hover:text-text min-w-[32px] flex items-center justify-center"
                    aria-label="Increase quantity"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {/* Unit price input */}
                <div className="flex items-center gap-1">
                  <span className="text-text-muted">@ ₹</span>
                  <input
                    type="number"
                    step="0.5"
                    value={item.unit_price}
                    onChange={(e) => updatePrice(item.id, parseFloat(e.target.value) || 0)}
                    className="w-16 px-1.5 py-1 text-right text-xs font-mono tabular-nums bg-surface border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                {/* Line Total */}
                <div className="text-right font-semibold text-text tabular-nums text-xs">
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
          <span className="text-xs text-text-muted font-medium">Payment:</span>
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
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded border text-xs font-medium uppercase transition-colors min-h-[36px] ${
                    isSelected
                      ? 'border-accent bg-accent text-white'
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

        {/* Discount Field */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Discount (₹):</span>
          <input
            type="number"
            min="0"
            max={subtotal}
            value={discount || ''}
            placeholder="0.00"
            onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
            className="w-28 px-2 py-1 text-right text-xs font-mono tabular-nums bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Totals Summary */}
        <div className="space-y-1 pt-2 border-t border-border text-xs">
          <div className="flex justify-between text-text-muted">
            <span>Subtotal:</span>
            <span className="tabular-nums font-mono">{formatINR(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-success">
              <span>Discount applied:</span>
              <span className="tabular-nums font-mono">- {formatINR(discount)}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-sm font-bold text-text pt-1 border-t border-border">
            <span>Total Payable:</span>
            <span className="text-base text-accent tabular-nums font-mono">
              {formatINR(total)}
            </span>
          </div>
        </div>

        {/* Save & Print Action Buttons */}
        <div className="grid grid-cols-1 gap-2 pt-2">
          <Button
            variant="primary"
            onClick={onSaveBill}
            disabled={items.length === 0 || isSaving}
            fullWidth
          >
            <Printer size={16} />
            <span>{isSaving ? 'Saving Bill...' : 'Save & Print Receipt (Ctrl+Enter)'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
