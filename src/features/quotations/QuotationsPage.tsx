import React, { useState, useEffect, useMemo } from 'react';
import { db, generateNextQuotationNo, generateNextSoNo, generateNextInvoiceNo } from '@/db';
import { syncService } from '@/sync/syncService';
import {
  Quotation,
  QuotationItem,
  QuotationStatus,
  Product,
  Client,
  PricingType,
  SaleOrder,
  SaleOrderItem,
  Invoice,
  InvoiceItem,
  Brand,
} from '@/types';
import { formatINR, numberToWordsINR, formatDateDMY } from '@/lib/format';
import { generateUUID } from '@/lib/uuid';
import { printFormattedElement } from '@/lib/printer/printService';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { SearchableProductSelect, ProductSearchAddBar } from '@/components/ui/ProductSelectBox';
import { QuickProductModal } from '@/components/QuickProductModal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import { VnaLogo } from '@/components/VnaLogo';
import {
  Search,
  Plus,
  Printer,
  FileText,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  RotateCcw,
  Send,
  Layers,
  CheckCheck,
  Edit3,
} from 'lucide-react';

export const DEFAULT_QUOTATION_TERMS = [
  '1. Price Validity: Rates quoted are strictly valid for 7 days or until the validity date indicated, subject to festival raw material market fluctuations.',
  '2. Genuine Green Crackers: All fireworks products conform 100% to Supreme Court & PESO emission standards with authentic QR codes.',
  '3. GST & Taxation: 18% GST is applicable as per government regulations under Fireworks HSN Code 3604.',
  '4. Payment Terms: 50% advance payment required upon quotation acceptance / booking; balance 50% payable prior to lorry dispatch.',
  '5. Logistics & Freight: Packaging, handling, and transportation charges are extra at actuals unless explicitly specified.',
  '6. Seasonal Return Policy: Pyrotechnic fireworks once sold or booked cannot be cancelled, returned, or exchanged.',
  '7. Safety & Storage: Fireworks must be kept in a dry, well-ventilated storeroom strictly away from open heat, sparks, and children.',
].join('\n');

