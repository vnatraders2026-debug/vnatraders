import React, { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { db, initLocalDatabase, DEFAULT_BRANDS, DEFAULT_CATEGORIES, addCategory, deleteCategory } from '@/db';
import { Product, Brand, Category, OutboxItem } from '@/types';
import { updateProductInIndex } from '@/db/search';
import { syncService } from '@/sync/syncService';
import { formatINR } from '@/lib/format';
import { generateUUID } from '@/lib/uuid';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Drawer } from '@/components/ui/Drawer';
import { Dialog } from '@/components/ui/Dialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import { logActivity } from '@/lib/activityLogger';
import {
  Search,
  Plus,
  Download,
  Upload,
  Edit,
  EyeOff,
  Eye,
  FileSpreadsheet,
  Tag,
  Tags,
  Trash2,
  FilterX,
  RotateCcw,
  X,
  AlertTriangle,
  FolderPlus,
} from 'lucide-react';

const productSchema = z.object({
  code: z.string().min(1, 'Product code is required').trim(),
  name: z.string().min(1, 'Product name is required').trim(),
  category: z.string().min(1, 'Category is required').trim(),
  brand: z.string().min(1, 'Brand is required').trim().default('Standard'),
  unit: z.string().default('box'),
  price: z.number().gt(0, 'Price must be greater than 0'),
  stock: z.number().min(0, 'Stock cannot be negative').default(0),
});

type ProductFormData = z.infer<typeof productSchema>;

