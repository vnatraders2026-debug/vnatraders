import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db, initLocalDatabase } from '@/db';
import { Brand, OutboxItem } from '@/types';
import { syncService } from '@/sync/syncService';
import { generateUUID } from '@/lib/uuid';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { Tag, Plus, Edit2, Search, CheckCircle2, XCircle, Sparkles, Percent, RefreshCw } from 'lucide-react';
import { supabase, isConfigured } from '@/lib/supabase';

const brandSchema = z.object({
  name: z.string().min(1, 'Brand name is required').trim(),
  has_discount: z.boolean().default(false),
  discount_percent: z.coerce.number().min(0, 'Discount must be >= 0').max(100, 'Discount must be <= 100').default(0),
  max_discount: z.coerce.number().min(0, 'Max discount must be >= 0').max(100, 'Max discount must be <= 100').default(0),
  is_active: z.boolean().default(true),
});

type BrandFormData = z.infer<typeof brandSchema>;

export const BrandsPage: React.FC = () => {
  const { toast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [productBrandCounts, setProductBrandCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BrandFormData>({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      name: '',
      has_discount: false,
      discount_percent: 0,
      max_discount: 0,
      is_active: true,
    },
  });

  const hasDiscountWatched = watch('has_discount');

  const [syncingBrands, setSyncingBrands] = useState(false);

  const loadData = async (syncCloud = true) => {
    setLoading(true);
    try {
      // 1. Pull latest brands from Supabase if online and configured
      if (syncCloud && navigator.onLine && isConfigured) {
        try {
          const { data: serverBrands, error: sbErr } = await supabase.from('brands').select('*');
          if (!sbErr && serverBrands && serverBrands.length > 0) {
            await db.brands.bulkPut(serverBrands as Brand[]);
          }
        } catch (err) {
          console.warn('Could not fetch remote brands from Supabase:', err);
        }
      }

      let allBrands = await db.brands.toArray();
      if (allBrands.length === 0) {
        await initLocalDatabase();
        allBrands = await db.brands.toArray();
      }

      // 2. Auto-discover brands from existing products in catalog
      const allProducts = await db.products.toArray();
      const existingNames = new Set(allBrands.map((b) => b.name.toLowerCase().trim()));
      const discoveredBrands: Brand[] = [];
      const now = new Date().toISOString();

      allProducts.forEach((p) => {
        const bName = (p.brand || '').trim();
        if (bName && !existingNames.has(bName.toLowerCase())) {
          existingNames.add(bName.toLowerCase());
          discoveredBrands.push({
            id: generateUUID(),
            name: bName,
            has_discount: false,
            discount_percent: 0,
            max_discount: 0,
            is_active: true,
            created_at: now,
            updated_at: now,
          });
        }
      });

      if (discoveredBrands.length > 0) {
        await db.brands.bulkPut(discoveredBrands);
        for (const nb of discoveredBrands) {
          await db.outbox.add({
            id: generateUUID(),
            entity: 'brands',
            op: 'insert',
            payload: nb,
            created_at: now,
            attempts: 0,
            status: 'pending',
          });
        }
        if (navigator.onLine && isConfigured) {
          syncService.processOutbox().catch(console.warn);
        }
        allBrands = await db.brands.toArray();
      }

      // 3. Sort brands: Default brands (Standard, General) first, then alphabetically
      allBrands.sort((a, b) => {
        if (a.name === 'Standard') return -1;
        if (b.name === 'Standard') return 1;
        if (a.name === 'General') return -1;
        if (b.name === 'General') return 1;
        return a.name.localeCompare(b.name);
      });

      setBrands(allBrands);

      // 4. Compute product counts per brand
      const counts: Record<string, number> = {};
      allProducts.forEach((p) => {
        const b = (p.brand || 'General').trim();
        counts[b] = (counts[b] || 0) + 1;
      });
      setProductBrandCounts(counts);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncingBrands(true);
    try {
      await loadData(true);
      if (navigator.onLine && isConfigured) {
        await syncService.processOutbox();
      }
      toast('Brands successfully synchronized with Cloud & Product Catalog', 'success');
    } catch (err: any) {
      toast(`Sync notice: ${err?.message || 'Error syncing brands'}`, 'info');
    } finally {
      setSyncingBrands(false);
    }
  };

  useEffect(() => {
    loadData(true);

    const onBrandsSynced = () => {
      loadData(false);
    };

    window.addEventListener('brands-synced', onBrandsSynced);
    return () => {
      window.removeEventListener('brands-synced', onBrandsSynced);
    };
  }, []);

  const filteredBrands = useMemo(() => {
    return brands.filter((b) => {
      if (!searchQuery.trim()) return true;
      return b.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    });
  }, [brands, searchQuery]);

  const handleOpenAdd = () => {
    setEditingBrand(null);
    reset({
      name: '',
      has_discount: false,
      discount_percent: 0,
      max_discount: 0,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (brand: Brand) => {
    setEditingBrand(brand);
    reset({
      name: brand.name,
      has_discount: Boolean(brand.has_discount),
      discount_percent: brand.discount_percent ?? 0,
      max_discount: brand.max_discount ?? (brand.discount_percent ?? 0),
      is_active: brand.is_active,
    });
    setIsModalOpen(true);
  };

  const onFormSubmit = async (data: BrandFormData) => {
    const trimmedName = data.name.trim();

    // Check unique name constraint
    const existing = await db.brands
      .filter((b) => b.name.toLowerCase() === trimmedName.toLowerCase() && b.id !== editingBrand?.id)
      .first();

    if (existing) {
      toast(`Brand "${trimmedName}" already exists`, 'error');
      return;
    }

    const now = new Date().toISOString();
    const brandId = editingBrand ? editingBrand.id : generateUUID();

    const brandRecord: Brand = {
      id: brandId,
      name: trimmedName,
      has_discount: data.has_discount,
      discount_percent: data.has_discount ? Number(data.discount_percent) || 0 : 0,
      max_discount: data.has_discount
        ? Number(data.max_discount) || Number(data.discount_percent) || 0
        : 0,
      is_active: data.is_active,
      created_at: editingBrand?.created_at || now,
      updated_at: now,
    };

    const outboxItem: OutboxItem = {
      id: generateUUID(),
      entity: 'brands',
      op: editingBrand ? 'update' : 'insert',
      payload: brandRecord,
      status: 'pending',
      attempts: 0,
      created_at: now,
    };

    await db.transaction('rw', [db.brands, db.outbox], async () => {
      await db.brands.put(brandRecord);
      await db.outbox.put(outboxItem);
    });

    syncService.updatePendingCount();
    toast(editingBrand ? 'Brand updated successfully' : 'Brand created successfully', 'success');
    setIsModalOpen(false);
    loadData();
  };

  const handleToggleStatus = async (brand: Brand) => {
    const updatedStatus = !brand.is_active;
    const now = new Date().toISOString();
    const updatedRecord: Brand = {
      ...brand,
      is_active: updatedStatus,
      updated_at: now,
    };

    const outboxItem: OutboxItem = {
      id: generateUUID(),
      entity: 'brands',
      op: 'update',
      payload: updatedRecord,
      status: 'pending',
      attempts: 0,
      created_at: now,
    };

    await db.transaction('rw', [db.brands, db.outbox], async () => {
      await db.brands.put(updatedRecord);
      await db.outbox.put(outboxItem);
    });

    syncService.updatePendingCount();
    toast(
      updatedStatus ? `Activated brand ${brand.name}` : `Deactivated brand ${brand.name}`,
      'info'
    );
    loadData();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-text">Brand Management</h1>
            <span className="text-xs bg-accent/10 text-accent font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Sparkles size={11} />
              VNA Sivakasi
            </span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Manage cracker manufacturers & product brands for brand-specific discounting
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleManualSync}
            disabled={syncingBrands || loading}
            className="font-medium text-xs shadow-subtle gap-1.5"
            title="Fetch latest brands from Supabase and auto-discover brands from product catalog"
          >
            <RefreshCw size={14} className={syncingBrands ? 'animate-spin' : ''} />
            <span>{syncingBrands ? 'Syncing...' : 'Sync Brands'}</span>
          </Button>

          <Button variant="primary" onClick={handleOpenAdd} className="font-semibold shadow-subtle">
            <Plus size={16} />
            <span>Add Brand</span>
          </Button>
        </div>
      </div>

      {/* Toolbar & Search */}
      <div className="bg-surface p-3 rounded border border-border flex flex-col sm:flex-row items-center justify-between gap-3 shadow-subtle">
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search brands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="text-xs text-text-muted font-medium">
          Total Brands: <strong className="text-text">{brands.length}</strong> (Default: Standard, General)
        </div>
      </div>

      {/* Brands Table */}
      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : filteredBrands.length === 0 ? (
        <EmptyState
          message={searchQuery ? `No brand matching "${searchQuery}"` : 'No brands available'}
          actionLabel="Add Brand"
          onAction={handleOpenAdd}
        />
      ) : (
        <div className="bg-surface rounded border border-border overflow-hidden shadow-subtle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand Name</TableHead>
                <TableHead>Products Linked</TableHead>
                <TableHead>Brand Discount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBrands.map((brand) => {
                const count = productBrandCounts[brand.name] || 0;
                const isDefault = brand.name === 'Standard' || brand.name === 'General';

                return (
                  <TableRow key={brand.id}>
                    <TableCell className="font-semibold text-text">
                      <div className="flex items-center gap-2">
                        <Tag size={15} className="text-accent" />
                        <span>{brand.name}</span>
                        {isDefault && (
                          <span className="text-[10px] bg-accent-light text-accent px-1.5 py-0.5 rounded font-bold uppercase">
                            Default
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-background border border-border text-text">
                        {count} {count === 1 ? 'product' : 'products'}
                      </span>
                    </TableCell>

                    <TableCell>
                      {brand.has_discount ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-success-light text-success border border-success/30">
                          <Percent size={11} />
                          <span>{brand.discount_percent}%</span>
                          <span className="text-[10px] opacity-75 font-normal">(Max {brand.max_discount || brand.discount_percent}%)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-text-muted bg-background border border-border">
                          No Discount
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          brand.is_active
                            ? 'bg-success-light text-success'
                            : 'bg-danger-light text-danger'
                        }`}
                      >
                        {brand.is_active ? (
                          <>
                            <CheckCircle2 size={12} />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle size={12} />
                            Inactive
                          </>
                        )}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(brand)}
                          className="p-1.5 text-text-muted hover:text-accent hover:bg-background rounded transition-colors"
                          title="Edit brand"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(brand)}
                          className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${
                            brand.is_active
                              ? 'text-danger hover:bg-danger-light'
                              : 'text-success hover:bg-success-light'
                          }`}
                          title={brand.is_active ? 'Deactivate brand' : 'Activate brand'}
                        >
                          {brand.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit Brand Dialog */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBrand ? `Edit Brand: ${editingBrand.name}` : 'Add New Brand'}
      >
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Brand Name <span className="text-danger">*</span>
            </label>
            <Input
              placeholder="e.g. Standard, Sony, Anil, General"
              {...register('name')}
              error={errors.name?.message}
              autoFocus
            />
            <p className="text-[11px] text-text-muted mt-1">
              Products assigned to this brand can receive specific discount percentages during billing.
            </p>
          </div>

          {/* Brand Discount Configuration */}
          <div className="p-3 bg-background border border-border rounded space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="brand_has_discount" className="text-xs font-semibold text-text cursor-pointer flex items-center gap-1.5">
                  <Percent size={13} className="text-accent" />
                  <span>Brand Discount Available</span>
                </label>
                <p className="text-[11px] text-text-muted">
                  Enable fixed discount for products under this brand
                </p>
              </div>
              <input
                type="checkbox"
                id="brand_has_discount"
                {...register('has_discount')}
                className="w-4 h-4 text-accent border-border rounded focus:ring-accent cursor-pointer"
              />
            </div>

            {hasDiscountWatched && (
              <div className="pt-2 border-t border-border/60 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-text mb-1">
                    Default Discount (%) <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="e.g. 70"
                    {...register('discount_percent')}
                    error={errors.discount_percent?.message}
                  />
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Fixed default applied automatically in billing
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-text mb-1">
                    Max Discount (%) <span className="text-danger">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="e.g. 80"
                    {...register('max_discount')}
                    error={errors.max_discount?.message}
                  />
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Highest discount admin can set
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="brand_active"
              {...register('is_active')}
              className="w-4 h-4 text-accent border-border rounded focus:ring-accent"
            />
            <label htmlFor="brand_active" className="text-xs font-medium text-text select-none cursor-pointer">
              Active (Visible in product forms and billing)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {editingBrand ? 'Save Changes' : 'Create Brand'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