export const QuotationsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';
  const { toast } = useToast();

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pricingFilter, setPricingFilter] = useState<string>('all');

  // Create / Edit Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [quoteNo, setQuoteNo] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [pricingType, setPricingType] = useState<PricingType>('wholesale');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [quoteStatus, setQuoteStatus] = useState<QuotationStatus>('draft');
  const [taxMode, setTaxMode] = useState<'intra' | 'inter'>('intra'); // intra: CGST+SGST (TN), inter: IGST
  const [termsAndConditions, setTermsAndConditions] = useState(DEFAULT_QUOTATION_TERMS);
  const [notes, setNotes] = useState('');
  const [quoteItems, setQuoteItems] = useState<
    Array<{
      id: string;
      product_id?: string;
      product_code: string;
      product_name: string;
      brand: string;
      hsn_code: string;
      unit: string;
      qty: number;
      unit_price: number;
      discount_percent: number;
      taxable_value: number;
      line_total: number;
    }>
  >([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isQuickProductOpen, setIsQuickProductOpen] = useState(false);

  // View / Print Modal State
  const [selectedQuote, setSelectedQuote] = useState<Quotation | null>(null);
  const [selectedQuoteItems, setSelectedQuoteItems] = useState<QuotationItem[]>([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [includeBankDetails, setIncludeBankDetails] = useState(true);
  const [includeTerms, setIncludeTerms] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const allQuotes = await db.quotations.reverse().sortBy('created_at');
      setQuotations(allQuotes);

      const allClients = await db.clients.toArray();
      setClients(allClients.filter((c) => c.is_active));

      const allProds = await db.products.toArray();
      setProducts(allProds.filter((p) => p.is_active));

      const allBrands = await db.brands.toArray();
      setBrands(allBrands.filter((b) => b.is_active));
    } catch (err: any) {
      toast(err?.message || 'Failed to load quotations data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleSync = () => {
      loadData();
    };

    window.addEventListener('quotations-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('quotations-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, []);

  // Set validity helper presets
  const applyValidityPreset = (days: number) => {
    const base = new Date(quotationDate || new Date());
    base.setDate(base.getDate() + days);
    setValidUntil(base.toISOString().slice(0, 10));
  };

  // Open Create Modal
  const handleOpenCreate = async () => {
    setEditingQuoteId(null);
    const nextNo = await generateNextQuotationNo();
    setQuoteNo(nextNo);
    setSelectedClientId('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerGstin('');
    setPricingType('wholesale');
    const today = new Date().toISOString().slice(0, 10);
    setQuotationDate(today);
    const validD = new Date();
    validD.setDate(validD.getDate() + 7);
    setValidUntil(validD.toISOString().slice(0, 10));
    setQuoteStatus('draft');
    setTaxMode('intra');
    setTermsAndConditions(DEFAULT_QUOTATION_TERMS);
    setNotes('');
    setQuoteItems([]);
    setIsCreateOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = async (quote: Quotation) => {
    if (quote.status === 'converted') {
      toast('Converted quotations cannot be modified.', 'error');
      return;
    }
    setEditingQuoteId(quote.id);
    setQuoteNo(quote.quotation_no);
    setSelectedClientId(quote.client_id || '');
    setCustomerName(quote.customer_name);
    setCustomerPhone(quote.customer_phone || '');
    setCustomerAddress(quote.customer_address || '');
    setCustomerGstin(quote.customer_gstin || '');
    setPricingType(quote.pricing_type);
    setQuotationDate(quote.quotation_date);
    setValidUntil(quote.valid_until);
    setQuoteStatus(quote.status);
    setTaxMode(quote.igst > 0 ? 'inter' : 'intra');
    setTermsAndConditions(quote.terms_and_conditions || DEFAULT_QUOTATION_TERMS);
    setNotes(quote.notes || '');

    const items = await db.quotation_items.where('quotation_id').equals(quote.id).toArray();
    setQuoteItems(
      items.map((it) => ({
        id: it.id,
        product_id: it.product_id,
        product_code: it.product_code || '',
        product_name: it.product_name,
        brand: it.brand || 'Standard',
        hsn_code: it.hsn_code || '3604',
        unit: it.unit,
        qty: it.qty,
        unit_price: it.unit_price,
        discount_percent: it.discount_percent || 0,
        taxable_value: it.taxable_value,
        line_total: it.line_total,
      }))
    );
    setIsCreateOpen(true);
  };

  // Handle Client Selection
  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    if (!clientId) return;
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setCustomerName(client.name);
      setCustomerPhone(client.phone || '');
      setCustomerAddress([client.address, client.city, client.state, client.pincode].filter(Boolean).join(', '));
      setCustomerGstin(client.gstin || '');
      if (client.customer_tier) {
        setPricingType(client.customer_tier);
      }
      if (client.state && !client.state.toLowerCase().includes('tamil nadu')) {
        setTaxMode('inter');
      } else {
        setTaxMode('intra');
      }
    }
  };

  // Add Item to Quotation
  const handleAddItem = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    // Check if already in items
    const existingIndex = quoteItems.findIndex((it) => it.product_id === prod.id);
    if (existingIndex >= 0) {
      const updated = [...quoteItems];
      updated[existingIndex].qty += 1;
      const rate = updated[existingIndex].unit_price;
      const disc = updated[existingIndex].discount_percent;
      const gross = updated[existingIndex].qty * rate;
      const net = gross * (1 - disc / 100);
      updated[existingIndex].taxable_value = Math.round(net * 100) / 100;
      updated[existingIndex].line_total = Math.round(net * 100) / 100;
      setQuoteItems(updated);
      return;
    }

    const unitPrice =
      pricingType === 'wholesale' && prod.wholesale_price && prod.wholesale_price > 0
        ? prod.wholesale_price
        : prod.price;

    // Check brand discount
    let discountPercent = 0;
    if (prod.brand) {
      const matchedBrand = brands.find(
        (b) => b.name.trim().toLowerCase() === prod.brand?.trim().toLowerCase()
      );
      if (matchedBrand?.has_discount && matchedBrand.discount_percent) {
        discountPercent = matchedBrand.discount_percent;
      }
    }

    const qty = 1;
    const gross = qty * unitPrice;
    const net = gross * (1 - discountPercent / 100);

    setQuoteItems([
      ...quoteItems,
      {
        id: generateUUID(),
        product_id: prod.id,
        product_code: prod.code,
        product_name: prod.name,
        brand: prod.brand || 'Standard',
        hsn_code: '3604',
        unit: prod.unit || 'box',
        qty: 1,
        unit_price: unitPrice,
        discount_percent: discountPercent,
        taxable_value: Math.round(net * 100) / 100,
        line_total: Math.round(net * 100) / 100,
      },
    ]);
  };

  // Add Custom / Ad-hoc Item
  const handleAddCustomItem = () => {
    setQuoteItems([
      ...quoteItems,
      {
        id: generateUUID(),
        product_code: `CUST-${quoteItems.length + 1}`,
        product_name: '',
        brand: 'Standard',
        hsn_code: '3604',
        unit: 'box',
        qty: 1,
        unit_price: 100,
        discount_percent: 0,
        taxable_value: 100,
        line_total: 100,
      },
    ]);
  };

  const handleAddCustomProductWithName = (name: string) => {
    setQuoteItems([
      ...quoteItems,
      {
        id: generateUUID(),
        product_code: `CUST-${quoteItems.length + 1}`,
        product_name: name,
        brand: 'Standard',
        hsn_code: '3604',
        unit: 'box',
        qty: 1,
        unit_price: 100,
        discount_percent: 0,
        taxable_value: 100,
        line_total: 100,
      },
    ]);
    toast(`Added custom cracker "${name}" to quote`, 'info');
  };

  // Update item fields
  const handleUpdateItem = (
    index: number,
    field: 'qty' | 'unit_price' | 'discount_percent' | 'product_name' | 'unit' | 'brand' | 'hsn_code',
    value: any
  ) => {
    const updated = [...quoteItems];
    const item = { ...updated[index], [field]: value };

    const qty = Math.max(0, Number(item.qty) || 0);
    const rate = Math.max(0, Number(item.unit_price) || 0);
    const disc = Math.max(0, Math.min(100, Number(item.discount_percent) || 0));

    const gross = qty * rate;
    const net = gross * (1 - disc / 100);

    item.taxable_value = Math.round(net * 100) / 100;
    item.line_total = Math.round(net * 100) / 100;

    updated[index] = item;
    setQuoteItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setQuoteItems(quoteItems.filter((_, i) => i !== index));
  };

  // Switching pricing mode recalibrates standard catalog items
  const handleSwitchPricingType = (mode: PricingType) => {
    setPricingType(mode);
    setQuoteItems(
      quoteItems.map((it) => {
        if (!it.product_id) return it;
        const prod = products.find((p) => p.id === it.product_id);
        if (!prod) return it;
        const newRate =
          mode === 'wholesale' && prod.wholesale_price && prod.wholesale_price > 0
            ? prod.wholesale_price
            : prod.price;
        const gross = it.qty * newRate;
        const net = gross * (1 - (it.discount_percent || 0) / 100);
        return {
          ...it,
          unit_price: newRate,
          taxable_value: Math.round(net * 100) / 100,
          line_total: Math.round(net * 100) / 100,
        };
      })
    );
  };

  // Financial Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;

    for (const item of quoteItems) {
      const gross = item.qty * item.unit_price;
      const discountVal = gross * ((item.discount_percent || 0) / 100);
      const taxable = gross - discountVal;

      subtotal += gross;
      totalDiscount += discountVal;
      taxableAmount += taxable;
    }

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (taxMode === 'intra') {
      cgst = Math.round(taxableAmount * 0.09 * 100) / 100;
      sgst = Math.round(taxableAmount * 0.09 * 100) / 100;
    } else {
      igst = Math.round(taxableAmount * 0.18 * 100) / 100;
    }

    const rawTotal = taxableAmount + cgst + sgst + igst;
    const roundedTotal = Math.round(rawTotal);
    const roundOff = Math.round((roundedTotal - rawTotal) * 100) / 100;

    return {
      subtotal,
      totalDiscount,
      taxableAmount,
      cgst,
      sgst,
      igst,
      roundOff,
      totalAmount: roundedTotal,
    };
  }, [quoteItems, taxMode]);

  // Save Quotation
  const handleSaveQuotation = async () => {
    if (!customerName.trim()) {
      toast('Please enter customer / buyer name', 'error');
      return;
    }
    const validItems = quoteItems.filter((i) => i.product_name.trim() && i.qty > 0);
    if (validItems.length === 0) {
      toast('Please add at least one cracker item with quantity > 0', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const quoteId = editingQuoteId || generateUUID();

      const quoteRecord: Quotation = {
        id: quoteId,
        quotation_no: quoteNo,
        client_id: selectedClientId || undefined,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        customer_address: customerAddress.trim() || undefined,
        customer_gstin: customerGstin.trim().toUpperCase() || undefined,
        pricing_type: pricingType,
        quotation_date: quotationDate,
        valid_until: validUntil,
        status: quoteStatus,
        subtotal: calculations.subtotal,
        discount_amount: calculations.totalDiscount,
        taxable_amount: calculations.taxableAmount,
        gst_rate: 18,
        cgst: calculations.cgst,
        sgst: calculations.sgst,
        igst: calculations.igst,
        round_off: calculations.roundOff,
        total_amount: calculations.totalAmount,
        terms_and_conditions: termsAndConditions.trim() || undefined,
        notes: notes.trim() || undefined,
        created_by: user?.full_name || user?.email || 'Staff',
        created_at: editingQuoteId ? (quotations.find((q) => q.id === quoteId)?.created_at || now) : now,
        updated_at: now,
      };

      const itemRecords: QuotationItem[] = validItems.map((it) => ({
        id: it.id || generateUUID(),
        quotation_id: quoteId,
        product_id: it.product_id,
        product_code: it.product_code,
        product_name: it.product_name.trim(),
        brand: it.brand || 'Standard',
        hsn_code: it.hsn_code || '3604',
        unit: it.unit || 'box',
        qty: it.qty,
        unit_price: it.unit_price,
        discount_percent: it.discount_percent || 0,
        taxable_value: it.taxable_value,
        line_total: it.line_total,
      }));

      await db.transaction('rw', [db.quotations, db.quotation_items, db.activity_logs], async () => {
        if (editingQuoteId) {
          await db.quotations.put(quoteRecord);
          await db.quotation_items.where('quotation_id').equals(quoteId).delete();
          await db.quotation_items.bulkAdd(itemRecords);
        } else {
          await db.quotations.add(quoteRecord);
          await db.quotation_items.bulkAdd(itemRecords);
        }

        await db.activity_logs.add({
          id: Date.now(),
          action: editingQuoteId ? 'edit_quotation' : 'create_quotation',
          entity: 'quotations',
          entity_id: quoteId,
          summary: `Quotation ${quoteNo} for ${customerName} (₹${calculations.totalAmount})`,
          created_at: now,
        });
      });

      await db.outbox.add({
        id: generateUUID(),
        entity: 'quotations',
        op: editingQuoteId ? 'update' : 'insert',
        payload: { ...quoteRecord, items: itemRecords },
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      syncService.triggerSync();

      toast(`Quotation ${quoteNo} successfully saved!`, 'success');
      setIsCreateOpen(false);
      await loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to save quotation', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Open View & Print Modal
  const handleOpenView = async (quote: Quotation) => {
    setSelectedQuote(quote);
    const items = await db.quotation_items.where('quotation_id').equals(quote.id).toArray();
    setSelectedQuoteItems(items);
    setIsViewModalOpen(true);
  };

  // Print A4
  const handlePrint = async () => {
    if (!selectedQuote) return;
    setIsPrinting(true);
    try {
      await printFormattedElement('quotation-print-area', {
        title: `Quotation-${selectedQuote.quotation_no}`,
        paperSize: 'a4',
      });
    } catch (err: any) {
      toast(err?.message || 'Print error', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  // Update Status directly
  const handleUpdateStatus = async (quote: Quotation, newStatus: QuotationStatus) => {
    try {
      const now = new Date().toISOString();
      await db.quotations.update(quote.id, {
        status: newStatus,
        updated_at: now,
      });
      await db.activity_logs.add({
        id: Date.now(),
        action: 'status_update_quotation',
        entity: 'quotations',
        entity_id: quote.id,
        summary: `Quotation ${quote.quotation_no} status changed to ${newStatus}`,
        created_at: now,
      });
      const updatedQuote = await db.quotations.get(quote.id);
      if (updatedQuote) {
        await db.outbox.add({
          id: generateUUID(),
          entity: 'quotations',
          op: 'update',
          payload: updatedQuote,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
        syncService.triggerSync();
      }
      toast(`Quotation ${quote.quotation_no} updated to ${newStatus.toUpperCase()}`, 'success');
      await loadData();
      if (selectedQuote?.id === quote.id) {
        setSelectedQuote({ ...selectedQuote, status: newStatus });
      }
    } catch (err: any) {
      toast(err?.message || 'Failed to update quotation status', 'error');
    }
  };

  // 1-Click Convert to Sale Order
  const handleConvertToSaleOrder = async (quote: Quotation) => {
    if (quote.status === 'converted') {
      toast('This quotation has already been converted.', 'info');
      return;
    }
    const confirmConvert = window.confirm(
      `Convert Quotation ${quote.quotation_no} for ${quote.customer_name} into a formal Sale Order?`
    );
    if (!confirmConvert) return;

    try {
      const now = new Date().toISOString();
      const soNo = await generateNextSoNo();
      const soId = generateUUID();

      const items = await db.quotation_items.where('quotation_id').equals(quote.id).toArray();

      const soRecord: SaleOrder = {
        id: soId,
        so_no: soNo,
        client_id: quote.client_id,
        customer_name: quote.customer_name,
        customer_phone: quote.customer_phone,
        customer_address: quote.customer_address,
        customer_gstin: quote.customer_gstin,
        pricing_type: quote.pricing_type,
        order_date: new Date().toISOString().slice(0, 10),
        delivery_due_date: quote.valid_until,
        status: 'confirmed',
        subtotal: quote.subtotal,
        discount_amount: quote.discount_amount,
        total_amount: quote.total_amount,
        payment_status: 'unpaid',
        paid_amount: 0,
        notes: `Converted from Quotation ${quote.quotation_no}. ${quote.notes || ''}`.trim(),
        created_by: user?.full_name || user?.email || 'Staff',
        created_at: now,
        updated_at: now,
      };

      const soItems: SaleOrderItem[] = items.map((it) => ({
        id: generateUUID(),
        so_id: soId,
        product_id: it.product_id,
        product_code: it.product_code,
        product_name: it.product_name,
        brand: it.brand,
        unit: it.unit,
        qty: it.qty,
        unit_price: it.unit_price,
        discount_percent: it.discount_percent,
        line_total: it.line_total,
      }));

      await db.transaction('rw', [db.quotations, db.sale_orders, db.sale_order_items, db.activity_logs], async () => {
        await db.sale_orders.add(soRecord);
        await db.sale_order_items.bulkAdd(soItems);
        await db.quotations.update(quote.id, {
          status: 'converted',
          converted_to: 'sale_order',
          converted_id: soNo,
          updated_at: now,
        });
        await db.activity_logs.add({
          id: Date.now(),
          action: 'convert_quotation_to_so',
          entity: 'quotations',
          entity_id: quote.id,
          summary: `Quotation ${quote.quotation_no} converted to Sale Order ${soNo}`,
          created_at: now,
        });
      });

      await db.outbox.add({
        id: generateUUID(),
        entity: 'sale_orders',
        op: 'insert',
        payload: { ...soRecord, items: soItems },
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      const updatedQuoteAfterSo = await db.quotations.get(quote.id);
      if (updatedQuoteAfterSo) {
        await db.outbox.add({
          id: generateUUID(),
          entity: 'quotations',
          op: 'update',
          payload: updatedQuoteAfterSo,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
      }
      syncService.triggerSync();

      toast(`Successfully converted ${quote.quotation_no} to Sale Order ${soNo}!`, 'success');
      await loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to convert to Sale Order', 'error');
    }
  };

  // 1-Click Convert to Tax Invoice
  const handleConvertToInvoice = async (quote: Quotation) => {
    if (quote.status === 'converted') {
      toast('This quotation has already been converted.', 'info');
      return;
    }
    const confirmConvert = window.confirm(
      `Convert Quotation ${quote.quotation_no} for ${quote.customer_name} into a formal Tax Invoice?`
    );
    if (!confirmConvert) return;

    try {
      const now = new Date().toISOString();
      const invNo = await generateNextInvoiceNo();
      const invId = generateUUID();

      const items = await db.quotation_items.where('quotation_id').equals(quote.id).toArray();

      const invRecord: Invoice = {
        id: invId,
        invoice_no: invNo,
        client_id: quote.client_id,
        customer_name: quote.customer_name,
        customer_phone: quote.customer_phone,
        customer_address: quote.customer_address,
        customer_gstin: quote.customer_gstin,
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: quote.valid_until,
        pricing_type: quote.pricing_type,
        subtotal: quote.subtotal,
        discount_amount: quote.discount_amount,
        taxable_amount: quote.taxable_amount,
        gst_rate: 18,
        cgst: quote.cgst,
        sgst: quote.sgst,
        igst: quote.igst,
        round_off: quote.round_off,
        total_amount: quote.total_amount,
        payment_status: 'unpaid',
        paid_amount: 0,
        notes: `Converted from Quotation ${quote.quotation_no}. ${quote.notes || ''}`.trim(),
        created_by: user?.full_name || user?.email || 'Staff',
        created_at: now,
        updated_at: now,
      };

      const invItems: InvoiceItem[] = items.map((it) => ({
        id: generateUUID(),
        invoice_id: invId,
        product_id: it.product_id,
        product_code: it.product_code,
        product_name: it.product_name,
        brand: it.brand,
        hsn_code: it.hsn_code || '3604',
        unit: it.unit,
        qty: it.qty,
        unit_price: it.unit_price,
        discount_percent: it.discount_percent,
        taxable_value: it.taxable_value,
        line_total: it.line_total,
      }));

      await db.transaction('rw', [db.quotations, db.invoices, db.invoice_items, db.activity_logs], async () => {
        await db.invoices.add(invRecord);
        await db.invoice_items.bulkAdd(invItems);
        await db.quotations.update(quote.id, {
          status: 'converted',
          converted_to: 'invoice',
          converted_id: invNo,
          updated_at: now,
        });
        await db.activity_logs.add({
          id: Date.now(),
          action: 'convert_quotation_to_invoice',
          entity: 'quotations',
          entity_id: quote.id,
          summary: `Quotation ${quote.quotation_no} converted to Tax Invoice ${invNo}`,
          created_at: now,
        });
      });

      await db.outbox.add({
        id: generateUUID(),
        entity: 'invoices',
        op: 'insert',
        payload: { ...invRecord, items: invItems },
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      const updatedQuoteAfterInv = await db.quotations.get(quote.id);
      if (updatedQuoteAfterInv) {
        await db.outbox.add({
          id: generateUUID(),
          entity: 'quotations',
          op: 'update',
          payload: updatedQuoteAfterInv,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
      }
      syncService.triggerSync();

      toast(`Successfully converted ${quote.quotation_no} to Tax Invoice ${invNo}!`, 'success');
      await loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to convert to Invoice', 'error');
    }
  };

  // Delete Quotation
  const handleDeleteQuotation = async (quote: Quotation) => {
    const confirmDel = window.confirm(`Permanently delete quotation ${quote.quotation_no}? This cannot be undone.`);
    if (!confirmDel) return;

    try {
      await db.transaction('rw', [db.quotations, db.quotation_items, db.activity_logs], async () => {
        await db.quotation_items.where('quotation_id').equals(quote.id).delete();
        await db.quotations.delete(quote.id);
        await db.activity_logs.add({
          id: Date.now(),
          action: 'delete_quotation',
          entity: 'quotations',
          entity_id: quote.id,
          summary: `Deleted quotation ${quote.quotation_no}`,
          created_at: new Date().toISOString(),
        });
      });

      await db.outbox.add({
        id: generateUUID(),
        entity: 'quotations',
        op: 'delete',
        payload: { id: quote.id },
        status: 'pending',
        attempts: 0,
        created_at: new Date().toISOString(),
      });
      syncService.triggerSync();

      toast(`Quotation ${quote.quotation_no} deleted`, 'info');
      await loadData();
    } catch (err: any) {
      toast(err?.message || 'Failed to delete quotation', 'error');
    }
  };

  // Filtered Quotations
  const filteredQuotations = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return quotations.filter((q) => {
      const qStatus = q.status === 'sent' && q.valid_until < todayStr ? 'expired' : q.status;

      if (statusFilter !== 'all') {
        if (statusFilter === 'expired') {
          if (qStatus !== 'expired') return false;
        } else if (q.status !== statusFilter) {
          return false;
        }
      }

      if (pricingFilter !== 'all' && q.pricing_type !== pricingFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesNo = q.quotation_no.toLowerCase().includes(query);
        const matchesName = q.customer_name.toLowerCase().includes(query);
        const matchesPhone = q.customer_phone?.toLowerCase().includes(query);
        const matchesGstin = q.customer_gstin?.toLowerCase().includes(query);
        const matchesCity = q.customer_address?.toLowerCase().includes(query);
        if (!matchesNo && !matchesName && !matchesPhone && !matchesGstin && !matchesCity) {
          return false;
        }
      }

      return true;
    });
  }, [quotations, statusFilter, pricingFilter, searchQuery]);

  // Metrics Bar
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    let totalValue = 0;
    let acceptedValue = 0;
    let convertedValue = 0;
    let pendingValue = 0;
    let expiredCount = 0;

    for (const q of quotations) {
      totalValue += q.total_amount;
      const isExpired = q.valid_until < todayStr && q.status !== 'accepted' && q.status !== 'converted';

      if (q.status === 'accepted') {
        acceptedValue += q.total_amount;
      } else if (q.status === 'converted') {
        convertedValue += q.total_amount;
      } else if (q.status === 'draft' || q.status === 'sent') {
        if (isExpired) {
          expiredCount++;
        } else {
          pendingValue += q.total_amount;
        }
      }
    }

    const wonValue = acceptedValue + convertedValue;
    const winRate = totalValue > 0 ? Math.round((wonValue / totalValue) * 100) : 0;

    return {
      totalCount: quotations.length,
      totalValue,
      wonValue,
      winRate,
      pendingValue,
      expiredCount,
    };
  }, [quotations]);

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-text tracking-tight flex items-center gap-2">
            <FileText className="text-accent" size={24} />
            Quotations &amp; Estimations
          </h1>
          <p className="text-xs text-text-muted">
            Formal price estimations, seasonal bulk quotes, and 1-click conversion to Sale Orders or Tax Invoices
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <Button variant="secondary" size="sm" onClick={loadData} className="gap-1 text-xs">
            <RotateCcw size={14} />
            <span>Refresh</span>
          </Button>
          <Button variant="primary" size="sm" onClick={handleOpenCreate} className="gap-1.5 font-bold shadow-xs">
            <Plus size={16} />
            <span>New Quotation</span>
          </Button>
        </div>
      </div>

      {/* KPI Highlight Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface p-3.5 rounded border border-border flex items-center gap-3">
          <div className="p-2.5 rounded bg-accent/10 text-accent">
            <FileText size={22} />
          </div>
          <div>
            <span className="text-[11px] text-text-muted uppercase font-semibold">Total Quoted</span>
            <div className="text-lg sm:text-xl font-bold font-mono text-text">{formatINR(stats.totalValue)}</div>
            <span className="text-[10px] text-text-muted">{stats.totalCount} Quotations Created</span>
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded border border-border flex items-center gap-3">
          <div className="p-2.5 rounded bg-success/10 text-success">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span className="text-[11px] text-text-muted uppercase font-semibold">Accepted / Won</span>
            <div className="text-lg sm:text-xl font-bold font-mono text-success">{formatINR(stats.wonValue)}</div>
            <span className="text-[10px] text-success font-semibold">{stats.winRate}% Conversion Rate</span>
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded border border-border flex items-center gap-3">
          <div className="p-2.5 rounded bg-blue-500/10 text-blue-500">
            <Clock size={22} />
          </div>
          <div>
            <span className="text-[11px] text-text-muted uppercase font-semibold">Active Pending</span>
            <div className="text-lg sm:text-xl font-bold font-mono text-blue-500">{formatINR(stats.pendingValue)}</div>
            <span className="text-[10px] text-text-muted">Awaiting Customer Confirmation</span>
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded border border-border flex items-center gap-3">
          <div className="p-2.5 rounded bg-danger/10 text-danger">
            <AlertCircle size={22} />
          </div>
          <div>
            <span className="text-[11px] text-text-muted uppercase font-semibold">Expired / Stale</span>
            <div className="text-lg sm:text-xl font-bold font-mono text-danger">{stats.expiredCount}</div>
            <span className="text-[10px] text-danger font-semibold">Past Validity Period</span>
          </div>
        </div>
      </div>

      {/* Action / Search Toolbar */}
      <div className="bg-surface p-3 rounded border border-border flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Quote No, Customer, Phone, City, GSTIN..."
              className="pl-9 text-xs"
            />
          </div>

          <div className="w-full sm:w-44">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent to Client' },
                { value: 'accepted', label: 'Accepted by Client' },
                { value: 'converted', label: 'Converted (SO/Inv)' },
                { value: 'expired', label: 'Expired Quotes' },
                { value: 'rejected', label: 'Rejected' },
              ]}
              className="text-xs"
            />
          </div>

          <div className="w-full sm:w-40">
            <Select
              value={pricingFilter}
              onChange={(e) => setPricingFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Pricing Modes' },
                { value: 'wholesale', label: 'Wholesale Mode' },
                { value: 'retail', label: 'Retail Mode' },
              ]}
              className="text-xs"
            />
          </div>
        </div>
      </div>

      {/* Quotations Table */}
      <div className="bg-surface rounded border border-border overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : filteredQuotations.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} />}
            message={
              searchQuery || statusFilter !== 'all' || pricingFilter !== 'all'
                ? 'No quotations match your filter criteria.'
                : 'No quotations created yet. Click "New Quotation" to draft a price quote for wholesale dealers or festival buyers.'
            }
            actionLabel="New Quotation"
            onAction={handleOpenCreate}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote No</TableHead>
                  <TableHead>Date &amp; Validity</TableHead>
                  <TableHead>Customer / Buyer</TableHead>
                  <TableHead>Rate Mode</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">GST (18%)</TableHead>
                  <TableHead className="text-right">Total (₹)</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotations.map((q) => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  const isExpired = q.valid_until < todayStr && q.status !== 'accepted' && q.status !== 'converted';
                  const gstVal = (q.cgst || 0) + (q.sgst || 0) + (q.igst || 0);

                  return (
                    <TableRow key={q.id} className="hover:bg-background/50">
                      <TableCell className="font-mono font-bold text-accent text-xs">
                        <button
                          onClick={() => handleOpenView(q)}
                          className="hover:underline text-left block font-mono"
                        >
                          {q.quotation_no}
                        </button>
                        <span className="text-[10px] text-text-muted font-normal block">
                          By: {q.created_by}
                        </span>
                      </TableCell>

                      <TableCell className="text-xs">
                        <div className="font-medium text-text">{formatDateDMY(q.quotation_date)}</div>
                        <div className="text-[10px] flex items-center gap-1 mt-0.5">
                          <span className="text-text-muted">Valid till:</span>
                          <span className={`font-semibold ${isExpired ? 'text-danger' : 'text-text'}`}>
                            {formatDateDMY(q.valid_until)}
                          </span>
                          {isExpired && (
                            <span className="px-1 py-0.2 rounded bg-danger/10 text-danger text-[9px] font-bold">
                              EXPIRED
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-xs">
                        <div className="font-bold text-text">{q.customer_name}</div>
                        {q.customer_phone && (
                          <div className="text-[10px] text-text-muted font-mono">{q.customer_phone}</div>
                        )}
                        {q.customer_gstin && (
                          <span className="inline-block px-1.5 py-0.2 rounded bg-background border border-border text-[9px] font-mono font-semibold text-text-muted mt-0.5">
                            GST: {q.customer_gstin}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-xs">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            q.pricing_type === 'wholesale'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {q.pricing_type}
                        </span>
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs text-text-muted">
                        {formatINR(q.taxable_amount)}
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs text-text-muted">
                        {formatINR(gstVal)}
                      </TableCell>

                      <TableCell className="text-right font-mono font-bold text-sm text-text">
                        {formatINR(q.total_amount)}
                      </TableCell>

                      <TableCell className="text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            q.status === 'converted'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : q.status === 'accepted'
                              ? 'bg-success/10 text-success border border-success/20'
                              : q.status === 'sent'
                              ? isExpired
                                ? 'bg-danger/10 text-danger border border-danger/20'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : q.status === 'rejected'
                              ? 'bg-danger/10 text-danger border border-danger/20'
                              : 'bg-background text-text-muted border border-border'
                          }`}
                        >
                          {q.status === 'converted' && <CheckCheck size={12} />}
                          {q.status === 'accepted' && <CheckCircle2 size={12} />}
                          {q.status === 'sent' && !isExpired && <Send size={12} />}
                          {isExpired && q.status === 'sent' && <AlertCircle size={12} />}
                          {isExpired && q.status === 'sent' ? 'EXPIRED' : q.status}
                        </span>
                        {q.converted_id && (
                          <div className="text-[10px] font-mono text-accent mt-0.5">
                            {q.converted_id}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenView(q)}
                            title="View & Print A4 Quotation"
                            className="p-1.5 h-8 w-8"
                          >
                            <Printer size={15} />
                          </Button>

                          {q.status !== 'converted' && (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenEdit(q)}
                                title="Edit Quotation"
                                className="p-1.5 h-8 w-8"
                              >
                                <Edit3 size={15} />
                              </Button>

                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleConvertToSaleOrder(q)}
                                title="Convert to Sale Order"
                                className="text-xs px-2 h-8 font-semibold text-accent gap-1"
                              >
                                <Truck size={13} />
                                <span className="hidden xl:inline">To Order</span>
                              </Button>

                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleConvertToInvoice(q)}
                                title="Convert to Tax Invoice"
                                className="text-xs px-2 h-8 font-semibold text-success gap-1"
                              >
                                <FileText size={13} />
                                <span className="hidden xl:inline">To Invoice</span>
                              </Button>
                            </>
                          )}

                          {isAdminOrManager && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteQuotation(q)}
                              title="Delete Quotation"
                              className="p-1.5 h-8 w-8 text-danger hover:text-danger"
                            >
                              <Trash2 size={15} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT QUOTATION MODAL */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={editingQuoteId ? `Edit Quotation ${quoteNo}` : `New Formal Quotation (${quoteNo})`}
        maxWidth="xl"
      >
        <div className="space-y-4 max-h-[82vh] overflow-y-auto pr-1">
          {/* Header row: Number, Date, Validity */}
          <div className="p-3 bg-surface border border-border rounded grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-text mb-1">Quotation No</label>
              <Input value={quoteNo} readOnly className="font-mono font-bold bg-background text-accent" />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text mb-1">Quotation Date</label>
              <Input
                type="date"
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[11px] font-semibold text-text">Valid Until Date</label>
                <div className="flex gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => applyValidityPreset(7)}
                    className="text-accent hover:underline font-bold"
                  >
                    +7D
                  </button>
                  <span className="text-text-muted">•</span>
                  <button
                    type="button"
                    onClick={() => applyValidityPreset(15)}
                    className="text-accent hover:underline font-bold"
                  >
                    +15D
                  </button>
                  <span className="text-text-muted">•</span>
                  <button
                    type="button"
                    onClick={() => applyValidityPreset(30)}
                    className="text-accent hover:underline font-bold"
                  >
                    +30D
                  </button>
                </div>
              </div>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Customer / Client Selection */}
          <div className="p-3 bg-surface border border-border rounded space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-text flex items-center gap-1.5">
                <FileText size={14} className="text-accent" />
                Customer / Consignee Details
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted">Rate Tier:</span>
                <div className="flex rounded border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleSwitchPricingType('wholesale')}
                    className={`px-3 py-1 text-xs font-bold transition-colors ${
                      pricingType === 'wholesale'
                        ? 'bg-purple-600 text-white'
                        : 'bg-background text-text-muted hover:text-text'
                    }`}
                  >
                    Wholesale Rates
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchPricingType('retail')}
                    className={`px-3 py-1 text-xs font-bold transition-colors ${
                      pricingType === 'retail'
                        ? 'bg-blue-600 text-white'
                        : 'bg-background text-text-muted hover:text-text'
                    }`}
                  >
                    Retail Rates
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-text mb-1">
                  Select Existing Client (Optional)
                </label>
                <Select
                  value={selectedClientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  options={[
                    { value: '', label: '-- Select Client / Wholesale Dealer / Store --' },
                    ...clients.map((c) => ({
                      value: c.id,
                      label: `${c.name} ${c.company_name ? `(${c.company_name})` : ''} - ${c.phone}`,
                    })),
                  ]}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">Customer / Firm Name *</label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Sri Balaji Crackers"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">Phone Number</label>
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. 9845012345"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-text mb-1">Delivery / Billing Address</label>
                <Input
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="City, District, State, Pincode"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">Customer GSTIN (If B2B)</label>
                <Input
                  value={customerGstin}
                  onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 29AAAAA0000A1Z5"
                  className="font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">Tax Mode</label>
                <Select
                  value={taxMode}
                  onChange={(e) => setTaxMode(e.target.value as 'intra' | 'inter')}
                  options={[
                    { value: 'intra', label: 'Intra-State: CGST 9% + SGST 9% (TN)' },
                    { value: 'inter', label: 'Inter-State: IGST 18% (KA/AP/KL)' },
                  ]}
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          {/* Item Selector & Table */}
          <div className="p-3 bg-surface border border-border rounded space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <span className="text-xs font-bold uppercase text-text flex items-center gap-1.5">
                <Layers size={14} className="text-accent" />
                <span>Fireworks Items ({quoteItems.length})</span>
              </span>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddCustomItem}
                  className="text-xs shrink-0"
                >
                  <Plus size={14} className="mr-1" />
                  Custom Row
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setIsQuickProductOpen(true)}
                  className="text-xs shrink-0 font-semibold gap-1"
                >
                  <Plus size={13} />
                  <span>Create &amp; Save to Catalog</span>
                </Button>
              </div>
            </div>

            {/* Search Option & Product Select Box Bar */}
            <div className="bg-background p-2.5 border border-border rounded-md shadow-xs">
              <label className="block text-[11px] font-bold text-text mb-1 uppercase tracking-wider flex items-center gap-1">
                <Search size={13} className="text-accent" />
                <span>Search &amp; Add Cracker From Catalog</span>
              </label>
              <ProductSearchAddBar
                products={products}
                pricingType={pricingType}
                onSelectProduct={(p) => handleAddItem(p.id)}
                onAddCustomProduct={handleAddCustomProductWithName}
                placeholder="Type cracker name, code, brand (e.g. 1000 Wala, 50 Shots, Standard) to search and add to quote..."
              />
            </div>

            {quoteItems.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded text-text-muted text-xs">
                No items added yet. Search crackers above or click "Custom Row" to build the quote.
              </div>
            ) : (
              <div className="overflow-x-auto border border-border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-background border-b border-border text-text-muted font-bold">
                    <tr>
                      <th className="p-2 text-left w-8">#</th>
                      <th className="p-2 text-left">Cracker Item</th>
                      <th className="p-2 text-left w-24">Brand</th>
                      <th className="p-2 text-center w-16">HSN</th>
                      <th className="p-2 text-center w-16">Unit</th>
                      <th className="p-2 text-right w-20">Qty</th>
                      <th className="p-2 text-right w-24">Rate (₹)</th>
                      <th className="p-2 text-right w-16">Disc %</th>
                      <th className="p-2 text-right w-24">Taxable (₹)</th>
                      <th className="p-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {quoteItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-background/40">
                        <td className="p-2 text-text-muted text-center font-mono">{idx + 1}</td>
                        <td className="p-2 min-w-[200px]">
                          {item.product_id ? (
                            <div className="flex items-center gap-1.5">
                              <SearchableProductSelect
                                products={products}
                                value={item.product_id}
                                pricingType={pricingType}
                                onChange={(prodId) => {
                                  const prod = products.find((p) => p.id === prodId);
                                  if (prod) {
                                    handleUpdateItem(idx, 'product_name', prod.name);
                                    handleUpdateItem(idx, 'brand', prod.brand || 'Standard');
                                    handleUpdateItem(idx, 'unit', prod.unit || 'box');
                                    const newPrice =
                                      pricingType === 'wholesale' && prod.wholesale_price
                                        ? prod.wholesale_price
                                        : prod.price;
                                    handleUpdateItem(idx, 'unit_price', newPrice);
                                    const next = [...quoteItems];
                                    next[idx].product_id = prod.id;
                                    next[idx].product_code = prod.code;
                                    setQuoteItems(next);
                                  }
                                }}
                                onCustomSelect={() => {
                                  const next = [...quoteItems];
                                  next[idx].product_id = undefined;
                                  setQuoteItems(next);
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...quoteItems];
                                  next[idx].product_id = undefined;
                                  setQuoteItems(next);
                                }}
                                className="text-[10px] text-accent font-semibold px-2 py-1.5 rounded bg-accent/10 hover:bg-accent/20 whitespace-nowrap shrink-0"
                                title="Switch to custom text input"
                              >
                                Custom
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={item.product_name}
                                onChange={(e) => handleUpdateItem(idx, 'product_name', e.target.value)}
                                placeholder="Enter custom cracker name..."
                                className="text-xs h-7 font-medium"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (products.length > 0) {
                                    const next = [...quoteItems];
                                    next[idx].product_id = products[0].id;
                                    next[idx].product_code = products[0].code;
                                    next[idx].product_name = products[0].name;
                                    next[idx].brand = products[0].brand || 'Standard';
                                    next[idx].unit = products[0].unit || 'box';
                                    const price =
                                      pricingType === 'wholesale' && products[0].wholesale_price
                                        ? products[0].wholesale_price
                                        : products[0].price;
                                    next[idx].unit_price = price;
                                    setQuoteItems(next);
                                  }
                                }}
                                className="text-[10px] text-text-muted hover:text-text px-2 py-1 rounded border border-border whitespace-nowrap"
                                title="Switch to catalog picker"
                              >
                                Catalog
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          <Input
                            value={item.brand}
                            onChange={(e) => handleUpdateItem(idx, 'brand', e.target.value)}
                            className="text-xs h-7"
                          />
                        </td>
                        <td className="p-2 text-center font-mono">
                          <Input
                            value={item.hsn_code}
                            onChange={(e) => handleUpdateItem(idx, 'hsn_code', e.target.value)}
                            className="text-xs h-7 text-center font-mono"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <Input
                            value={item.unit}
                            onChange={(e) => handleUpdateItem(idx, 'unit', e.target.value)}
                            className="text-xs h-7 text-center"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleUpdateItem(idx, 'qty', e.target.value)}
                            className="text-xs h-7 text-right font-mono font-bold"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => handleUpdateItem(idx, 'unit_price', e.target.value)}
                            className="text-xs h-7 text-right font-mono"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={item.discount_percent}
                            onChange={(e) => handleUpdateItem(idx, 'discount_percent', e.target.value)}
                            className="text-xs h-7 text-right font-mono"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-text">
                          {formatINR(item.taxable_value)}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-danger hover:text-danger/80 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Calculation & Terms */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Terms and Conditions */}
            <div className="p-3 bg-surface border border-border rounded space-y-2 text-xs">
              <span className="font-bold uppercase text-[11px] text-text block">
                Standard Crackers Terms &amp; Conditions
              </span>
              <textarea
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
                rows={7}
                className="w-full text-[11px] p-2 bg-background border border-border rounded text-text font-mono leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-accent"
              />

              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-text mb-1">
                  Special Notes / Delivery Remarks
                </label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Price includes loading at Hosur godown; lorry freight extra"
                  className="text-xs"
                />
              </div>
            </div>

            {/* Totals Summary */}
            <div className="p-3 bg-surface border border-border rounded space-y-2 text-xs">
              <span className="font-bold uppercase text-[11px] text-text block">
                Quotation Financial Summary
              </span>

              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between py-0.5 text-text-muted">
                  <span>Gross Subtotal:</span>
                  <span className="font-mono">{formatINR(calculations.subtotal)}</span>
                </div>

                {calculations.totalDiscount > 0 && (
                  <div className="flex justify-between py-0.5 text-success font-semibold">
                    <span>Discount Allowed:</span>
                    <span className="font-mono">- {formatINR(calculations.totalDiscount)}</span>
                  </div>
                )}

                <div className="flex justify-between py-0.5 border-t border-border font-medium text-text">
                  <span>Taxable Amount:</span>
                  <span className="font-mono">{formatINR(calculations.taxableAmount)}</span>
                </div>

                {taxMode === 'intra' ? (
                  <>
                    <div className="flex justify-between py-0.5 text-text-muted">
                      <span>CGST (9%):</span>
                      <span className="font-mono">{formatINR(calculations.cgst)}</span>
                    </div>
                    <div className="flex justify-between py-0.5 text-text-muted">
                      <span>SGST (9%):</span>
                      <span className="font-mono">{formatINR(calculations.sgst)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between py-0.5 text-text-muted">
                    <span>IGST (18%):</span>
                    <span className="font-mono">{formatINR(calculations.igst)}</span>
                  </div>
                )}

                {calculations.roundOff !== 0 && (
                  <div className="flex justify-between py-0.5 text-text-muted">
                    <span>Round Off:</span>
                    <span className="font-mono">
                      {calculations.roundOff > 0 ? `+${calculations.roundOff}` : calculations.roundOff}
                    </span>
                  </div>
                )}

                <div className="flex justify-between py-2 border-t border-border font-bold text-base text-accent">
                  <span>Total Quotation Amount:</span>
                  <span className="font-mono text-lg">{formatINR(calculations.totalAmount)}</span>
                </div>

                <div className="p-2 bg-background border border-border rounded text-[11px] text-text-muted">
                  <span className="font-bold text-text uppercase block text-[10px]">In Words:</span>
                  <div className="font-medium text-text italic mt-0.5">
                    {numberToWordsINR(calculations.totalAmount)}
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-[11px] font-semibold text-text mb-1">Quotation Status</label>
                  <Select
                    value={quoteStatus}
                    onChange={(e) => setQuoteStatus(e.target.value as QuotationStatus)}
                    options={[
                      { value: 'draft', label: 'Draft (Internal Review)' },
                      { value: 'sent', label: 'Sent to Customer' },
                      { value: 'accepted', label: 'Accepted by Customer' },
                      { value: 'rejected', label: 'Rejected' },
                    ]}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveQuotation} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingQuoteId ? 'Update Quotation' : 'Save Quotation'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* VIEW & PRINT FORMAL A4 MODAL */}
      {selectedQuote && (
        <Dialog
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          title={`Formal Price Quotation - ${selectedQuote.quotation_no}`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            {/* Print Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface border border-border rounded text-xs print:hidden">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-text">
                  <input
                    type="checkbox"
                    checked={includeBankDetails}
                    onChange={(e) => setIncludeBankDetails(e.target.checked)}
                    className="rounded text-accent"
                  />
                  <span>Include Bank Advance Details</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-text">
                  <input
                    type="checkbox"
                    checked={includeTerms}
                    onChange={(e) => setIncludeTerms(e.target.checked)}
                    className="rounded text-accent"
                  />
                  <span>Include Crackers Terms</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                {selectedQuote.status !== 'converted' && (
                  <>
                    <div className="flex items-center gap-1 mr-1">
                      <span className="text-[11px] text-text-muted">Status:</span>
                      <select
                        value={selectedQuote.status}
                        onChange={(e) => handleUpdateStatus(selectedQuote, e.target.value as QuotationStatus)}
                        className="px-2 py-1 text-xs rounded border border-border bg-background text-text font-semibold uppercase"
                      >
                        <option value="draft">Draft</option>
                        <option value="sent">Sent</option>
                        <option value="accepted">Accepted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleConvertToSaleOrder(selectedQuote)}
                      className="gap-1 font-semibold text-accent text-xs"
                    >
                      <Truck size={14} />
                      <span>Convert to Order</span>
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleConvertToInvoice(selectedQuote)}
                      className="gap-1 font-semibold text-success text-xs"
                    >
                      <FileText size={14} />
                      <span>Convert to Invoice</span>
                    </Button>
                  </>
                )}

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="gap-1.5 font-bold shadow-xs text-xs"
                >
                  <Printer size={15} />
                  <span>{isPrinting ? 'Printing...' : 'Print A4 Quotation'}</span>
                </Button>
              </div>
            </div>

            {/* Printable Document Container */}
            <div id="quotation-print-area" className="printable-area">
              <div className="p-4 bg-white text-gray-900 border border-gray-300 rounded shadow-xs space-y-4 print:p-0 print:border-none print:shadow-none text-xs">
                {/* Header Section */}
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-3">
                  <div>
                    <VnaLogo size="md" />
                    <div className="font-extrabold text-base uppercase text-gray-900 mt-1">
                      VNA TRADERS
                    </div>
                    <div className="text-[11px] text-gray-600 leading-tight">
                      Wholesale &amp; Retail Fireworks Merchant<br />
                      Jeermangalam, Hosur, Krishnagiri Dist, Tamil Nadu - 635109<br />
                      Phone: +91 94431 23456 / +91 94432 98765<br />
                      <strong>GSTIN: 33ACSPV5299F1Z5</strong> • State Code: 33 (Tamil Nadu)
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="px-3 py-1 rounded bg-gray-100 border border-gray-300 text-gray-800 font-bold text-xs uppercase tracking-wider inline-block">
                      PRICE ESTIMATION / QUOTATION
                    </span>
                    <div className="text-lg font-black font-mono text-gray-900 mt-1">
                      {selectedQuote.quotation_no}
                    </div>
                    <div className="text-xs text-gray-600">
                      Date: <strong>{formatDateDMY(selectedQuote.quotation_date)}</strong>
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      Valid Until: <strong className="text-red-700">{formatDateDMY(selectedQuote.valid_until)}</strong>
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase font-semibold mt-0.5">
                      Mode: {selectedQuote.pricing_type} Pricing
                    </div>
                  </div>
                </div>

                {/* Quoted To Section */}
                <div className="grid grid-cols-2 gap-4 border border-gray-300 p-2.5 rounded text-xs">
                  <div>
                    <span className="text-gray-500 font-bold uppercase text-[10px] block">
                      Quotation Prepared For (Customer):
                    </span>
                    <div className="font-extrabold text-sm text-gray-900 mt-0.5">
                      {selectedQuote.customer_name}
                    </div>
                    {selectedQuote.customer_address && (
                      <div className="text-gray-700">{selectedQuote.customer_address}</div>
                    )}
                    {selectedQuote.customer_phone && (
                      <div className="text-gray-700">Phone: {selectedQuote.customer_phone}</div>
                    )}
                    {selectedQuote.customer_gstin ? (
                      <div className="font-mono font-bold text-gray-900 mt-0.5">
                        GSTIN: {selectedQuote.customer_gstin}
                      </div>
                    ) : (
                      <div className="text-gray-500 italic">Retail / Consumer Quotation</div>
                    )}
                  </div>

                  <div className="border-l border-gray-300 pl-3 space-y-1">
                    <span className="text-gray-500 font-bold uppercase text-[10px] block">
                      Quotation Reference:
                    </span>
                    <div>
                      Prepared By: <strong>{selectedQuote.created_by}</strong>
                    </div>
                    <div>
                      Rate Basis: <strong className="uppercase">{selectedQuote.pricing_type} Rate Mode</strong>
                    </div>
                    <div>
                      Tax Classification: <strong>HSN 3604 (18% GST Applicable)</strong>
                    </div>
                    {selectedQuote.status === 'converted' && selectedQuote.converted_id && (
                      <div className="text-purple-700 font-bold">
                        Converted To: {selectedQuote.converted_id}
                      </div>
                    )}
                  </div>
                </div>

                {/* Itemized Goods Table */}
                <div className="border border-gray-300 rounded overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 border-b border-gray-300 font-bold text-gray-700">
                      <tr>
                        <th className="p-2 text-left w-8">#</th>
                        <th className="p-2 text-left">Description of Fireworks</th>
                        <th className="p-2 text-left w-20">Brand</th>
                        <th className="p-2 text-center w-16">HSN</th>
                        <th className="p-2 text-right w-16">Qty</th>
                        <th className="p-2 text-right w-20">Rate (₹)</th>
                        <th className="p-2 text-right w-16">Disc %</th>
                        <th className="p-2 text-right w-24">Taxable (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedQuoteItems.map((item, idx) => (
                        <tr key={item.id}>
                          <td className="p-2 text-gray-500">{idx + 1}</td>
                          <td className="p-2 font-bold text-gray-900">{item.product_name}</td>
                          <td className="p-2 text-gray-600">{item.brand || 'Standard'}</td>
                          <td className="p-2 text-center font-mono text-gray-600">{item.hsn_code || '3604'}</td>
                          <td className="p-2 text-right font-mono font-bold">
                            {item.qty} {item.unit}
                          </td>
                          <td className="p-2 text-right font-mono">{formatINR(item.unit_price)}</td>
                          <td className="p-2 text-right font-mono text-gray-500">
                            {item.discount_percent ? `${item.discount_percent}%` : '-'}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-gray-900">
                            {formatINR(item.taxable_value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Financial Summary & Bank Details */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Left Column: Bank Details & Amount in words */}
                  <div className="space-y-3">
                    {includeBankDetails && (
                      <div className="p-2.5 bg-gray-50 border border-gray-300 rounded text-[11px] leading-tight space-y-1">
                        <span className="font-bold text-gray-800 uppercase block">
                          Bank Details for Advance Booking / Payment:
                        </span>
                        <div>Bank Name: <strong>State Bank of India (SBI)</strong></div>
                        <div>Account Name: <strong>VNA TRADERS</strong></div>
                        <div>Account Number: <strong className="font-mono">3948201004521</strong></div>
                        <div>IFSC Code: <strong className="font-mono">SBIN0001234</strong> (Hosur Branch)</div>
                        <div className="text-gray-500 italic mt-0.5">
                          Kindly share transaction UTR / receipt after transfer.
                        </div>
                      </div>
                    )}

                    <div className="p-2 bg-gray-50 border border-gray-300 rounded text-xs">
                      <span className="text-gray-500 text-[10px] uppercase font-bold block">
                        Estimated Amount In Words:
                      </span>
                      <div className="font-bold text-gray-900 mt-0.5">
                        {numberToWordsINR(selectedQuote.total_amount)}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Calculations */}
                  <div className="border border-gray-300 rounded overflow-hidden text-xs">
                    <table className="w-full">
                      <tbody className="divide-y divide-gray-200">
                        <tr>
                          <td className="p-2 text-gray-600">Gross Subtotal:</td>
                          <td className="p-2 text-right font-mono">{formatINR(selectedQuote.subtotal)}</td>
                        </tr>
                        {selectedQuote.discount_amount > 0 && (
                          <tr>
                            <td className="p-2 text-green-700 font-semibold">Total Discount:</td>
                            <td className="p-2 text-right font-mono text-green-700">
                              - {formatINR(selectedQuote.discount_amount)}
                            </td>
                          </tr>
                        )}
                        <tr className="bg-gray-50 font-medium">
                          <td className="p-2">Taxable Value:</td>
                          <td className="p-2 text-right font-mono font-bold">
                            {formatINR(selectedQuote.taxable_amount)}
                          </td>
                        </tr>
                        {selectedQuote.igst > 0 ? (
                          <tr>
                            <td className="p-2 text-gray-600">IGST (18%):</td>
                            <td className="p-2 text-right font-mono">{formatINR(selectedQuote.igst)}</td>
                          </tr>
                        ) : (
                          <>
                            <tr>
                              <td className="p-2 text-gray-600">CGST (9%):</td>
                              <td className="p-2 text-right font-mono">{formatINR(selectedQuote.cgst)}</td>
                            </tr>
                            <tr>
                              <td className="p-2 text-gray-600">SGST (9%):</td>
                              <td className="p-2 text-right font-mono">{formatINR(selectedQuote.sgst)}</td>
                            </tr>
                          </>
                        )}
                        {selectedQuote.round_off !== 0 && (
                          <tr>
                            <td className="p-2 text-gray-600">Round Off:</td>
                            <td className="p-2 text-right font-mono">
                              {selectedQuote.round_off > 0 ? `+${selectedQuote.round_off}` : selectedQuote.round_off}
                            </td>
                          </tr>
                        )}
                        <tr className="bg-gray-100 font-extrabold text-sm border-t-2 border-gray-800">
                          <td className="p-2.5">Grand Total (₹):</td>
                          <td className="p-2.5 text-right font-mono text-base text-gray-900">
                            {formatINR(selectedQuote.total_amount)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Terms and Conditions Block */}
                {includeTerms && (
                  <div className="border border-gray-300 p-2.5 rounded bg-gray-50 text-[10px] space-y-1">
                    <span className="font-bold text-gray-800 uppercase block">
                      Terms &amp; Conditions:
                    </span>
                    <div className="text-gray-700 whitespace-pre-line leading-relaxed font-sans">
                      {selectedQuote.terms_and_conditions || DEFAULT_QUOTATION_TERMS}
                    </div>
                  </div>
                )}

                {/* Signatures Row */}
                <div className="pt-6 border-t border-gray-300 grid grid-cols-3 gap-6 text-center text-xs">
                  <div>
                    <div className="h-10 border-b border-gray-400"></div>
                    <div className="font-bold text-gray-800 mt-1">Prepared By</div>
                    <div className="text-[10px] text-gray-500">{selectedQuote.created_by}</div>
                  </div>

                  <div>
                    <div className="h-10 border-b border-gray-400"></div>
                    <div className="font-bold text-gray-800 mt-1">Customer Acceptance</div>
                    <div className="text-[10px] text-gray-500">Signature with Stamp</div>
                  </div>

                  <div>
                    <div className="h-10 border-b border-gray-400"></div>
                    <div className="font-bold text-gray-800 mt-1">For VNA TRADERS</div>
                    <div className="text-[10px] text-gray-500">Authorized Signatory</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* QUICK CREATE PRODUCT MODAL */}
      <QuickProductModal
        isOpen={isQuickProductOpen}
        onClose={() => setIsQuickProductOpen(false)}
        pricingType={pricingType}
        defaultQty={1}
        title="Add New Cracker to Quote & Catalog"
        subtitle="Add a newly introduced cracker or gift box directly into this quotation and optionally save it to the product catalog."
        onAddProduct={(item) => {
          const price =
            pricingType === 'wholesale'
              ? item.wholesalePrice || item.retailPrice || 0
              : item.retailPrice || item.wholesalePrice || 0;

          const gross = item.qty * price;
          setQuoteItems((prev) => [
            ...prev,
            {
              id: generateUUID(),
              product_id: item.productId,
              product_code: item.productCode,
              product_name: item.productName,
              brand: item.brand,
              hsn_code: '3604',
              unit: item.unit,
              qty: item.qty,
              unit_price: price,
              discount_percent: 0,
              taxable_value: gross,
              line_total: gross,
            },
          ]);

          if (item.productId) {
            setProducts((prev) => [
              ...prev,
              {
                id: item.productId!,
                code: item.productCode,
                name: item.productName,
                category: item.category,
                brand: item.brand,
                unit: item.unit,
                price: item.retailPrice,
                wholesale_price: item.wholesalePrice,
                stock: 0,
                is_active: true,
              },
            ]);
          }
        }}
      />
    </div>
  );
};
