import React, { useState, useEffect, useMemo } from 'react';
import { db, DEFAULT_CATEGORIES } from '../db';
import { Product, Brand, Category } from '../types';
import { generateUUID } from '../lib/uuid';
import { syncService } from '@/sync/syncService';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { useToast } from './ui/Toast';
import { Tag, Layers, Package } from 'lucide-react';

export interface QuickProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddProduct: (item: {
    productId?: string;
    productCode: string;
    productName: string;
    brand: string;
    category: string;
    unit: string;
    wholesalePrice: number;
    retailPrice: number;
    qty: number;
    saveToCatalog: boolean;
  }) => void;
  pricingType?: 'wholesale' | 'retail';
  defaultQty?: number;
  title?: string;
  subtitle?: string;
}

const STANDARD_UNITS = [
  { value: 'box', label: 'Box (Std)' },
  { value: 'piece', label: 'Piece (Pcs)' },
  { value: 'packet', label: 'Packet' },
  { value: 'case', label: 'Case / Carton' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'tin', label: 'Tin' },
  { value: 'roll', label: 'Roll' },
  { value: 'bag', label: 'Bag' },
  { value: '__custom__', label: '+ Other Unit (Custom)...' },
];

export const QuickProductModal: React.FC<QuickProductModalProps> = ({
  isOpen,
  onClose,
  onAddProduct,
  defaultQty = 10,
  title = 'Add New / Non-Existing Product to Catalog',
  subtitle = 'Add a newly introduced cracker or gift box directly into this order and optionally save it to the permanent product directory.',
}) => {
  const { toast } = useToast();

  const [dbBrands, setDbBrands] = useState<Brand[]>([]);
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);

  // Form states
  const [productName, setProductName] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('Standard');
  const [customBrand, setCustomBrand] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Sparklers');
  const [customCategory, setCustomCategory] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('box');
  const [customUnit, setCustomUnit] = useState('');
  const [wholesaleRate, setWholesaleRate] = useState<number>(0);
  const [retailMrp, setRetailMrp] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(defaultQty);
  const [saveToCatalog, setSaveToCatalog] = useState(true);

  // Load brands, categories, and existing products from Dexie
  useEffect(() => {
    if (!isOpen) return;

    const loadMetadata = async () => {
      try {
        const [brands, cats, prods] = await Promise.all([
          db.brands.toArray(),
          db.categories.toArray(),
          db.products.toArray(),
        ]);
        setDbBrands(brands);
        setDbCategories(cats);
        setExistingProducts(prods);
      } catch (err) {
        console.error('Failed to load metadata in QuickProductModal', err);
      }
    };

    loadMetadata();
    setQuantity(defaultQty);
  }, [isOpen, defaultQty]);

  // Distinct brand options
  const brandOptions = useMemo(() => {
    const set = new Set<string>(['Standard', 'General']);
    dbBrands.forEach((b) => {
      if (b.name) set.add(b.name.trim());
    });
    existingProducts.forEach((p) => {
      if (p.brand) set.add(p.brand.trim());
    });

    const list = Array.from(set).sort().map((name) => ({
      value: name,
      label: name === 'Standard' ? 'Standard (Standard Fireworks)' : name === 'General' ? 'General (Local / Generic)' : name,
    }));

    return [...list, { value: '__custom__', label: '+ Add Other / New Brand...' }];
  }, [dbBrands, existingProducts]);

  // Distinct category options
  const categoryOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    dbCategories.forEach((c) => {
      if (c.name) set.add(c.name.trim());
    });
    existingProducts.forEach((p) => {
      if (p.category) set.add(p.category.trim());
    });

    const list = Array.from(set).sort().map((name) => ({
      value: name,
      label: name,
    }));

    return [...list, { value: '__custom__', label: '+ Add Other / New Category...' }];
  }, [dbCategories, existingProducts]);

  const handleSubmit = async () => {
    const cleanName = productName.trim();
    if (!cleanName) {
      toast('Please enter product / cracker name', 'error');
      return;
    }

    const finalBrand =
      selectedBrand === '__custom__' ? customBrand.trim() || 'Standard' : selectedBrand;
    const finalCategory =
      selectedCategory === '__custom__' ? customCategory.trim() || 'General' : selectedCategory;
    const finalUnit =
      selectedUnit === '__custom__' ? customUnit.trim() || 'box' : selectedUnit;

    const cleanCode = `CRK-${Date.now().toString().slice(-4)}`;
    const prodId = generateUUID();
    const now = new Date().toISOString();

    if (saveToCatalog) {
      const prodRecord: Product = {
        id: prodId,
        code: cleanCode,
        name: cleanName,
        category: finalCategory,
        brand: finalBrand,
        unit: finalUnit,
        price: Number(retailMrp) || Number(wholesaleRate) || 0,
        wholesale_price: Number(wholesaleRate) || Number(retailMrp) || 0,
        stock: 0,
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      try {
        await db.products.put(prodRecord);
        await db.outbox.add({
          id: generateUUID(),
          entity: 'products',
          op: 'insert',
          payload: prodRecord,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });

        // Also save brand if new
        if (selectedBrand === '__custom__' && customBrand.trim()) {
          const brandExists = dbBrands.some(
            (b) => b.name.toLowerCase() === customBrand.trim().toLowerCase()
          );
          if (!brandExists) {
            await db.brands.put({
              id: generateUUID(),
              name: customBrand.trim(),
              has_discount: false,
              discount_percent: 0,
              is_active: true,
              created_at: now,
            });
          }
        }

        // Also save category if new
        if (selectedCategory === '__custom__' && customCategory.trim()) {
          const catExists = dbCategories.some(
            (c) => c.name.toLowerCase() === customCategory.trim().toLowerCase()
          );
          if (!catExists) {
            await db.categories.put({
              id: `cat-${Date.now()}-${generateUUID().slice(0, 6)}`,
              name: customCategory.trim(),
              is_active: true,
              created_at: now,
            });
          }
        }

        syncService.triggerSync();
      } catch (err) {
        console.error('Failed to save product to catalog', err);
      }
    }

    onAddProduct({
      productId: saveToCatalog ? prodId : undefined,
      productCode: cleanCode,
      productName: cleanName,
      brand: finalBrand,
      category: finalCategory,
      unit: finalUnit,
      wholesalePrice: Number(wholesaleRate) || 0,
      retailPrice: Number(retailMrp) || 0,
      qty: Math.max(1, Number(quantity) || 1),
      saveToCatalog,
    });

    toast(`Product "${cleanName}" added!`, 'success');
    onClose();

    // Reset form
    setProductName('');
    setSelectedBrand('Standard');
    setCustomBrand('');
    setSelectedCategory('Sparklers');
    setCustomCategory('');
    setSelectedUnit('box');
    setCustomUnit('');
    setWholesaleRate(0);
    setRetailMrp(0);
    setQuantity(defaultQty);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="space-y-4">
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}

        <div className="space-y-3.5 text-xs">
          {/* Product Name Input */}
          <div>
            <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider">
              Product / Cracker Name <span className="text-danger">*</span>
            </label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. 50 Shots Sky Blitz / Deluxe Gift Box / 1000 Wala"
              autoFocus
              required
            />
          </div>

          {/* Brand & Category Select Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Brand Dropdown */}
            <div>
              <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider flex items-center gap-1">
                <Tag size={12} className="text-accent" />
                <span>Brand / Manufacturer <span className="text-danger">*</span></span>
              </label>
              <Select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                options={brandOptions}
              />
              {selectedBrand === '__custom__' && (
                <div className="mt-1.5">
                  <Input
                    value={customBrand}
                    onChange={(e) => setCustomBrand(e.target.value)}
                    placeholder="Enter new manufacturer / brand name..."
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Category Dropdown */}
            <div>
              <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider flex items-center gap-1">
                <Layers size={12} className="text-accent" />
                <span>Category <span className="text-danger">*</span></span>
              </label>
              <Select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                options={categoryOptions}
              />
              {selectedCategory === '__custom__' && (
                <div className="mt-1.5">
                  <Input
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Enter custom category name..."
                    autoFocus
                  />
                </div>
              )}
            </div>
          </div>

          {/* Packaging Unit, Wholesale Rate, Retail MRP */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Packaging Unit Dropdown */}
            <div>
              <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider flex items-center gap-1">
                <Package size={12} className="text-accent" />
                <span>Unit <span className="text-danger">*</span></span>
              </label>
              <Select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                options={STANDARD_UNITS}
              />
              {selectedUnit === '__custom__' && (
                <div className="mt-1.5">
                  <Input
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    placeholder="e.g. carton"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Wholesale Rate */}
            <div>
              <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider">
                Wholesale Rate (₹)
              </label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={wholesaleRate}
                onChange={(e) => setWholesaleRate(Number(e.target.value))}
                placeholder="0.00"
                className="font-mono font-bold"
              />
            </div>

            {/* Retail MRP */}
            <div>
              <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider">
                Retail MRP (₹)
              </label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={retailMrp}
                onChange={(e) => setRetailMrp(Number(e.target.value))}
                placeholder="0.00"
                className="font-mono font-bold"
              />
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider">
              Quantity for this Order
            </label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="font-mono font-black text-sm"
            />
          </div>

          {/* Save to Catalog Checkbox */}
          <div className="p-2.5 bg-background border border-border rounded-md shadow-xs">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-text text-xs">
              <input
                type="checkbox"
                checked={saveToCatalog}
                onChange={(e) => setSaveToCatalog(e.target.checked)}
                className="rounded text-accent focus:ring-accent"
              />
              <span>Save to permanent Product Catalog (Product Master)</span>
            </label>
            <p className="text-[10px] text-text-muted mt-0.5 ml-5">
              If checked, this cracker will be permanently registered in the database, so other billing counters and orders can search and select it immediately.
            </p>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} className="font-bold">
            Add Product to Order
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
