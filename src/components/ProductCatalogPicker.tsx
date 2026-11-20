import React, { useState, useMemo } from 'react';
import { Product, PricingType } from '@/types';
import { formatINR } from '@/lib/format';
import {
  Search,
  Tag,
  Layers,
  Package,
  Plus,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  LayoutGrid,
  List,
} from 'lucide-react';

export interface ProductCatalogPickerProps {
  products: Product[];
  pricingType?: PricingType;
  onSelectProduct: (product: Product, qty?: number) => void;
  onAddCustomProduct?: (name: string) => void;
  addedItemsMap?: Record<string, number>; // productId -> quantity currently in order
  title?: string;
  defaultOpen?: boolean;
  className?: string;
}

export const ProductCatalogPicker: React.FC<ProductCatalogPickerProps> = ({
  products,
  pricingType = 'wholesale',
  onSelectProduct,
  onAddCustomProduct,
  addedItemsMap = {},
  title = 'Cracker Catalog & Quick-Add',
  defaultOpen = true,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Collect unique brands and categories from product catalog
  const { allBrands, allCategories } = useMemo(() => {
    const brandSet = new Set<string>();
    const catSet = new Set<string>();

    products.forEach((p) => {
      if (p.brand && p.brand.trim()) brandSet.add(p.brand.trim());
      if (p.category && p.category.trim()) catSet.add(p.category.trim());
    });

    return {
      allBrands: Array.from(brandSet).sort(),
      allCategories: Array.from(catSet).sort(),
    };
  }, [products]);

  // Filter products based on search, brand, and category
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const qTokens = q ? q.split(/\s+/).filter(Boolean) : [];

    return products.filter((p) => {
      // Brand filter
      if (selectedBrand !== 'all') {
        if ((p.brand || 'Standard').toLowerCase() !== selectedBrand.toLowerCase()) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'all') {
        if ((p.category || 'General').toLowerCase() !== selectedCategory.toLowerCase()) {
          return false;
        }
      }

      // Search query filter
      if (qTokens.length > 0) {
        const name = (p.name || '').toLowerCase();
        const code = (p.code || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();

        const matchesAll = qTokens.every(
          (token) =>
            name.includes(token) ||
            code.includes(token) ||
            brand.includes(token) ||
            cat.includes(token)
        );
        if (!matchesAll) return false;
      }

      return true;
    });
  }, [products, searchQuery, selectedBrand, selectedCategory]);

  const totalDistinctAdded = Object.keys(addedItemsMap).length;

  return (
    <div className={`bg-surface border border-border rounded-lg shadow-xs overflow-hidden transition-all ${className}`}>
      {/* Header Bar with Toggle */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 bg-background border-b border-border flex items-center justify-between cursor-pointer select-none hover:bg-surface/80 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Package size={16} className="text-accent" />
          <h3 className="text-xs font-bold text-text uppercase tracking-wider">
            {title} ({filteredProducts.length} crackers available)
          </h3>
          {totalDistinctAdded > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
              {totalDistinctAdded} in this order
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="text-[11px] font-medium hidden sm:inline">
            {isOpen ? 'Click to collapse catalog' : 'Click to browse all products'}
          </span>
          <button
            type="button"
            className="p-1 rounded hover:bg-border/40 text-text-muted hover:text-text"
            aria-label="Toggle catalog picker"
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="p-3 space-y-3">
          {/* Controls: Search Bar + Brand & Category Filter Chips + View Mode */}
          <div className="space-y-2.5">
            {/* Search Input & View Switcher */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-2.5 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search any cracker by name, code, brand (e.g. 1000 Wala, 50 Shots, Standard)..."
                  className="w-full pl-9 pr-14 py-2 text-xs bg-background border border-border rounded-md text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-2.5 text-text-muted hover:text-text text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center border border-border rounded-md overflow-hidden bg-background shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-2 transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text hover:bg-surface'
                  }`}
                  title="Grid Cards View"
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`p-2 transition-colors ${
                    viewMode === 'table'
                      ? 'bg-accent text-white'
                      : 'text-text-muted hover:text-text hover:bg-surface'
                  }`}
                  title="Compact List View"
                >
                  <List size={14} />
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-col sm:flex-row gap-2 text-xs">
              {/* Brand Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                  <Tag size={10} /> Brand:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedBrand('all')}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded border transition-colors ${
                    selectedBrand === 'all'
                      ? 'bg-accent text-white border-accent'
                      : 'bg-background text-text border-border hover:bg-surface'
                  }`}
                >
                  All ({products.length})
                </button>
                {allBrands.map((b) => {
                  const isSel = selectedBrand.toLowerCase() === b.toLowerCase();
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setSelectedBrand(isSel ? 'all' : b)}
                      className={`px-2 py-0.5 text-[11px] font-bold rounded border transition-colors ${
                        isSel
                          ? 'bg-accent text-white border-accent'
                          : 'bg-background text-text border-border hover:bg-surface'
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>

              {/* Category Dropdown if available */}
              {allCategories.length > 0 && (
                <div className="flex items-center gap-1.5 sm:ml-auto">
                  <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                    <Layers size={10} /> Category:
                  </span>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="py-1 px-2 text-[11px] font-medium bg-background border border-border rounded text-text focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="all">All Categories ({products.length})</option>
                    {allCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Product Catalog Display: Grid View or Compact Table View */}
          <div className="border border-border/80 rounded-md bg-background max-h-80 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted space-y-2">
                <AlertCircle size={20} className="mx-auto text-amber-500" />
                <p>No crackers found matching your search or filters.</p>
                {onAddCustomProduct && searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => onAddCustomProduct(searchQuery.trim())}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-white font-bold text-xs shadow-xs hover:bg-accent/90"
                  >
                    <Plus size={13} />
                    <span>Add "{searchQuery.trim()}" as Non-Existing Product</span>
                  </button>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 p-2.5">
                {filteredProducts.map((p) => {
                  const rate =
                    pricingType === 'wholesale' && p.wholesale_price && p.wholesale_price > 0
                      ? p.wholesale_price
                      : p.price;
                  const qtyInOrder = addedItemsMap[p.id] || 0;
                  const isInOrder = qtyInOrder > 0;
                  const defaultAddQty = pricingType === 'wholesale' ? 10 : 1;

                  return (
                    <div
                      key={p.id}
                      className={`p-2.5 rounded-md border flex flex-col justify-between gap-2 transition-all ${
                        isInOrder
                          ? 'border-accent/50 bg-accent/5 shadow-xs ring-1 ring-accent/30'
                          : 'border-border bg-surface hover:border-text-muted/60'
                      }`}
                    >
                      {/* Product Header */}
                      <div>
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-bold text-xs text-text leading-tight line-clamp-2">
                            {p.name}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono shrink-0">
                            [{p.code}]
                          </span>
                        </div>

                        {/* Badges: Brand, Category, Stock */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-background border border-border text-text-muted">
                            {p.brand || 'Standard'}
                          </span>
                          {p.category && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-background border border-border text-text-muted">
                              {p.category}
                            </span>
                          )}
                          <span
                            className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                              p.stock > 10
                                ? 'bg-success/15 text-success'
                                : p.stock > 0
                                ? 'bg-warning/15 text-warning'
                                : 'bg-danger/15 text-danger'
                            }`}
                          >
                            {p.stock > 0 ? `Stock: ${p.stock}` : 'Out of Stock'}
                          </span>
                        </div>
                      </div>

                      {/* Footer: Price & Add Controls */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-border/40 mt-1">
                        <div>
                          <span className="text-[9px] text-text-muted block uppercase">
                            {pricingType === 'wholesale' ? 'Wholesale' : 'Retail'} Rate:
                          </span>
                          <span className="text-xs font-black font-mono text-accent">
                            {formatINR(rate)} / {p.unit || 'box'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          {isInOrder && (
                            <span className="text-[10px] font-bold text-success flex items-center gap-0.5 mr-1">
                              <Check size={11} /> {qtyInOrder} in order
                            </span>
                          )}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onSelectProduct(p, 1)}
                              className="px-1.5 py-1 text-[10px] font-bold rounded bg-surface hover:bg-border/60 border border-border text-text transition-colors"
                              title={`Add 1 box of ${p.name}`}
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectProduct(p, defaultAddQty)}
                              className="px-2 py-1 text-xs font-bold rounded bg-accent hover:bg-accent/90 text-white shadow-xs flex items-center gap-1 transition-colors"
                              title={`Add ${defaultAddQty} boxes of ${p.name}`}
                            >
                              <Plus size={12} />
                              <span>+{defaultAddQty}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Compact Table View */
              <table className="w-full text-xs">
                <thead className="bg-surface border-b border-border text-text-muted sticky top-0 z-10 font-bold">
                  <tr>
                    <th className="p-2 text-left">Cracker Name</th>
                    <th className="p-2 text-left w-20">Code</th>
                    <th className="p-2 text-left w-24">Brand</th>
                    <th className="p-2 text-left w-28">Category</th>
                    <th className="p-2 text-center w-24">Stock</th>
                    <th className="p-2 text-right w-24">Rate (₹)</th>
                    <th className="p-2 text-right w-36">Add to Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredProducts.map((p) => {
                    const rate =
                      pricingType === 'wholesale' && p.wholesale_price && p.wholesale_price > 0
                        ? p.wholesale_price
                        : p.price;
                    const qtyInOrder = addedItemsMap[p.id] || 0;
                    const isInOrder = qtyInOrder > 0;
                    const defaultAddQty = pricingType === 'wholesale' ? 10 : 1;

                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-surface/60 transition-colors ${
                          isInOrder ? 'bg-accent/5' : ''
                        }`}
                      >
                        <td className="p-2">
                          <div className="font-bold text-text flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {isInOrder && (
                              <span className="text-[10px] text-success font-bold flex items-center gap-0.5">
                                <Check size={11} /> ({qtyInOrder})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2 font-mono text-[11px] text-text-muted">[{p.code}]</td>
                        <td className="p-2">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-background border border-border">
                            {p.brand || 'Standard'}
                          </span>
                        </td>
                        <td className="p-2 text-[11px] text-text-muted">{p.category || '-'}</td>
                        <td className="p-2 text-center">
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                              p.stock > 10
                                ? 'bg-success/15 text-success'
                                : p.stock > 0
                                ? 'bg-warning/15 text-warning'
                                : 'bg-danger/15 text-danger'
                            }`}
                          >
                            {p.stock}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-accent">
                          {formatINR(rate)}
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => onSelectProduct(p, 1)}
                              className="px-1.5 py-1 text-[10px] font-bold rounded bg-surface hover:bg-border/60 border border-border text-text transition-colors"
                              title={`Add 1 box`}
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={() => onSelectProduct(p, defaultAddQty)}
                              className="px-2 py-1 text-xs font-bold rounded bg-accent hover:bg-accent/90 text-white shadow-xs flex items-center gap-1 transition-colors"
                              title={`Add ${defaultAddQty} boxes`}
                            >
                              <Plus size={12} />
                              <span>+{defaultAddQty}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
