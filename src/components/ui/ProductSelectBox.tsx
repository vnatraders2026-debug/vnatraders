import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronDown, Check, Package, Plus, AlertCircle } from 'lucide-react';
import { Product } from '../../types';
import { formatINR } from '../../lib/format';

// -------------------------------------------------------------
// Helper: Filter & Score Products
// -------------------------------------------------------------
function filterProducts(products: Product[], query: string, limit = 25): Product[] {
  if (!query.trim()) return products.slice(0, limit);
  const q = query.toLowerCase().trim();
  const qTokens = q.split(/\s+/).filter(Boolean);

  const scored: Array<{ product: Product; score: number }> = [];

  for (const p of products) {
    const name = (p.name || '').toLowerCase();
    const code = (p.code || '').toLowerCase();
    const brand = (p.brand || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();

    // Must match all tokens somewhere across name, code, brand, category
    const matchesAll = qTokens.every(
      (token) =>
        name.includes(token) ||
        code.includes(token) ||
        brand.includes(token) ||
        cat.includes(token)
    );

    if (matchesAll) {
      let score = 0;
      if (name.startsWith(q)) score += 100;
      else if (name.includes(q)) score += 50;
      if (code.startsWith(q)) score += 80;
      else if (code.includes(q)) score += 40;
      if (brand.includes(q)) score += 20;
      if (p.stock > 0) score += 10;
      scored.push({ product: p, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.product);
}

// -------------------------------------------------------------
// Component 1: SearchableProductSelect (For line-item table rows)
// -------------------------------------------------------------
export interface SearchableProductSelectProps {
  products: Product[];
  value: string; // product id
  onChange: (productId: string, product?: Product) => void;
  onCustomSelect?: () => void;
  placeholder?: string;
  pricingType?: 'wholesale' | 'retail';
  showStock?: boolean;
  className?: string;
  disabled?: boolean;
}

export const SearchableProductSelect: React.FC<SearchableProductSelectProps> = ({
  products,
  value,
  onChange,
  onCustomSelect,
  placeholder = 'Select Cracker Item...',
  pricingType = 'wholesale',
  showStock = true,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [popoverCoords, setPopoverCoords] = useState<{
    top: number;
    left: number;
    width: number;
    placement: 'bottom' | 'top';
  } | null>(null);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === value),
    [products, value]
  );

  const filteredProducts = useMemo(
    () => filterProducts(products, searchQuery, 30),
    [products, searchQuery]
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery]);

  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropdownHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeTop = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const top = placeTop ? Math.max(8, rect.top - dropdownHeight - 4) : rect.bottom + 4;
    const width = Math.max(rect.width, 380);
    const maxLeft = Math.max(8, window.innerWidth - width - 12);
    const left = Math.min(Math.max(8, rect.left), maxLeft);

    setPopoverCoords({
      top,
      left,
      width,
      placement: placeTop ? 'top' : 'bottom',
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleReposition = () => updatePosition();
      window.addEventListener('resize', handleReposition);
      window.addEventListener('scroll', handleReposition, true);
      return () => {
        window.removeEventListener('resize', handleReposition);
        window.removeEventListener('scroll', handleReposition, true);
      };
    }
  }, [isOpen, updatePosition]);

  // Click outside listener to close dropdown (handles both container and portal)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (prod: Product) => {
    onChange(prod.id, prod);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredProducts.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts[highlightedIndex]) {
        handleSelect(filteredProducts[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full py-1.5 px-2.5 text-xs text-left bg-surface border rounded font-medium flex items-center justify-between gap-1.5 transition-colors focus:outline-none focus:ring-1 focus:ring-accent ${
          isOpen ? 'border-accent ring-1 ring-accent' : 'border-border hover:border-text-muted/60'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-background' : 'cursor-pointer'}`}
      >
        <div className="truncate flex-1 flex items-center gap-1.5">
          {selectedProduct ? (
            <>
              <span className="font-bold text-text truncate">{selectedProduct.name}</span>
              <span className="text-[10px] text-text-muted font-mono shrink-0">
                ({selectedProduct.code})
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-background border border-border text-text-muted shrink-0">
                {selectedProduct.brand || 'Standard'}
              </span>
              {showStock && (
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold shrink-0 ${
                    selectedProduct.stock > 10
                      ? 'bg-success/10 text-success'
                      : selectedProduct.stock > 0
                      ? 'bg-warning/10 text-warning'
                      : 'bg-danger/10 text-danger'
                  }`}
                >
                  Stock: {selectedProduct.stock}
                </span>
              )}
            </>
          ) : (
            <span className="text-text-muted italic">{placeholder}</span>
          )}
        </div>
        <ChevronDown size={14} className={`text-text-muted transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Popover via Portal to prevent any parent overflow clipping */}
      {isOpen &&
        popoverCoords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              top: `${popoverCoords.top}px`,
              left: `${popoverCoords.left}px`,
              width: `${popoverCoords.width}px`,
              zIndex: 99999,
            }}
            className="bg-surface border border-border rounded-md shadow-2xl overflow-hidden text-xs flex flex-col max-h-[300px]"
            onKeyDown={handleKeyDown}
          >
            {/* Search Input in Dropdown */}
            <div className="p-2 border-b border-border bg-background flex items-center gap-2 shrink-0">
              <Search size={14} className="text-text-muted shrink-0 ml-1" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by cracker name, code, brand..."
                className="w-full bg-transparent border-none text-xs text-text placeholder:text-text-muted focus:outline-none py-0.5"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-text-muted hover:text-text p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Action to switch to custom product */}
            {onCustomSelect && (
              <div className="p-1.5 bg-accent/5 border-b border-accent/20 flex items-center justify-between shrink-0">
                <span className="text-[10px] text-text-muted">Can't find your cracker?</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onCustomSelect();
                  }}
                  className="text-[11px] font-bold text-accent hover:underline flex items-center gap-1"
                >
                  <Plus size={11} />
                  <span>+ Custom / Non-Existing Product</span>
                </button>
              </div>
            )}

            {/* Results List */}
            <div className="flex-1 overflow-y-auto divide-y divide-border/40 min-h-0">
              {filteredProducts.length === 0 ? (
                <div className="p-4 text-center text-text-muted space-y-2">
                  <p>No crackers matching "{searchQuery}"</p>
                  {onCustomSelect && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onCustomSelect();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-white text-[11px] font-bold shadow-xs hover:bg-accent/90"
                    >
                      <Plus size={12} />
                      <span>Use "{searchQuery}" as Non-Existing Product</span>
                    </button>
                  )}
                </div>
              ) : (
                filteredProducts.map((p, idx) => {
                  const isSelected = p.id === value;
                  const isHighlighted = idx === highlightedIndex;
                  const price =
                    pricingType === 'wholesale'
                      ? p.wholesale_price || p.price
                      : p.price;

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelect(p)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`p-2 flex items-center justify-between cursor-pointer transition-colors ${
                        isHighlighted ? 'bg-accent/10' : isSelected ? 'bg-surface' : 'hover:bg-background/80'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-text truncate">{p.name}</span>
                          <span className="text-[10px] text-text-muted font-mono shrink-0">
                            [{p.code}]
                          </span>
                          {isSelected && <Check size={12} className="text-accent shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-text-muted mt-0.5">
                          <span>Brand: <strong className="text-text">{p.brand || 'Standard'}</strong></span>
                          {p.category && <span>• {p.category}</span>}
                          <span>• Unit: <strong className="text-text uppercase">{p.unit}</strong></span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-accent">
                          {formatINR(price)}
                        </div>
                        {showStock && (
                          <div
                            className={`text-[9px] font-mono font-bold mt-0.5 ${
                              p.stock > 10
                                ? 'text-success'
                                : p.stock > 0
                                ? 'text-warning'
                                : 'text-danger'
                            }`}
                          >
                            Stock: {p.stock}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

// -------------------------------------------------------------
// Component 2: ProductSearchAddBar (Quick search & add cracker bar)
// -------------------------------------------------------------
export interface ProductSearchAddBarProps {
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onAddCustomProduct?: (query: string) => void;
  pricingType?: 'wholesale' | 'retail';
  placeholder?: string;
  className?: string;
}

export const ProductSearchAddBar: React.FC<ProductSearchAddBarProps> = ({
  products,
  onSelectProduct,
  onAddCustomProduct,
  pricingType = 'wholesale',
  placeholder = 'Search & select cracker to add (e.g. 1000 Wala, 50 Shots, Standard)...',
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredProducts = useMemo(
    () => filterProducts(products, query, 20),
    [products, query]
  );

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  // Click outside to close popover
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelect = (prod: Product) => {
    onSelectProduct(prod);
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && e.key !== 'ArrowDown') {
      if (query.trim() && e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) =>
          prev < filteredProducts.length - 1 ? prev + 1 : prev
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts[highlightedIndex]) {
        handleSelect(filteredProducts[highlightedIndex]);
      } else if (query.trim() && onAddCustomProduct) {
        onAddCustomProduct(query.trim());
        setQuery('');
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative flex-1 ${className}`}>
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search size={15} className="absolute left-3 text-text-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2 text-xs bg-surface border border-border rounded-md font-medium text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent shadow-xs"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-3 text-text-muted hover:text-text p-0.5"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Floating Search Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-full bg-surface border border-border rounded-lg shadow-2xl z-50 overflow-hidden text-xs">
          <div className="p-2 bg-background border-b border-border flex justify-between items-center text-[11px] text-text-muted">
            <span className="font-semibold uppercase tracking-wider flex items-center gap-1">
              <Package size={13} className="text-accent" />
              <span>Select Cracker to Add ({filteredProducts.length} results)</span>
            </span>
            <span className="text-[10px]">Press Enter to select • Esc to close</span>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
            {filteredProducts.length === 0 ? (
              <div className="p-4 text-center space-y-2.5">
                <div className="flex items-center justify-center text-warning gap-1">
                  <AlertCircle size={16} />
                  <span className="font-semibold text-text text-xs">
                    No crackers found matching "{query}"
                  </span>
                </div>
                {onAddCustomProduct && query.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      onAddCustomProduct(query.trim());
                      setQuery('');
                      setIsOpen(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white font-bold text-xs shadow-xs hover:bg-accent/90"
                  >
                    <Plus size={13} />
                    <span>+ Add "{query.trim()}" as Non-Existing Product</span>
                  </button>
                )}
              </div>
            ) : (
              filteredProducts.map((p, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const price =
                  pricingType === 'wholesale'
                    ? p.wholesale_price || p.price
                    : p.price;

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelect(p)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isHighlighted ? 'bg-accent/10 border-l-2 border-accent' : 'hover:bg-background/80 border-l-2 border-transparent'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text truncate">{p.name}</span>
                        <span className="text-[10px] text-text-muted font-mono shrink-0">
                          [{p.code}]
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-background border border-border text-text-muted shrink-0">
                          {p.brand || 'Standard'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-text-muted mt-1">
                        {p.category && <span>Category: <strong className="text-text">{p.category}</strong></span>}
                        <span>• Unit: <strong className="text-text uppercase">{p.unit}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="font-mono font-bold text-accent text-sm">
                          {formatINR(price)}
                        </div>
                        <div
                          className={`text-[10px] font-mono font-semibold mt-0.5 ${
                            p.stock > 10
                              ? 'text-success'
                              : p.stock > 0
                              ? 'text-warning'
                              : 'text-danger'
                          }`}
                        >
                          {p.stock > 0 ? `Stock: ${p.stock} ${p.unit}` : 'Out of Stock (0)'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelect(p);
                        }}
                        className="px-2.5 py-1 rounded bg-accent/10 hover:bg-accent hover:text-white text-accent font-bold text-xs transition-colors flex items-center gap-1"
                      >
                        <Plus size={12} />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

