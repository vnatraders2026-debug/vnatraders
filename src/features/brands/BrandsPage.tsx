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
import { Tag, Plus, Edit2, Search, CheckCircle2, XCircle, Sparkles } from 'lucide-react';

const brandSchema = z.object({
  name: z.string().min(1, 'Brand name is required').trim(),
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
    formState: { errors, isSubmitting },
  } = useForm<BrandFormData>({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      name: '',
      is_active: true,
    },
  });

  const loadData = async () => {
    setLoading(true);
    try {
      let allBrands = await db.brands.toArray();
      if (allBrands.length === 0) {
        await initLocalDatabase();
        allBrands = await db.brands.toArray();
      }
      setBrands(allBrands);

      // Compute product counts per brand
      const allProducts = await db.products.toArray();
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

  useEffect(() => {
    loadData();
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
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (brand: Brand) => {
    setEditingBrand(brand);
    reset({
      name: brand.name,
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
