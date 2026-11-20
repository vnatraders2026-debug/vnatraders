import React, { useState, useEffect, useMemo } from 'react';
import { db, generateNextInvoiceNo } from '@/db';
import { syncService } from '@/sync/syncService';
import { Invoice, InvoiceItem, Product, Client, SaleOrder, PricingType, InvoicePaymentStatus, PaymentMode } from '@/types';
import { formatINR, numberToWordsINR, formatDateDMY } from '@/lib/format';
import { generateUUID } from '@/lib/uuid';
import { printFormattedElement } from '@/lib/printer/printService';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { SearchableProductSelect, ProductSearchAddBar } from '@/components/ui/ProductSelectBox';
import { BrandDiscountsSection, calculateBrandWiseTotals } from '@/components/BrandDiscountsSection';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import { VnaLogo } from '@/components/VnaLogo';
import {
  FileText,
  Receipt,
  Search,
  Plus,
  Printer,
  CreditCard,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Truck,
  IndianRupee,
  Layers,
} from 'lucide-react';

export const InvoicesPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saleOrders, setSaleOrders] = useState<SaleOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pricingFilter, setPricingFilter] = useState<string>('all');

  // Create Invoice Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [invNo, setInvNo] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSoId, setSelectedSoId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [pricingType, setPricingType] = useState<PricingType>('wholesale');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [taxMode, setTaxMode] = useState<'intra' | 'inter'>('intra'); // intra = CGST+SGST (9%+9%), inter = IGST (18%)
  const [transportName, setTransportName] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [initialPaymentStatus, setInitialPaymentStatus] = useState<InvoicePaymentStatus>('unpaid');
  const [initialPaidAmount, setInitialPaidAmount] = useState<number>(0);
  const [initialPaymentMode, setInitialPaymentMode] = useState<PaymentMode>('cash');

  const [invItems, setInvItems] = useState<Array<{
    product_id: string;
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
  }>>([]);
  const [brandDiscounts, setBrandDiscounts] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  // View / Print Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<InvoiceItem[]>([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [printCopy, setPrintCopy] = useState<'original' | 'duplicate' | 'triplicate'>('original');
  const [printPaperSize, setPrintPaperSize] = useState<'a4' | '80mm'>('a4');
  const [isPrinting, setIsPrinting] = useState(false);

  // Payment Record Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmountToAdd, setPaymentAmountToAdd] = useState<number>(0);
  const [paymentModeInput, setPaymentModeInput] = useState<PaymentMode>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const allInvoices = await db.invoices.reverse().sortBy('created_at');
      setInvoices(allInvoices);

      const allClients = await db.clients.toArray();
      setClients(allClients);

      const allProds = await db.products.toArray();
      setProducts(allProds.filter((p) => p.is_active));

      const allSos = await db.sale_orders.reverse().sortBy('created_at');
      setSaleOrders(allSos);
    } catch (err: any) {
      toast(`Failed to load invoices: ${err?.message || 'Error'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleSync = () => {
      loadData();
    };

    window.addEventListener('invoices-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('invoices-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, []);

  // Open Create Modal
  const handleOpenCreate = async () => {
    const nextNo = await generateNextInvoiceNo();
    setInvNo(nextNo);
    setSelectedClientId('');
    setSelectedSoId('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerGstin('');
    setPricingType('wholesale');
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setDueDate('');
    setTaxMode('intra');
    setTransportName('');
    setLrNumber('');
    setVehicleNumber('');
    setNotes('');
    setBrandDiscounts({});
    setInitialPaymentStatus('unpaid');
    setInitialPaidAmount(0);
    setInitialPaymentMode('cash');

    setInvItems([
      {
        product_id: '',
        product_code: '',
        product_name: '',
        brand: '',
        hsn_code: '3604',
        unit: 'box',
        qty: 1,
        unit_price: 0,
        discount_percent: 0,
        taxable_value: 0,
        line_total: 0,
      },
    ]);
    setIsCreateOpen(true);
  };

  // Client Selection handler
  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setCustomerName(client.name);
      setCustomerPhone(client.phone || '');
      setCustomerAddress(client.address || '');
      setCustomerGstin(client.gstin || '');
      setPricingType(client.customer_tier === 'retail' ? 'retail' : 'wholesale');

      // Auto-detect inter-state if GSTIN does NOT start with '33' (Tamil Nadu)
      if (client.gstin && client.gstin.trim().length >= 2) {
        const stateCode = client.gstin.trim().slice(0, 2);
        if (stateCode !== '33') {
          setTaxMode('inter');
        } else {
          setTaxMode('intra');
        }
      }
    }
  };

  // Populate from Sale Order
  const handleSaleOrderSelect = async (soId: string) => {
    setSelectedSoId(soId);
    if (!soId) return;

    const so = saleOrders.find((s) => s.id === soId);
    if (!so) return;

    setCustomerName(so.customer_name);
    setCustomerPhone(so.customer_phone || '');
    setCustomerAddress(so.customer_address || '');
    setCustomerGstin(so.customer_gstin || '');
    setPricingType(so.pricing_type || 'wholesale');
    setTransportName(so.transport_name || '');
    setLrNumber(so.lr_number || '');
    setVehicleNumber(so.vehicle_number || '');
    if (so.client_id) {
      setSelectedClientId(so.client_id);
    }

    if (so.customer_gstin && so.customer_gstin.trim().length >= 2) {
      const stateCode = so.customer_gstin.trim().slice(0, 2);
      if (stateCode !== '33') {
        setTaxMode('inter');
      } else {
        setTaxMode('intra');
      }
    }

    // Load SO Items
    const soDbItems = await db.sale_order_items.where('so_id').equals(soId).toArray();
    if (soDbItems.length > 0) {
      if (so.brand_discounts && Object.keys(so.brand_discounts).length > 0) {
        setBrandDiscounts(so.brand_discounts);
      } else {
        setBrandDiscounts({});
      }
      const itemsList = soDbItems.map((it) => {
        const b = it.brand || 'Standard';
        const discPct = it.discount_percent ?? so.brand_discounts?.[b] ?? 0;
        const gross = it.qty * it.unit_price;
        const disc = Math.round((gross * discPct / 100) * 100) / 100;
        const net = Math.max(0, Math.round((gross - disc) * 100) / 100);
        return {
          product_id: it.product_id || '',
          product_code: it.product_code || '',
          product_name: it.product_name,
          brand: b,
          hsn_code: '3604',
          unit: it.unit || 'box',
          qty: it.qty,
          unit_price: it.unit_price,
          discount_percent: discPct,
          taxable_value: net,
          line_total: net,
        };
      });
      setInvItems(itemsList);
    }
  };

  const handleBrandDiscountChange = (brand: string, pct: number) => {
    setBrandDiscounts((prev) => ({ ...prev, [brand]: pct }));
    setInvItems((prev) =>
      prev.map((it) => {
        if ((it.brand || 'Standard').toLowerCase() === brand.toLowerCase()) {
          const gross = it.qty * it.unit_price;
          const disc = Math.round((gross * pct / 100) * 100) / 100;
          const net = Math.max(0, Math.round((gross - disc) * 100) / 100);
          return {
            ...it,
            discount_percent: pct,
            taxable_value: net,
            line_total: net,
          };
        }
        return it;
      })
    );
  };

  // Item change helpers
  const handleProductSelect = (index: number, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    const updated = [...invItems];
    if (prod) {
      const rate = pricingType === 'wholesale' ? (prod.wholesale_price || prod.price) : prod.price;
      const qty = updated[index].qty || 1;
      const discount = updated[index].discount_percent || 0;
      const sub = qty * rate;
      const taxable = Math.round((sub - (sub * discount) / 100) * 100) / 100;

      updated[index] = {
        ...updated[index],
        product_id: prod.id,
        product_code: prod.code || '',
        product_name: prod.name,
        brand: prod.brand || 'Standard',
        hsn_code: '3604',
        unit: prod.unit || 'box',
        unit_price: rate,
        taxable_value: taxable,
        line_total: taxable,
      };
    } else {
      updated[index] = {
        ...updated[index],
        product_id: '',
        product_code: '',
        product_name: '',
        brand: '',
        hsn_code: '3604',
        unit: 'box',
        unit_price: 0,
        taxable_value: 0,
        line_total: 0,
      };
    }
    setInvItems(updated);
  };

  const handleItemFieldChange = (index: number, field: string, val: any) => {
    const updated = [...invItems];
    const current = { ...updated[index], [field]: val };

    const qty = Number(current.qty) || 0;
    const price = Number(current.unit_price) || 0;
    const discount = Number(current.discount_percent) || 0;
    const sub = qty * price;
    const taxable = Math.round(Math.max(0, sub - (sub * discount) / 100) * 100) / 100;

    current.taxable_value = taxable;
    current.line_total = taxable;
    updated[index] = current;
    setInvItems(updated);
  };

  const handleAddItemRow = () => {
    setInvItems((prev) => [
      ...prev,
      {
        product_id: '',
        product_code: '',
        product_name: '',
        brand: '',
        hsn_code: '3604',
        unit: 'box',
        qty: 1,
        unit_price: 0,
        discount_percent: 0,
        taxable_value: 0,
        line_total: 0,
      },
    ]);
  };

  const handleAddProductDirectly = (prod: Product) => {
    const rate = pricingType === 'wholesale' ? (prod.wholesale_price || prod.price) : prod.price;
    setInvItems((prev) => {
      // If table only has 1 empty item, replace it
      if (prev.length === 1 && !prev[0].product_id && !prev[0].product_name) {
        return [
          {
            product_id: prod.id,
            product_code: prod.code || '',
            product_name: prod.name,
            brand: prod.brand || 'Standard',
            hsn_code: '3604',
            unit: prod.unit || 'box',
            qty: 1,
            unit_price: rate,
            discount_percent: 0,
            taxable_value: rate,
            line_total: rate,
          },
        ];
      }

      const existingIdx = prev.findIndex((it) => it.product_id === prod.id);
      if (existingIdx !== -1) {
        const next = [...prev];
        const newQty = (Number(next[existingIdx].qty) || 0) + 1;
        const sub = newQty * next[existingIdx].unit_price;
        const disc = next[existingIdx].discount_percent || 0;
        const taxable = Math.round((sub - (sub * disc) / 100) * 100) / 100;
        next[existingIdx] = {
          ...next[existingIdx],
          qty: newQty,
          taxable_value: taxable,
          line_total: taxable,
        };
        toast(`Updated "${prod.name}" quantity to ${newQty}`, 'info');
        return next;
      }

      toast(`Added "${prod.name}" to invoice`, 'success');
      return [
        ...prev,
        {
          product_id: prod.id,
          product_code: prod.code || '',
          product_name: prod.name,
          brand: prod.brand || 'Standard',
          hsn_code: '3604',
          unit: prod.unit || 'box',
          qty: 1,
          unit_price: rate,
          discount_percent: 0,
          taxable_value: rate,
          line_total: rate,
        },
      ];
    });
  };

  const handleAddCustomProductDirectly = (name: string) => {
    setInvItems((prev) => [
      ...prev,
      {
        product_id: '',
        product_code: '',
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
    toast(`Added custom cracker "${name}"`, 'info');
  };

  const handleRemoveItemRow = (index: number) => {
    if (invItems.length <= 1) return;
    setInvItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;

    for (const it of invItems) {
      const lineSub = (Number(it.qty) || 0) * (Number(it.unit_price) || 0);
      const lineDisc = Math.round(((lineSub * (Number(it.discount_percent) || 0)) / 100) * 100) / 100;
      subtotal += lineSub;
      totalDiscount += lineDisc;
      taxableAmount += Number(it.taxable_value) || 0;
    }

    subtotal = Math.round(subtotal * 100) / 100;
    totalDiscount = Math.round(totalDiscount * 100) / 100;
    taxableAmount = Math.round(taxableAmount * 100) / 100;

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (taxMode === 'intra') {
      // 9% CGST + 9% SGST (Intra-state Tamil Nadu)
      cgst = Math.round(taxableAmount * 0.09 * 100) / 100;
      sgst = Math.round(taxableAmount * 0.09 * 100) / 100;
    } else {
      // 18% IGST (Inter-state outside TN)
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
  }, [invItems, taxMode]);

  // Save Invoice
  const handleSaveInvoice = async () => {
    if (!customerName.trim()) {
      toast('Please enter customer name', 'error');
      return;
    }

    const validItems = invItems.filter((i) => i.product_name.trim() && i.qty > 0);
    if (validItems.length === 0) {
      toast('Please add at least one cracker item with quantity > 0', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const invoiceId = generateUUID();

      let finalPaymentStatus = initialPaymentStatus;
      let finalPaid = initialPaidAmount;
      if (finalPaymentStatus === 'paid') {
        finalPaid = calculations.totalAmount;
      } else if (finalPaymentStatus === 'partial') {
        if (finalPaid <= 0) {
          finalPaid = 0;
          finalPaymentStatus = 'unpaid';
        } else if (finalPaid >= calculations.totalAmount) {
          finalPaid = calculations.totalAmount;
          finalPaymentStatus = 'paid';
        }
      } else {
        finalPaid = 0;
      }

      const invoiceRecord: Invoice = {
        id: invoiceId,
        invoice_no: invNo,
        so_id: selectedSoId || undefined,
        client_id: selectedClientId || undefined,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || undefined,
        customer_address: customerAddress.trim() || undefined,
        customer_gstin: customerGstin.trim().toUpperCase() || undefined,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        pricing_type: pricingType,
        subtotal: calculations.subtotal,
        discount_amount: calculations.totalDiscount,
        discount_percent: calculations.subtotal > 0 ? Math.round((calculations.totalDiscount / calculations.subtotal) * 10000) / 100 : 0,
        brand_discounts: brandDiscounts,
        taxable_amount: calculations.taxableAmount,
        gst_rate: 18,
        cgst: calculations.cgst,
        sgst: calculations.sgst,
        igst: calculations.igst,
        round_off: calculations.roundOff,
        total_amount: calculations.totalAmount,
        payment_status: finalPaymentStatus,
        paid_amount: finalPaid,
        payment_mode: initialPaymentMode,
        transport_name: transportName.trim() || undefined,
        lr_number: lrNumber.trim() || undefined,
        vehicle_number: vehicleNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        created_by: user?.full_name || 'Admin',
        created_at: now,
        updated_at: now,
      };

      const itemsRecords: InvoiceItem[] = validItems.map((it) => ({
        id: generateUUID(),
        invoice_id: invoiceId,
        product_id: it.product_id || undefined,
        product_code: it.product_code || undefined,
        product_name: it.product_name,
        brand: it.brand || 'Standard',
        hsn_code: it.hsn_code || '3604',
        unit: it.unit || 'box',
        qty: Number(it.qty),
        unit_price: Number(it.unit_price),
        discount_percent: Number(it.discount_percent) || 0,
        taxable_value: Number(it.taxable_value),
        line_total: Number(it.line_total),
      }));

      await db.transaction('rw', [db.invoices, db.invoice_items, db.clients], async () => {
        await db.invoices.add(invoiceRecord);
        await db.invoice_items.bulkAdd(itemsRecords);

        // Update Client outstanding balance if linked
        if (selectedClientId && finalPaymentStatus !== 'paid') {
          const client = await db.clients.get(selectedClientId);
          if (client) {
            const unpaidPart = calculations.totalAmount - finalPaid;
            const newBal = (client.current_balance || 0) + unpaidPart;
            await db.clients.update(selectedClientId, { current_balance: newBal, updated_at: now });
          }
        }
      });

      await db.outbox.add({
        id: generateUUID(),
        entity: 'invoices',
        op: 'insert',
        payload: { ...invoiceRecord, items: itemsRecords },
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      syncService.triggerSync();

      toast(`Tax Invoice ${invNo} generated successfully!`, 'success');
      setIsCreateOpen(false);
      loadData();
    } catch (err: any) {
      toast(`Failed to save invoice: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // View / Print
  const handleViewInvoice = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const items = await db.invoice_items.where('invoice_id').equals(invoice.id).toArray();
    setSelectedInvoiceItems(items);
    setPrintCopy('original');
    setPrintPaperSize('a4');
    setIsViewModalOpen(true);
  };

  const handlePrintDocument = async () => {
    if (!selectedInvoice) return;
    setIsPrinting(true);
    try {
      await printFormattedElement('invoice-print-area', {
        paperSize: printPaperSize,
        title: `Invoice_${selectedInvoice.invoice_no}`,
      });
    } catch (err: any) {
      toast(`Print notice: ${err?.message || 'Print error'}`, 'warning');
    } finally {
      setIsPrinting(false);
    }
  };

  // Payment Recording
  const handleOpenPaymentModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const balance = Math.max(0, invoice.total_amount - (invoice.paid_amount || 0));
    setPaymentAmountToAdd(balance);
    setPaymentModeInput('cash');
    setPaymentNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice) return;
    if (paymentAmountToAdd <= 0) {
      toast('Please enter a valid payment amount', 'error');
      return;
    }

    setIsRecordingPayment(true);
    try {
      const now = new Date().toISOString();
      const currentPaid = selectedInvoice.paid_amount || 0;
      const newPaid = Math.min(selectedInvoice.total_amount, currentPaid + paymentAmountToAdd);
      const newStatus: InvoicePaymentStatus = newPaid >= selectedInvoice.total_amount ? 'paid' : 'partial';

      await db.transaction('rw', [db.invoices, db.clients], async () => {
        await db.invoices.update(selectedInvoice.id, {
          paid_amount: newPaid,
          payment_status: newStatus,
          payment_mode: paymentModeInput,
          updated_at: now,
        });

        if (selectedInvoice.client_id) {
          const client = await db.clients.get(selectedInvoice.client_id);
          if (client) {
            const newBal = Math.max(0, (client.current_balance || 0) - paymentAmountToAdd);
            await db.clients.update(selectedInvoice.client_id, { current_balance: newBal, updated_at: now });
          }
        }
      });

      const updatedInv = await db.invoices.get(selectedInvoice.id);
      if (updatedInv) {
        await db.outbox.add({
          id: generateUUID(),
          entity: 'invoices',
          op: 'update',
          payload: updatedInv,
          status: 'pending',
          attempts: 0,
          created_at: now,
        });
        syncService.triggerSync();
      }

      toast(`Payment of ${formatINR(paymentAmountToAdd)} recorded for ${selectedInvoice.invoice_no}`, 'success');
      setIsPaymentModalOpen(false);
      loadData();
    } catch (err: any) {
      toast(`Failed to record payment: ${err?.message || 'Error'}`, 'error');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Delete Invoice (Admin only)
  const handleDeleteInvoice = async (invoice: Invoice) => {
    if (!isAdmin) return;
    if (!window.confirm(`Are you sure you want to delete Tax Invoice ${invoice.invoice_no}?`)) return;

    try {
      await db.transaction('rw', [db.invoices, db.invoice_items], async () => {
        await db.invoice_items.where('invoice_id').equals(invoice.id).delete();
        await db.invoices.delete(invoice.id);
      });

      await db.outbox.add({
        id: generateUUID(),
        entity: 'invoices',
        op: 'delete',
        payload: { id: invoice.id },
        status: 'pending',
        attempts: 0,
        created_at: new Date().toISOString(),
      });
      syncService.triggerSync();

      toast(`Invoice ${invoice.invoice_no} deleted`, 'info');
      loadData();
    } catch (err: any) {
      toast(`Error deleting invoice: ${err?.message}`, 'error');
    }
  };

  // Filtered List
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.payment_status !== statusFilter) return false;
      if (pricingFilter !== 'all' && inv.pricing_type !== pricingFilter) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        inv.invoice_no.toLowerCase().includes(q) ||
        inv.customer_name.toLowerCase().includes(q) ||
        (inv.customer_phone && inv.customer_phone.toLowerCase().includes(q)) ||
        (inv.customer_gstin && inv.customer_gstin.toLowerCase().includes(q)) ||
        (inv.lr_number && inv.lr_number.toLowerCase().includes(q))
      );
    });
  }, [invoices, statusFilter, pricingFilter, searchQuery]);

  // Overall Statistics
  const stats = useMemo(() => {
    let totalBilled = 0;
    let totalPaid = 0;
    let totalTax = 0;

    for (const inv of invoices) {
      totalBilled += inv.total_amount;
      totalPaid += inv.paid_amount || 0;
      totalTax += (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
    }

    return {
      count: invoices.length,
      totalBilled,
      totalPaid,
      outstanding: Math.max(0, totalBilled - totalPaid),
      totalTax,
    };
  }, [invoices]);

  return (
    <div className="space-y-4">
      {/* KPI Cards Header */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-surface p-3.5 rounded border border-border flex items-center gap-3">
          <div className="p-2.5 rounded bg-accent/10 text-accent">
            <FileText size={22} />
          </div>
          <div>
            <span className="text-[11px] text-text-muted uppercase font-semibold">Total Invoices</span>
            <div className="text-xl font-bold font-mono text-text">{stats.count}</div>
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded border border-border flex items-center gap-3">
          <div className="p-2.5 rounded bg-primary/10 text-primary">
            <IndianRupee size={22} />
          </div>
          <div>
            <span className="text-[11px] text-text-muted uppercase font-semibold">Total Tax Invoiced</span>
            <div className="text-xl font-bold font-mono text-text">{formatINR(stats.totalBilled)}</div>
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded border border-border flex items-center gap-3">
          <div className="p-2.5 rounded bg-success/10 text-success">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span className="text-[11px] text-text-muted uppercase font-semibold">Collected (Paid)</span>
            <div className="text-xl font-bold font-mono text-success">{formatINR(stats.totalPaid)}</div>
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded border border-border flex items-center gap-3">
          <div className="p-2.5 rounded bg-danger/10 text-danger">
            <Clock size={22} />
          </div>
          <div>
            <span className="text-[11px] text-text-muted uppercase font-semibold">Receivables (Unpaid)</span>
            <div className="text-xl font-bold font-mono text-danger">{formatINR(stats.outstanding)}</div>
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded border border-border flex items-center gap-3 col-span-2 lg:col-span-1">
          <div className="p-2.5 rounded bg-accent/10 text-accent">
            <Layers size={22} />
          </div>
          <div>
            <span className="text-[11px] text-text-muted uppercase font-semibold">GST Collected</span>
            <div className="text-xl font-bold font-mono text-accent">{formatINR(stats.totalTax)}</div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-surface p-3 rounded border border-border flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Invoice No, Customer, Phone, GSTIN..."
              className="pl-9 text-xs"
            />
          </div>

          <div className="w-full sm:w-44">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Payment Status' },
                { value: 'paid', label: 'Paid in Full' },
                { value: 'partial', label: 'Partial Payment' },
                { value: 'unpaid', label: 'Unpaid (Due)' },
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

        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={handleOpenCreate} className="gap-1.5 shadow-xs font-semibold">
            <Plus size={16} />
            <span>New Tax Invoice</span>
          </Button>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-surface rounded border border-border overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={8} />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            icon={<FileText size={32} />}
            message={
              searchQuery || statusFilter !== 'all' || pricingFilter !== 'all'
                ? 'No tax invoices match your filter criteria.'
                : 'No invoices generated yet. Click "New Tax Invoice" to create a standard B2B/B2C invoice.'
            }
            actionLabel="New Tax Invoice"
            onAction={handleOpenCreate}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer / Consignee</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">GST (18%)</TableHead>
                  <TableHead className="text-right">Total (₹)</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((inv) => {
                  const gstTotal = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
                  const balance = Math.max(0, inv.total_amount - (inv.paid_amount || 0));

                  return (
                    <TableRow key={inv.id} className="hover:bg-background/50">
                      <TableCell className="font-mono font-bold text-accent text-xs">
                        {inv.invoice_no}
                      </TableCell>
                      <TableCell className="text-xs text-text-muted whitespace-nowrap">
                        {formatDateDMY(inv.invoice_date)}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-bold text-text">{inv.customer_name}</div>
                        <div className="flex items-center gap-2 text-[11px] text-text-muted">
                          {inv.customer_phone && <span>{inv.customer_phone}</span>}
                          {inv.customer_gstin && (
                            <span className="font-mono text-accent font-semibold">{inv.customer_gstin}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            inv.pricing_type === 'wholesale'
                              ? 'bg-accent/10 text-accent'
                              : 'bg-primary/10 text-primary'
                          }`}
                        >
                          {inv.pricing_type}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-text-muted">
                        {formatINR(inv.taxable_amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-text-muted">
                        {formatINR(gstTotal)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-xs text-text">
                        {formatINR(inv.total_amount)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold capitalize ${
                            inv.payment_status === 'paid'
                              ? 'bg-success-light text-success border border-success/30'
                              : inv.payment_status === 'partial'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-danger-light text-danger border border-danger/30'
                          }`}
                        >
                          {inv.payment_status === 'paid' && <CheckCircle2 size={11} />}
                          {inv.payment_status === 'partial' && <Clock size={11} />}
                          {inv.payment_status === 'unpaid' && <AlertCircle size={11} />}
                          <span>{inv.payment_status}</span>
                        </span>
                        {inv.payment_status !== 'paid' && (
                          <div className="text-[10px] text-danger font-mono font-semibold mt-0.5">
                            Due: {formatINR(balance)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleViewInvoice(inv)}
                            className="p-1.5 h-7 w-7 text-text-muted hover:text-accent"
                            title="View & Print Tax Invoice"
                          >
                            <Printer size={14} />
                          </Button>

                          {inv.payment_status !== 'paid' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleOpenPaymentModal(inv)}
                              className="p-1.5 h-7 w-7 text-text-muted hover:text-success"
                              title="Record Payment Receipt"
                            >
                              <CreditCard size={14} />
                            </Button>
                          )}

                          {isAdmin && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleDeleteInvoice(inv)}
                              className="p-1.5 h-7 w-7 text-text-muted hover:text-danger"
                              title="Delete Invoice"
                            >
                              <Trash2 size={14} />
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

      {/* CREATE TAX INVOICE MODAL */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={`Generate Tax Invoice (${invNo})`}
        maxWidth="xl"
      >
        <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1">
          {/* Quick Import Row */}
          <div className="p-3 bg-accent/5 border border-accent/20 rounded grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-text mb-1">
                Link Client / Wholesale Dealer (Optional)
              </label>
              <Select
                value={selectedClientId}
                onChange={(e) => handleClientChange(e.target.value)}
                options={[
                  { value: '', label: '-- Or enter customer details manually --' },
                  ...clients.map((c) => ({
                    value: c.id,
                    label: `${c.name} (${c.type.toUpperCase()}) - ${c.phone || c.city || 'Hosur'}`,
                  })),
                ]}
                className="text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text mb-1">
                Pull from Sale Order (Optional)
              </label>
              <Select
                value={selectedSoId}
                onChange={(e) => handleSaleOrderSelect(e.target.value)}
                options={[
                  { value: '', label: '-- Choose confirmed Sale Order to load items --' },
                  ...saleOrders.map((so) => ({
                    value: so.id,
                    label: `${so.so_no} - ${so.customer_name} (${formatINR(so.total_amount)})`,
                  })),
                ]}
                className="text-xs"
              />
            </div>
          </div>

          {/* Customer Details Form */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Customer / Consignee Name <span className="text-danger">*</span>
              </label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Sivakasi Crackers Wholesale / Rajesh"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Phone Number</label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 98421 54321"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Customer GSTIN / UIN</label>
              <Input
                value={customerGstin}
                onChange={(e) => {
                  const g = e.target.value.toUpperCase();
                  setCustomerGstin(g);
                  if (g.length >= 2) {
                    if (g.slice(0, 2) !== '33') setTaxMode('inter');
                    else setTaxMode('intra');
                  }
                }}
                placeholder="33XXXXX1234X1ZX"
                className="font-mono uppercase"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-text mb-1">Billing & Delivery Address</label>
              <Input
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Door No, Street, Town, District, Pincode"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Invoice Date</label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Due Date</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Pricing & GST Configuration */}
          <div className="p-3 bg-background border border-border rounded grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-text mb-1">Pricing Rate Applied</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPricingType('wholesale')}
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-colors ${
                    pricingType === 'wholesale'
                      ? 'bg-accent text-white shadow-xs'
                      : 'bg-surface border border-border text-text hover:bg-border/60'
                  }`}
                >
                  Wholesale Net Rate
                </button>
                <button
                  type="button"
                  onClick={() => setPricingType('retail')}
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-colors ${
                    pricingType === 'retail'
                      ? 'bg-accent text-white shadow-xs'
                      : 'bg-surface border border-border text-text hover:bg-border/60'
                  }`}
                >
                  Retail MRP Rate
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-text mb-1">Tax Classification</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTaxMode('intra')}
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-colors ${
                    taxMode === 'intra'
                      ? 'bg-accent text-white shadow-xs'
                      : 'bg-surface border border-border text-text hover:bg-border/60'
                  }`}
                >
                  Intra-State TN (CGST 9% + SGST 9%)
                </button>
                <button
                  type="button"
                  onClick={() => setTaxMode('inter')}
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-bold transition-colors ${
                    taxMode === 'inter'
                      ? 'bg-accent text-white shadow-xs'
                      : 'bg-surface border border-border text-text hover:bg-border/60'
                  }`}
                >
                  Inter-State (IGST 18%)
                </button>
              </div>
            </div>
          </div>

          {/* Transport / LR Details */}
          <div className="p-3 bg-surface border border-border rounded space-y-2">
            <span className="text-xs font-bold text-text flex items-center gap-1.5">
              <Truck size={14} className="text-accent" />
              <span>Transport & Dispatch Information (For Bilty & E-Way Bill)</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                value={transportName}
                onChange={(e) => setTransportName(e.target.value)}
                placeholder="Transporter Name (e.g. VRL Logistics)"
                className="text-xs"
              />
              <Input
                value={lrNumber}
                onChange={(e) => setLrNumber(e.target.value)}
                placeholder="LR / Bilty Number (e.g. 748291)"
                className="text-xs font-mono font-bold"
              />
              <Input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="Vehicle No (e.g. TN 28 AB 1234)"
                className="text-xs font-mono uppercase"
              />
            </div>
          </div>

          {/* Dynamic Line Items */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-text uppercase tracking-wide">
                Cracker Line Items (HSN 3604)
              </span>
              <Button variant="secondary" size="sm" onClick={handleAddItemRow} className="gap-1 text-xs">
                <Plus size={13} />
                <span>Add Row</span>
              </Button>
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
                onSelectProduct={handleAddProductDirectly}
                onAddCustomProduct={handleAddCustomProductDirectly}
                placeholder="Type cracker name, code, brand (e.g. 1000 Wala, 50 Shots, Standard) to search and add to invoice..."
              />
            </div>

            <div className="border border-border rounded overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-background border-b border-border text-text-muted">
                  <tr>
                    <th className="p-2 text-left">Product Selection</th>
                    <th className="p-2 text-left w-20">HSN</th>
                    <th className="p-2 text-center w-20">Unit</th>
                    <th className="p-2 text-right w-20">Qty</th>
                    <th className="p-2 text-right w-24">Rate (₹)</th>
                    <th className="p-2 text-right w-20">Disc %</th>
                    <th className="p-2 text-right w-28">Taxable (₹)</th>
                    <th className="p-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-background/40">
                      <td className="p-1.5 min-w-[220px]">
                        <SearchableProductSelect
                          products={products}
                          value={item.product_id}
                          pricingType={pricingType}
                          onChange={(prodId) => handleProductSelect(idx, prodId)}
                          onCustomSelect={() => {
                            const updated = [...invItems];
                            updated[idx] = {
                              ...updated[idx],
                              product_id: '',
                              product_code: '',
                              product_name: 'Custom Fireworks Item',
                              brand: 'Standard',
                              unit_price: 100,
                              taxable_value: (updated[idx].qty || 1) * 100,
                              line_total: (updated[idx].qty || 1) * 100,
                            };
                            setInvItems(updated);
                          }}
                        />
                      </td>

                      <td className="p-1.5">
                        <Input
                          value={item.hsn_code}
                          onChange={(e) => handleItemFieldChange(idx, 'hsn_code', e.target.value)}
                          className="text-xs font-mono text-center"
                        />
                      </td>

                      <td className="p-1.5">
                        <Input
                          value={item.unit}
                          onChange={(e) => handleItemFieldChange(idx, 'unit', e.target.value)}
                          className="text-xs text-center"
                        />
                      </td>

                      <td className="p-1.5">
                        <Input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleItemFieldChange(idx, 'qty', e.target.value)}
                          className="text-xs font-mono text-right"
                        />
                      </td>

                      <td className="p-1.5">
                        <Input
                          type="number"
                          step="0.1"
                          value={item.unit_price}
                          onChange={(e) => handleItemFieldChange(idx, 'unit_price', e.target.value)}
                          className="text-xs font-mono text-right"
                        />
                      </td>

                      <td className="p-1.5">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discount_percent}
                          onChange={(e) => handleItemFieldChange(idx, 'discount_percent', e.target.value)}
                          className="text-xs font-mono text-right"
                        />
                      </td>

                      <td className="p-1.5 text-right font-mono font-bold text-text">
                        {formatINR(item.taxable_value)}
                      </td>

                      <td className="p-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          disabled={invItems.length <= 1}
                          className="text-text-muted hover:text-danger disabled:opacity-20 p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Brand-Wise Discounts Section */}
          <BrandDiscountsSection
            items={invItems}
            brandDiscounts={brandDiscounts}
            onChangeBrandDiscount={handleBrandDiscountChange}
            onClearAllDiscounts={() => {
              setBrandDiscounts({});
              setInvItems((prev) =>
                prev.map((it) => {
                  const gross = it.qty * it.unit_price;
                  return { ...it, discount_percent: 0, taxable_value: gross, line_total: gross };
                })
              );
            }}
            onApplyAllDiscounts={(pct) => {
              const brandTotals = calculateBrandWiseTotals(invItems, brandDiscounts);
              const next: Record<string, number> = {};
              brandTotals.brandSummaries.forEach((s) => {
                next[s.brand] = pct;
              });
              setBrandDiscounts(next);
              setInvItems((prev) =>
                prev.map((it) => {
                  const gross = it.qty * it.unit_price;
                  const disc = Math.round((gross * pct / 100) * 100) / 100;
                  const net = Math.max(0, Math.round((gross - disc) * 100) / 100);
                  return { ...it, discount_percent: pct, taxable_value: net, line_total: net };
                })
              );
            }}
          />

          {/* Totals & Tax Calculation Breakdown */}
          <div className="bg-background p-3 rounded border border-border grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Invoice Remarks / Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bank transfer reference, special transport packaging, delivery terms..."
                rows={3}
                className="w-full text-xs bg-surface border border-border rounded p-2 focus:ring-1 focus:ring-accent"
              />
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between py-0.5 text-text-muted">
                <span>Subtotal (Gross):</span>
                <span className="font-mono">{formatINR(calculations.subtotal)}</span>
              </div>

              {calculations.totalDiscount > 0 && (
                <div className="flex justify-between py-0.5 text-success font-semibold">
                  <span>Discount:</span>
                  <span className="font-mono">- {formatINR(calculations.totalDiscount)}</span>
                </div>
              )}

              <div className="flex justify-between py-0.5 border-t border-border font-medium text-text">
                <span>Taxable Value:</span>
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
                  <span className="font-mono">{calculations.roundOff > 0 ? `+${calculations.roundOff}` : calculations.roundOff}</span>
                </div>
              )}

              <div className="flex justify-between py-1.5 border-t border-border font-bold text-sm text-accent">
                <span>Total Invoice Amount:</span>
                <span className="font-mono text-base">{formatINR(calculations.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Payment Status Config */}
          <div className="p-3 bg-surface border border-border rounded grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Payment Status</label>
              <Select
                value={initialPaymentStatus}
                onChange={(e) => {
                  const st = e.target.value as InvoicePaymentStatus;
                  setInitialPaymentStatus(st);
                  if (st === 'paid') setInitialPaidAmount(calculations.totalAmount);
                  else if (st === 'unpaid') setInitialPaidAmount(0);
                }}
                options={[
                  { value: 'unpaid', label: 'Unpaid (Payment Pending)' },
                  { value: 'partial', label: 'Partial Advance Paid' },
                  { value: 'paid', label: 'Paid in Full' },
                ]}
                className="text-xs"
              />
            </div>

            {initialPaymentStatus === 'partial' && (
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Amount Paid (₹)</label>
                <Input
                  type="number"
                  value={initialPaidAmount}
                  onChange={(e) => setInitialPaidAmount(Number(e.target.value))}
                  max={calculations.totalAmount}
                  className="text-xs font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Payment Mode</label>
              <Select
                value={initialPaymentMode}
                onChange={(e) => setInitialPaymentMode(e.target.value as PaymentMode)}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'upi', label: 'UPI / Scan & Pay' },
                  { value: 'card', label: 'Bank Card / Transfer' },
                ]}
                className="text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveInvoice} disabled={isSaving}>
              {isSaving ? 'Generating...' : 'Save & Generate Invoice'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* RECORD PAYMENT RECEIPT MODAL */}
      {selectedInvoice && (
        <Dialog
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          title={`Record Payment for ${selectedInvoice.invoice_no}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-background border border-border rounded text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Customer:</span>
                <span className="font-bold text-text">{selectedInvoice.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Invoice Total:</span>
                <span className="font-mono font-bold text-text">{formatINR(selectedInvoice.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Already Paid:</span>
                <span className="font-mono text-success">{formatINR(selectedInvoice.paid_amount || 0)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-bold">
                <span className="text-danger">Current Balance Due:</span>
                <span className="font-mono text-danger">
                  {formatINR(Math.max(0, selectedInvoice.total_amount - (selectedInvoice.paid_amount || 0)))}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Payment Amount Received (₹)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentAmountToAdd}
                  onChange={(e) => setPaymentAmountToAdd(Number(e.target.value))}
                  className="font-mono font-bold text-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Payment Mode</label>
                <Select
                  value={paymentModeInput}
                  onChange={(e) => setPaymentModeInput(e.target.value as PaymentMode)}
                  options={[
                    { value: 'cash', label: 'Cash Payment' },
                    { value: 'upi', label: 'UPI / GPay / PhonePe' },
                    { value: 'card', label: 'Bank RTGS / NEFT / Card' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">Transaction Ref / Note</label>
                <Input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. UPI Ref 382910482019"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setIsPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRecordPayment}
                disabled={isRecordingPayment || paymentAmountToAdd <= 0}
              >
                {isRecordingPayment ? 'Recording...' : 'Confirm Payment'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* VIEW & PRINT FORMAL TAX INVOICE MODAL (A4 Standard) */}
      {selectedInvoice && (
        <Dialog
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          title={`Tax Invoice: ${selectedInvoice.invoice_no}`}
          maxWidth="lg"
        >
          <div className="space-y-4">
            {/* Printer Options Toolbar (Hidden when printing) */}
            <div className="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-border no-print bg-surface p-2.5 rounded">
              <div className="flex flex-wrap items-center gap-2">
                {/* Paper Format Selector */}
                <div className="flex rounded border border-border p-0.5 bg-background text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setPrintPaperSize('a4')}
                    className={`flex items-center gap-1 px-3 py-1 rounded transition-colors ${
                      printPaperSize === 'a4' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    <FileText size={13} />
                    <span>A4 Standard Format</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintPaperSize('80mm')}
                    className={`flex items-center gap-1 px-3 py-1 rounded transition-colors ${
                      printPaperSize === '80mm' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    <Receipt size={13} />
                    <span>80mm Thermal Slip</span>
                  </button>
                </div>

                {/* Copy Type (Original, Duplicate, Triplicate) */}
                <div className="flex rounded border border-border p-0.5 bg-background text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setPrintCopy('original')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      printCopy === 'original' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintCopy('duplicate')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      printCopy === 'duplicate' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    Duplicate (Lorry)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintCopy('triplicate')}
                    className={`px-2.5 py-1 rounded transition-colors ${
                      printCopy === 'triplicate' ? 'bg-accent text-white shadow-xs' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    Triplicate
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePrintDocument}
                  disabled={isPrinting}
                  className="gap-1.5 font-bold shadow-xs"
                >
                  <Printer size={15} />
                  <span>{isPrinting ? 'Printing...' : 'Print (Ctrl+P)'}</span>
                </Button>
              </div>
            </div>

            {/* Printable Document Container */}
            <div id="invoice-print-area" className="printable-area">

            {/* Standard A4 Formal Tax Invoice Template */}
            <div className="p-4 bg-white text-gray-900 border border-gray-300 rounded shadow-xs space-y-4 print:p-0 print:border-none print:shadow-none text-xs">
              {/* Header */}
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
                    TAX INVOICE
                  </span>
                  <div className="text-[10px] text-gray-500 font-semibold uppercase mt-1">
                    {printCopy === 'original' && 'ORIGINAL FOR RECIPIENT'}
                    {printCopy === 'duplicate' && 'DUPLICATE FOR TRANSPORTER'}
                    {printCopy === 'triplicate' && 'TRIPLICATE FOR SUPPLIER'}
                  </div>
                  <div className="text-lg font-black font-mono text-gray-900 mt-1">
                    {selectedInvoice.invoice_no}
                  </div>
                  <div className="text-xs text-gray-600">
                    Date: <strong>{formatDateDMY(selectedInvoice.invoice_date)}</strong>
                  </div>
                  {selectedInvoice.due_date && (
                    <div className="text-xs text-gray-600">
                      Due Date: <strong>{formatDateDMY(selectedInvoice.due_date)}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Buyer & Transport Section */}
              <div className="grid grid-cols-2 gap-4 border border-gray-300 p-2.5 rounded text-xs">
                <div>
                  <span className="text-gray-500 font-bold uppercase text-[10px] block">Details of Receiver (Billed To):</span>
                  <div className="font-extrabold text-sm text-gray-900 mt-0.5">{selectedInvoice.customer_name}</div>
                  {selectedInvoice.customer_address && <div className="text-gray-700">{selectedInvoice.customer_address}</div>}
                  {selectedInvoice.customer_phone && <div className="text-gray-700">Phone: {selectedInvoice.customer_phone}</div>}
                  {selectedInvoice.customer_gstin ? (
                    <div className="font-mono font-bold text-gray-900 mt-0.5">
                      GSTIN: {selectedInvoice.customer_gstin}
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">Consumer / Unregistered Person</div>
                  )}
                </div>

                <div className="border-l border-gray-300 pl-3 space-y-1">
                  <span className="text-gray-500 font-bold uppercase text-[10px] block">Transport &amp; Dispatch Details:</span>
                  <div>Transporter: <strong>{selectedInvoice.transport_name || 'Direct / Self Pickup'}</strong></div>
                  {selectedInvoice.lr_number && (
                    <div className="font-mono">
                      LR / Bilty No: <strong>{selectedInvoice.lr_number}</strong>
                    </div>
                  )}
                  {selectedInvoice.vehicle_number && (
                    <div className="font-mono">
                      Vehicle No: <strong>{selectedInvoice.vehicle_number}</strong>
                    </div>
                  )}
                  {selectedInvoice.so_id && (
                    <div>Sale Order Ref: <strong className="font-mono">{selectedInvoice.so_id}</strong></div>
                  )}
                  <div>
                    Rate Mode: <strong className="uppercase">{selectedInvoice.pricing_type} Rate</strong>
                  </div>
                </div>
              </div>

              {/* Itemized Goods Table */}
              <div className="border border-gray-300 rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100 border-b border-gray-300 font-bold text-gray-700">
                    <tr>
                      <th className="p-2 text-left w-8">#</th>
                      <th className="p-2 text-left">Description of Goods</th>
                      <th className="p-2 text-left w-20">Brand</th>
                      <th className="p-2 text-center w-16">HSN</th>
                      <th className="p-2 text-right w-16">Qty</th>
                      <th className="p-2 text-right w-20">Rate (₹)</th>
                      <th className="p-2 text-right w-16">Disc %</th>
                      <th className="p-2 text-right w-24">Taxable (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedInvoiceItems.map((item, idx) => (
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

              {/* Tax & Total Calculation Summary */}
              <div className="grid grid-cols-2 gap-4">
                {/* Bank Details & Amount in Words */}
                <div className="space-y-3">
                  <div className="p-2.5 bg-gray-50 border border-gray-300 rounded text-[11px] leading-tight space-y-1">
                    <span className="font-bold text-gray-800 uppercase block">Bank Payment Details (RTGS / NEFT / IMPS):</span>
                    <div>Bank Name: <strong>State Bank of India (SBI)</strong></div>
                    <div>Account Name: <strong>VNA TRADERS</strong></div>
                    <div>Account Number: <strong className="font-mono">3948201004521</strong></div>
                    <div>IFSC Code: <strong className="font-mono">SBIN0001234</strong> (Hosur Branch)</div>
                  </div>

                  <div className="p-2 bg-gray-50 border border-gray-300 rounded text-xs">
                    <span className="text-gray-500 text-[10px] uppercase font-bold block">Invoice Amount In Words:</span>
                    <div className="font-bold text-gray-900 mt-0.5">
                      {numberToWordsINR(selectedInvoice.total_amount)}
                    </div>
                  </div>
                </div>

                {/* Totals Table */}
                <div className="border border-gray-300 rounded overflow-hidden text-xs">
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-200">
                      <tr>
                        <td className="p-1.5 text-gray-600">Taxable Value</td>
                        <td className="p-1.5 text-right font-mono font-semibold">
                          {formatINR(selectedInvoice.taxable_amount)}
                        </td>
                      </tr>
                      {selectedInvoice.cgst > 0 && (
                        <tr>
                          <td className="p-1.5 text-gray-600">Central Tax (CGST 9%)</td>
                          <td className="p-1.5 text-right font-mono">{formatINR(selectedInvoice.cgst)}</td>
                        </tr>
                      )}
                      {selectedInvoice.sgst > 0 && (
                        <tr>
                          <td className="p-1.5 text-gray-600">State Tax (SGST 9%)</td>
                          <td className="p-1.5 text-right font-mono">{formatINR(selectedInvoice.sgst)}</td>
                        </tr>
                      )}
                      {selectedInvoice.igst > 0 && (
                        <tr>
                          <td className="p-1.5 text-gray-600">Integrated Tax (IGST 18%)</td>
                          <td className="p-1.5 text-right font-mono">{formatINR(selectedInvoice.igst)}</td>
                        </tr>
                      )}
                      {selectedInvoice.round_off !== 0 && (
                        <tr>
                          <td className="p-1.5 text-gray-600">Round Off</td>
                          <td className="p-1.5 text-right font-mono">
                            {selectedInvoice.round_off > 0 ? `+${selectedInvoice.round_off}` : selectedInvoice.round_off}
                          </td>
                        </tr>
                      )}
                      <tr className="bg-gray-100 font-black text-sm">
                        <td className="p-2 text-gray-900">Total Invoice Value</td>
                        <td className="p-2 text-right font-mono text-gray-900">
                          {formatINR(selectedInvoice.total_amount)}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-1.5 text-gray-600">Amount Paid</td>
                        <td className="p-1.5 text-right font-mono text-green-700 font-bold">
                          {formatINR(selectedInvoice.paid_amount || 0)}
                        </td>
                      </tr>
                      <tr className="font-bold">
                        <td className="p-1.5 text-gray-600">Balance Due</td>
                        <td className="p-1.5 text-right font-mono text-red-600">
                          {formatINR(Math.max(0, selectedInvoice.total_amount - (selectedInvoice.paid_amount || 0)))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Terms & Authorized Signatory */}
              <div className="flex justify-between items-end pt-4 border-t border-gray-300">
                <div className="text-[10px] text-gray-500 max-w-sm space-y-1">
                  <span className="font-bold text-gray-700 uppercase">Declaration &amp; Conditions:</span>
                  <p>1. We declare that this invoice shows the actual price of the fireworks described.</p>
                  <p>2. Goods once sold will strictly not be accepted back or exchanged.</p>
                  <p>3. Store in a cool, dry place. All disputes subject to Hosur jurisdiction only.</p>
                  <div className="pt-8 text-center border-t border-gray-400 w-44 mt-6 text-gray-700 font-semibold">
                    Customer's Signature
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-bold text-xs uppercase text-gray-800">For VNA TRADERS</div>
                  <div className="h-14"></div>
                  <div className="pt-2 border-t border-gray-400 font-bold text-xs text-gray-900 inline-block min-w-[180px] text-center">
                    Authorized Signatory
                  </div>
                </div>
              </div>
            </div>
            </div>

            <div className="flex justify-end pt-2 no-print">
              <Button variant="secondary" size="sm" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