export const ProductsPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categoriesList, setCategoriesList] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Drawer form state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Category Management Modal states (Add & Delete)
  const [isManageCategoriesOpen, setIsManageCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [reassignCategoryName, setReassignCategoryName] = useState<string>('');
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  // CSV Import Modal state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvPreviewData, setCsvPreviewData] = useState<Array<{ data: any; errors: string[] }>>([]);
  const [isImporting, setIsImporting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      brand: 'Standard',
      category: 'Sparklers',
      unit: 'box',
      stock: 0,
      price: 0,
    },
  });

  const loadData = async () => {
    setLoading(true);
    try {
      let all = await db.products.toArray();
      if (all.length === 0) {
        await initLocalDatabase();
        all = await db.products.toArray();
      }
      setProducts(all);

      let allBrands = await db.brands.toArray();
      if (allBrands.length === 0) {
        allBrands = DEFAULT_BRANDS;
      }
      setBrands(allBrands);

      let allCats = await db.categories.toArray();
      if (allCats.length === 0) {
        await initLocalDatabase();
        allCats = await db.categories.toArray();
      }

      // Sync any product categories into db.categories if missing
      const existingCatNames = new Set(allCats.map((c) => c.name.toLowerCase()));
      const missingCats: Category[] = [];
      all.forEach((p) => {
        if (p.category && !existingCatNames.has(p.category.toLowerCase())) {
          existingCatNames.add(p.category.toLowerCase());
          missingCats.push({
            id: `cat-${Date.now()}-${generateUUID().slice(0, 6)}`,
            name: p.category.trim(),
            is_active: true,
            created_at: new Date().toISOString(),
          });
        }
      });
      if (missingCats.length > 0) {
        await db.categories.bulkPut(missingCats);
        allCats = await db.categories.toArray();
      }
      setCategoriesList(allCats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute product count per category
  const productCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      if (p.category) {
        counts[p.category] = (counts[p.category] || 0) + 1;
      }
    });
    return counts;
  }, [products]);

  // Distinct cracker categories (active from db.categories)
  const availableCategoryNames = useMemo(() => {
    const set = new Set<string>();
    categoriesList.forEach((c) => {
      if (c.name && c.is_active !== false) set.add(c.name);
    });
    if (set.size === 0) {
      DEFAULT_CATEGORIES.forEach((c) => set.add(c));
    }
    return Array.from(set).sort();
  }, [categoriesList]);

  // Categories filtered for Manage Categories modal search
  const filteredCategories = useMemo(() => {
    return categoriesList.filter((c) => {
      if (c.is_active === false) return false;
      if (!categorySearchQuery.trim()) return true;
      return c.name.toLowerCase().includes(categorySearchQuery.toLowerCase().trim());
    });
  }, [categoriesList, categorySearchQuery]);

  // Distinct brand names for filter (include any from db plus products)
  const availableBrandNames = useMemo(() => {
    const set = new Set<string>();
    brands.forEach((b) => set.add(b.name));
    products.forEach((p) => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set).sort();
  }, [brands, products]);

  // Check if any filter is active
  const isFiltered =
    searchQuery.trim() !== '' ||
    brandFilter !== 'all' ||
    categoryFilter !== 'all' ||
    statusFilter !== 'all';

  const handleClearFilters = () => {
    setSearchQuery('');
    setBrandFilter('all');
    setCategoryFilter('all');
    setStatusFilter('all');
    toast('All filters cleared', 'info');
  };

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesCode = p.code.toLowerCase().includes(q);
        const matchesPrice =
          String(p.price).includes(q) ||
          Number(p.price).toFixed(2).includes(q) ||
          Number(p.price).toFixed(0).includes(q);
        if (!matchesName && !matchesCode && !matchesPrice) return false;
      }
      if (categoryFilter !== 'all' && p.category !== categoryFilter) {
        return false;
      }
      if (brandFilter !== 'all' && (p.brand || 'General') !== brandFilter) {
        return false;
      }
      if (statusFilter !== 'all') {
        const isActive = statusFilter === 'active';
        if (p.is_active !== isActive) return false;
      }
      return true;
    });
  }, [products, searchQuery, categoryFilter, brandFilter, statusFilter]);

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast('Please enter a category name', 'error');
      return;
    }
    try {
      const created = await addCategory(trimmed);
      await loadData();
      setValue('category', created.name);
      setNewCategoryName('');
      toast(`Category "${created.name}" added successfully!`, 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to add category', 'error');
    }
  };

  const handlePromptDeleteCategory = (category: Category) => {
    setDeletingCategory(category);
    const otherCats = availableCategoryNames.filter(
      (c) => c.toLowerCase() !== category.name.toLowerCase()
    );
    setReassignCategoryName(otherCats[0] || 'Crackers');
  };

  const handleConfirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    setIsDeletingCategory(true);
    try {
      const count = productCategoryCounts[deletingCategory.name] || 0;
      const reassignTo = count > 0 ? reassignCategoryName : undefined;

      await deleteCategory(deletingCategory.id, deletingCategory.name, reassignTo);

      // Reset category filter if it matches the deleted category
      if (categoryFilter.toLowerCase() === deletingCategory.name.toLowerCase()) {
        setCategoryFilter('all');
      }

      // If form was using this category, update to replacement
      if (editingProduct?.category?.toLowerCase() === deletingCategory.name.toLowerCase()) {
        setValue('category', reassignCategoryName || availableCategoryNames[0] || 'Crackers');
      }

      logActivity({
        userId: user?.id,
        userName: user?.full_name || user?.email,
        action: 'DELETE',
        entity: 'categories',
        entityId: deletingCategory.id,
        summary: `Deleted category "${deletingCategory.name}"${reassignTo ? ` (${count} products moved to "${reassignTo}")` : ''}`,
      });

      syncService.updatePendingCount();

      toast(
        count > 0
          ? `Category "${deletingCategory.name}" deleted (${count} products moved to "${reassignTo}")`
          : `Category "${deletingCategory.name}" deleted successfully!`,
        'success'
      );

      setDeletingCategory(null);
      await loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to delete category', 'error');
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingProduct(null);
    reset({
      code: '',
      name: '',
      brand: brands[0]?.name || 'Standard',
      category: availableCategoryNames[0] || 'Sparklers',
      unit: 'box',
      price: 0,
      stock: 0,
    });
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    reset({
      code: product.code,
      name: product.name,
      brand: product.brand || 'Standard',
      category: product.category,
      unit: product.unit,
      price: product.price,
      stock: product.stock,
    });
    setIsDrawerOpen(true);
  };

  const onFormSubmit = async (data: ProductFormData) => {
    // Unique code check
    const existingCode = await db.products.where('code').equalsIgnoreCase(data.code).first();
    if (existingCode && (!editingProduct || existingCode.id !== editingProduct.id)) {
      toast(`Product code '${data.code}' is already in use`, 'error');
      return;
    }

    const now = new Date().toISOString();
    const productId = editingProduct ? editingProduct.id : generateUUID();

    const productRecord: Product = {
      id: productId,
      code: data.code.toUpperCase(),
      name: data.name,
      brand: data.brand || 'Standard',
      category: data.category,
      unit: data.unit,
      price: data.price,
      stock: data.stock,
      is_active: editingProduct ? editingProduct.is_active : true,
      created_at: editingProduct?.created_at || now,
      updated_at: now,
    };

    const outboxItem: OutboxItem = {
      id: generateUUID(),
      entity: 'products',
      op: editingProduct ? 'update' : 'insert',
      payload: productRecord,
      status: 'pending',
      attempts: 0,
      created_at: now,
    };

    await db.transaction('rw', [db.products, db.outbox], async () => {
      await db.products.put(productRecord);
      await db.outbox.put(outboxItem);
    });

    updateProductInIndex(productRecord);
    syncService.updatePendingCount();

    // Audit log
    logActivity({
      userId: user?.id,
      userName: user?.full_name || user?.email,
      action: editingProduct ? 'UPDATE' : 'INSERT',
      entity: 'products',
      entityId: productId,
      summary: editingProduct
        ? `Updated product ${productRecord.name} (${productRecord.code}) - Stock: ${productRecord.stock}, Price: Rs.${productRecord.price}`
        : `Added new product ${productRecord.name} (${productRecord.code}) with initial stock ${productRecord.stock}`,
      oldData: editingProduct,
      newData: productRecord,
    }).catch(console.warn);

    // Immediately trigger cloud sync to Supabase
    if (navigator.onLine) {
      syncService.triggerSync().catch(console.warn);
    }

    toast(editingProduct ? 'Product updated' : 'Product created', 'success');
    setIsDrawerOpen(false);
    loadData();
  };

  const handleToggleActive = async (product: Product) => {
    const updatedStatus = !product.is_active;
    const now = new Date().toISOString();
    const updatedRecord: Product = {
      ...product,
      is_active: updatedStatus,
      updated_at: now,
    };

    const outboxItem: OutboxItem = {
      id: generateUUID(),
      entity: 'products',
      op: 'update',
      payload: updatedRecord,
      status: 'pending',
      attempts: 0,
      created_at: now,
    };

    await db.transaction('rw', [db.products, db.outbox], async () => {
      await db.products.put(updatedRecord);
      await db.outbox.put(outboxItem);
    });

    updateProductInIndex(updatedRecord);
    syncService.updatePendingCount();

    // Audit log
    logActivity({
      userId: user?.id,
      userName: user?.full_name || user?.email,
      action: 'UPDATE',
      entity: 'products',
      entityId: product.id,
      summary: `${updatedStatus ? 'Activated' : 'Deactivated'} product ${product.name} (${product.code})`,
    }).catch(console.warn);

    // Immediately trigger cloud sync to Supabase
    if (navigator.onLine) {
      syncService.triggerSync().catch(console.warn);
    }

    toast(
      updatedStatus ? `Reactivated ${product.name}` : `Deactivated ${product.name}`,
      'info'
    );
    loadData();
  };

  // Download Sample Format CSV
  const handleDownloadSampleCsv = () => {
    const sampleHeaders = 'code,name,brand,category,unit,price,stock\n';
    const sampleRows = [
      'SPK-10,10 cm Electric Sparklers,Standard,Sparklers,box,45,250',
      'RCK-10,Baby Rockets,General,Rockets,box,120,140',
      'BMB-10,Hydro Bombs 2 inch,General,Bombs,box,95,200',
      'FLP-10,Flower Pots Special,Standard,Flower Pots,box,180,120',
      'CHK-10,Ground Chakkars Big,Standard,Ground Chakkars,box,140,160',
    ].join('\n');

    const csvContent = sampleHeaders + sampleRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'crackers_products_sample_format.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Sample CSV format downloaded successfully', 'success');
  };

  // CSV Export with brand
  const handleExportCsv = () => {
    const headers = ['code', 'name', 'brand', 'category', 'unit', 'price', 'stock', 'status'];
    const rows = products.map((p) => [
      `"${p.code}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.brand || 'Standard'}"`,
      `"${p.category}"`,
      `"${p.unit}"`,
      p.price,
      p.stock,
      p.is_active ? 'active' : 'inactive',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vna_traders_products_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSV Import File Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      parseCsv(text);
    };
    reader.readAsText(file);
  };

  const parseCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      toast('CSV file is empty or missing headers', 'error');
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const codeIdx = headers.indexOf('code');
    const nameIdx = headers.indexOf('name');
    const brandIdx = headers.indexOf('brand');
    const catIdx = headers.indexOf('category');
    const unitIdx = headers.indexOf('unit');
    const priceIdx = headers.indexOf('price');
    const stockIdx = headers.indexOf('stock');

    const previewList: Array<{ data: any; errors: string[] }> = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
      const cleanVals = values.map((v) => v.trim().replace(/^"|"$/g, ''));

      const code = cleanVals[codeIdx]?.toUpperCase() || '';
      const name = cleanVals[nameIdx] || '';
      const brand = brandIdx > -1 ? (cleanVals[brandIdx] || 'Standard') : 'Standard';
      const category = cleanVals[catIdx] || 'General';
      const unit = cleanVals[unitIdx] || 'box';
      const price = parseFloat(cleanVals[priceIdx] || '0');
      const stock = parseFloat(cleanVals[stockIdx] || '0');

      const errors: string[] = [];
      if (!code) errors.push('Missing code');
      if (!name) errors.push('Missing name');
      if (isNaN(price) || price <= 0) errors.push('Price must be > 0');
      if (isNaN(stock) || stock < 0) errors.push('Invalid stock');

      previewList.push({
        data: { code, name, brand, category, unit, price, stock },
        errors,
      });
    }

    setCsvPreviewData(previewList);
    setIsCsvModalOpen(true);
  };

  const handleCommitCsvImport = async () => {
    const validRows = csvPreviewData.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      toast('No valid records to import', 'error');
      return;
    }

    setIsImporting(true);
    try {
      const now = new Date().toISOString();
      const recordsToPut: Product[] = [];
      const outboxItems: OutboxItem[] = [];

      for (const row of validRows) {
        const existing = await db.products.where('code').equalsIgnoreCase(row.data.code).first();
        const prodId = existing ? existing.id : generateUUID();

        const product: Product = {
          id: prodId,
          code: row.data.code,
          name: row.data.name,
          brand: row.data.brand || 'Standard',
          category: row.data.category,
          unit: row.data.unit,
          price: row.data.price,
          stock: row.data.stock,
          is_active: true,
          created_at: existing?.created_at || now,
          updated_at: now,
        };

        recordsToPut.push(product);
        outboxItems.push({
          id: generateUUID(),
          entity: 'products',
          op: existing ? 'update' : 'insert',
          payload: product,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
      }

      await db.transaction('rw', [db.products, db.outbox], async () => {
        await db.products.bulkPut(recordsToPut);
        await db.outbox.bulkPut(outboxItems);
      });

      for (const p of recordsToPut) {
        updateProductInIndex(p);
      }

      syncService.updatePendingCount();

      logActivity({
        userId: user?.id,
        userName: user?.full_name || user?.email,
        action: 'INSERT',
        entity: 'products',
        entityId: 'bulk_csv',
        summary: `Imported / updated stock for ${recordsToPut.length} products via CSV`,
      }).catch(console.warn);

      if (navigator.onLine) {
        syncService.triggerSync().catch(console.warn);
      }

      toast(`Successfully imported ${recordsToPut.length} products`, 'success');
      setIsCsvModalOpen(false);
      setCsvPreviewData([]);
      loadData();
    } catch (err: any) {
      toast(`Import failed: ${err.message}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="bg-surface border border-border rounded p-4 flex flex-col md:flex-row gap-3 items-center justify-between shadow-subtle">
        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search by code, name, or price..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8 min-h-[40px] text-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text rounded-full hover:bg-border/60 transition-colors"
              title="Clear search text"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Brand Filter */}
          <Select
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            className="text-xs min-h-[40px]"
          >
            <option value="all">All Brands</option>
            {availableBrandNames.map((b) => (
              <option key={b} value={b}>
                Brand: {b}
              </option>
            ))}
          </Select>

          {/* Category Filter */}
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs min-h-[40px]"
          >
            <option value="all">All Categories</option>
            {availableCategoryNames.map((c) => (
              <option key={c} value={c}>
                Category: {c}
              </option>
            ))}
          </Select>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs min-h-[40px]"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Deactivated Only</option>
          </Select>

          {/* CLEAR FILTER BUTTON */}
          {isFiltered && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClearFilters}
              className="text-xs text-danger hover:bg-danger-light hover:border-danger/40 border-dashed min-h-[40px] px-3 gap-1.5 shrink-0"
              title="Clear all active search and filters"
            >
              <FilterX size={14} />
              <span>Clear Filter</span>
            </Button>
          )}

          {/* Manage Categories Button (Add & Delete Categories) */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsManageCategoriesOpen(true)}
            className="min-h-[40px] text-xs gap-1.5 shrink-0 font-medium border-accent/40 text-accent hover:bg-accent-light"
            title="Manage, Add or Delete Cracker Categories"
          >
            <Tags size={14} />
            <span>Categories</span>
            <span className="ml-0.5 px-1.5 py-0.2 bg-accent/15 text-accent rounded-full text-[10px] font-bold">
              {availableCategoryNames.length}
            </span>
          </Button>

          {/* Sample CSV Download */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadSampleCsv}
            title="Download sample CSV template format"
          >
            <FileSpreadsheet size={14} className="text-accent" />
            <span>Sample Format</span>
          </Button>

          {/* Export CSV */}
          <Button variant="secondary" size="sm" onClick={handleExportCsv} title="Export products as CSV">
            <Download size={14} />
            <span>Export CSV</span>
          </Button>

          {/* Import CSV */}
          <label className="inline-flex items-center justify-center font-medium transition-colors select-none rounded focus:outline-none focus:ring-2 focus:ring-accent bg-surface text-text border border-border hover:bg-background text-xs px-2.5 py-1.5 gap-1.5 min-h-[40px] cursor-pointer">
            <Upload size={14} />
            <span>Import CSV</span>
            <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
          </label>

          {/* Add Product */}
          <Button variant="primary" size="sm" onClick={handleOpenCreate}>
            <Plus size={14} />
            <span>Add Product</span>
          </Button>
        </div>
      </div>

      {/* Active Filters Summary Pills */}
      {isFiltered && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs bg-surface/60 border border-border px-3 py-2 rounded">
          <span className="text-text-muted font-medium flex items-center gap-1 mr-1">
            <FilterX size={13} className="text-accent" />
            Active Filters:
          </span>
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-background border border-border rounded text-text font-medium text-[11px]">
              Search: <strong className="text-accent">"{searchQuery}"</strong>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="hover:text-danger ml-0.5"
                title="Remove search filter"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {brandFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-background border border-border rounded text-text font-medium text-[11px]">
              Brand: <strong className="text-accent">{brandFilter}</strong>
              <button
                type="button"
                onClick={() => setBrandFilter('all')}
                className="hover:text-danger ml-0.5"
                title="Remove brand filter"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {categoryFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-background border border-border rounded text-text font-medium text-[11px]">
              Category: <strong className="text-accent">{categoryFilter}</strong>
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className="hover:text-danger ml-0.5"
                title="Remove category filter"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-background border border-border rounded text-text font-medium text-[11px]">
              Status: <strong className="text-accent">{statusFilter === 'active' ? 'Active' : 'Deactivated'}</strong>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className="hover:text-danger ml-0.5"
                title="Remove status filter"
              >
                <X size={12} />
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-danger hover:underline text-[11px] font-semibold ml-auto flex items-center gap-1"
          >
            <RotateCcw size={11} />
            <span>Clear All</span>
          </button>
        </div>
      )}

      {/* Products Table */}
      {loading ? (
        <TableSkeleton rows={8} cols={8} />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          message={isFiltered ? 'No products match the selected filters' : 'No products found'}
          actionLabel={isFiltered ? 'Clear All Filters' : 'Add New Product'}
          onAction={isFiltered ? handleClearFilters : handleOpenCreate}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Price (₹)</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map((p) => {
              const brandName = p.brand || 'Standard';
              const isStandard = brandName === 'Standard';

              return (
                <TableRow key={p.id}>
                  <TableCell className="font-mono font-semibold text-accent">{p.code}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                        isStandard
                          ? 'bg-accent/10 text-accent border border-accent/20'
                          : 'bg-background text-text border border-border'
                      }`}
                    >
                      <Tag size={11} />
                      {brandName}
                    </span>
                  </TableCell>
                  <TableCell className="text-text-muted">{p.category}</TableCell>
                  <TableCell className="text-xs text-text-muted uppercase">{p.unit}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatINR(p.price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span
                      className={`font-medium ${
                        p.stock <= 10 ? 'text-danger font-bold' : 'text-text'
                      }`}
                    >
                      {p.stock}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                        p.is_active
                          ? 'bg-success-light text-success'
                          : 'bg-danger-light text-danger'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenEdit(p)}
                        className="p-1 min-h-[32px]"
                        title="Edit product"
                      >
                        <Edit size={14} />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleToggleActive(p)}
                        className={`p-1 min-h-[32px] ${
                          p.is_active
                            ? 'text-danger hover:bg-danger-light'
                            : 'text-success hover:bg-success-light'
                        }`}
                        title={p.is_active ? 'Deactivate' : 'Reactivate'}
                      >
                        {p.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* CREATE / EDIT PRODUCT DRAWER */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingProduct ? `Edit Product: ${editingProduct.code}` : 'Add New Product'}
      >
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <Input
            label="Product Code (e.g. SPK-05)"
            {...register('code')}
            error={errors.code?.message}
            placeholder="SPK-05"
            autoFocus
          />

          <Input
            label="Product Name"
            {...register('name')}
            error={errors.name?.message}
            placeholder="e.g. 50 cm Electric Sparklers"
          />

          {/* Brand Selector */}
          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Brand <span className="text-danger">*</span>
            </label>
            <div className="flex gap-2">
              <select
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-surface text-text border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent"
                {...register('brand')}
              >
                {availableBrandNames.map((bName) => (
                  <option key={bName} value={bName}>
                    {bName} {bName === 'Standard' ? '(Standard Fireworks)' : bName === 'General' ? '(General / Local)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-text-muted mt-1">
              Select manufacturer/brand (Standard, General, or custom added under Brands module).
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-text">
                Category <span className="text-danger">*</span>
              </label>
              <button
                type="button"
                onClick={() => setIsManageCategoriesOpen(true)}
                className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
              >
                <Tags size={13} />
                <span>+ Add / Manage Categories</span>
              </button>
            </div>
            <select
              className="w-full min-h-[44px] px-3 py-2 text-sm bg-surface text-text border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent"
              {...register('category')}
            >
              {availableCategoryNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="mt-1 text-xs text-danger font-medium">{errors.category.message}</p>
            )}
            <p className="text-[11px] text-text-muted mt-1">
              Select standard cracker category or click "+ Add Category" to create a custom category.
            </p>
          </div>

          <Select label="Packaging Unit" {...register('unit')} error={errors.unit?.message}>
            <option value="box">Box</option>
            <option value="piece">Piece</option>
            <option value="packet">Packet</option>
            <option value="bag">Bag</option>
          </Select>

          <Input
            label="Unit Price (₹)"
            type="number"
            step="0.5"
            {...register('price', { valueAsNumber: true })}
            error={errors.price?.message}
            placeholder="0.00"
          />

          <Input
            label="Available Stock"
            type="number"
            {...register('stock', { valueAsNumber: true })}
            error={errors.stock?.message}
            placeholder="0"
          />

          <div className="pt-4 border-t border-border flex gap-2">
            <Button type="submit" variant="primary" fullWidth>
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Drawer>

      {/* CSV IMPORT PREVIEW MODAL */}
      <Dialog
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        title="CSV Import Preview"
        maxWidth="xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            Found {csvPreviewData.length} rows.{' '}
            {csvPreviewData.filter((r) => r.errors.length > 0).length > 0 && (
              <span className="text-danger font-semibold">
                Some rows have validation issues and will be skipped.
              </span>
            )}
          </p>

          <div className="border border-border rounded max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-background border-b border-border">
                <tr>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Brand</th>
                  <th className="p-2 text-left">Category</th>
                  <th className="p-2 text-right">Price</th>
                  <th className="p-2 text-right">Stock</th>
                  <th className="p-2 text-left">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {csvPreviewData.map((row, idx) => (
                  <tr key={idx} className={row.errors.length > 0 ? 'bg-danger-light/30' : ''}>
                    <td className="p-2 font-mono font-medium">{row.data.code}</td>
                    <td className="p-2">{row.data.name}</td>
                    <td className="p-2 font-semibold text-accent">{row.data.brand || 'Standard'}</td>
                    <td className="p-2 text-text-muted">{row.data.category}</td>
                    <td className="p-2 text-right tabular-nums">{row.data.price}</td>
                    <td className="p-2 text-right tabular-nums">{row.data.stock}</td>
                    <td className="p-2">
                      {row.errors.length > 0 ? (
                        <span className="text-danger font-medium">{row.errors.join(', ')}</span>
                      ) : (
                        <span className="text-success font-medium">Valid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCsvModalOpen(false)}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCommitCsvImport}
              disabled={isImporting || csvPreviewData.filter((r) => r.errors.length === 0).length === 0}
            >
              {isImporting ? 'Importing...' : 'Commit Valid Rows'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* MANAGE CATEGORIES MODAL (ADD & DELETE CATEGORIES) */}
      <Dialog
        isOpen={isManageCategoriesOpen}
        onClose={() => {
          setIsManageCategoriesOpen(false);
          setCategorySearchQuery('');
        }}
        title="Manage Categories"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <p className="text-xs text-text-muted">
            Add new categories or delete existing categories. Any changes automatically sync across all your billing terminals.
          </p>

          {/* ADD CATEGORY CARD */}
          <div className="bg-background border border-border rounded-lg p-3 space-y-2">
            <label className="text-xs font-bold text-text flex items-center gap-1.5">
              <FolderPlus size={15} className="text-accent" />
              <span>Add New Category</span>
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateCategory();
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Enter category name (e.g. Laser Fountains, Confetti)..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="text-xs flex-1"
                autoFocus={isManageCategoriesOpen}
              />
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={!newCategoryName.trim()}
                className="shrink-0 gap-1 min-h-[40px] px-3 font-semibold"
              >
                <Plus size={14} />
                <span>Add Category</span>
              </Button>
            </form>
          </div>

          {/* SEARCH & COUNTER */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <span className="text-xs font-semibold text-text flex items-center gap-1.5">
              <Tags size={14} className="text-accent" />
              Categories ({filteredCategories.length})
            </span>
            <div className="relative w-48">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search categories..."
                value={categorySearchQuery}
                onChange={(e) => setCategorySearchQuery(e.target.value)}
                className="w-full pl-8 pr-2 py-1 text-xs bg-surface text-text border border-border rounded focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* CATEGORIES LIST */}
          <div className="border border-border rounded divide-y divide-border max-h-72 overflow-y-auto">
            {filteredCategories.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted">
                No categories found matching "{categorySearchQuery}"
              </div>
            ) : (
              filteredCategories.map((c) => {
                const count = productCategoryCounts[c.name] || 0;
                return (
                  <div
                    key={c.id}
                    className="p-3 flex items-center justify-between hover:bg-background/60 transition-colors gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Tag size={14} className="text-accent shrink-0" />
                      <span className="text-xs font-semibold text-text truncate">
                        {c.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface border border-border text-text-muted shrink-0">
                        {count} {count === 1 ? 'product' : 'products'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter(c.name);
                          setIsManageCategoriesOpen(false);
                          toast(`Filtered by category "${c.name}"`, 'info');
                        }}
                        className="text-[11px] text-accent hover:underline px-2 py-1 rounded hover:bg-accent/10 font-medium transition-colors"
                        title={`View products in "${c.name}"`}
                      >
                        View Products
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePromptDeleteCategory(c)}
                        className="p-1.5 text-text-muted hover:text-danger hover:bg-danger-light rounded transition-colors"
                        title={`Delete category "${c.name}"`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsManageCategoriesOpen(false);
                setCategorySearchQuery('');
              }}
            >
              Done
            </Button>
          </div>
        </div>
      </Dialog>

      {/* DELETE CATEGORY CONFIRMATION DIALOG */}
      <Dialog
        isOpen={!!deletingCategory}
        onClose={() => setDeletingCategory(null)}
        title={`Delete Category: "${deletingCategory?.name}"`}
        maxWidth="md"
      >
        <div className="space-y-4">
          {(productCategoryCounts[deletingCategory?.name || ''] || 0) === 0 ? (
            <p className="text-xs text-text">
              Are you sure you want to delete category <strong>"{deletingCategory?.name}"</strong>?
              This category currently has no assigned products and will be removed immediately.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong className="block font-bold">
                    {productCategoryCounts[deletingCategory?.name || '']} product(s) are in this category
                  </strong>
                  <span>
                    Select which category to reassign these products to so they remain properly categorized:
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  Move products to category:
                </label>
                <select
                  value={reassignCategoryName}
                  onChange={(e) => setReassignCategoryName(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 text-xs bg-surface text-text border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {availableCategoryNames
                    .filter((c) => c.toLowerCase() !== deletingCategory?.name.toLowerCase())
                    .map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDeletingCategory(null)}
              disabled={isDeletingCategory}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmDeleteCategory}
              disabled={
                isDeletingCategory ||
                ((productCategoryCounts[deletingCategory?.name || ''] || 0) > 0 && !reassignCategoryName)
              }
              className="gap-1.5"
            >
              <Trash2 size={14} />
              <span>
                {isDeletingCategory
                  ? 'Deleting...'
                  : (productCategoryCounts[deletingCategory?.name || ''] || 0) > 0
                  ? 'Reassign & Delete'
                  : 'Delete Category'}
              </span>
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
