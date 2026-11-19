import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/db';
import { Client, ClientType, CustomerTier } from '@/types';
import { generateUUID } from '@/lib/uuid';
import { formatINR } from '@/lib/format';
import { syncService } from '@/sync/syncService';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Users2,
  Search,
  Plus,
  Edit,
  Building2,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  XCircle,
  RotateCcw,
  UserCheck,
  Truck,
  IndianRupee,
} from 'lucide-react';

export const ClientsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const { toast } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'supplier'>('all');
  const [customerTierFilter, setCustomerTierFilter] = useState<'all' | 'wholesale' | 'retail'>('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [type, setType] = useState<ClientType>('customer');
  const [customerTier, setCustomerTier] = useState<CustomerTier>('wholesale');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Tamil Nadu');
  const [pincode, setPincode] = useState('');
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [outstandingBalance, setOutstandingBalance] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const all = await db.clients.toArray();
      setClients(all);
    } catch (err: any) {
      toast(err?.message || 'Failed to load client database', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleSync = () => {
      loadData();
    };

    window.addEventListener('clients-synced', handleSync);
    window.addEventListener('supabase-data-refreshed', handleSync);
    return () => {
      window.removeEventListener('clients-synced', handleSync);
      window.removeEventListener('supabase-data-refreshed', handleSync);
    };
  }, []);

  // Summary Metrics
  const metrics = useMemo(() => {
    let customersCount = 0;
    let wholesaleCount = 0;
    let suppliersCount = 0;
    let totalReceivables = 0;

    clients.forEach((c) => {
      if (c.type === 'customer' || c.type === 'both') {
        customersCount++;
        if (c.customer_tier === 'wholesale') wholesaleCount++;
        totalReceivables += c.outstanding_balance || 0;
      }
      if (c.type === 'supplier' || c.type === 'both') {
        suppliersCount++;
      }
    });

    return {
      total: clients.length,
      customersCount,
      wholesaleCount,
      suppliersCount,
      totalReceivables,
    };
  }, [clients]);

  // Filtered Clients
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (typeFilter === 'customer' && c.type !== 'customer' && c.type !== 'both') return false;
      if (typeFilter === 'supplier' && c.type !== 'supplier' && c.type !== 'both') return false;
      if (customerTierFilter !== 'all' && c.customer_tier !== customerTierFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesCompany = (c.company_name || '').toLowerCase().includes(q);
        const matchesPhone = c.phone.includes(q);
        const matchesGst = (c.gstin || '').toLowerCase().includes(q);
        const matchesCity = (c.city || '').toLowerCase().includes(q);
        return matchesName || matchesCompany || matchesPhone || matchesGst || matchesCity;
      }
      return true;
    });
  }, [clients, searchQuery, typeFilter, customerTierFilter]);

  const handleOpenAdd = () => {
    setEditingClient(null);
    setName('');
    setCompanyName('');
    setType('customer');
    setCustomerTier('wholesale');
    setPhone('');
    setEmail('');
    setGstin('');
    setAddress('');
    setCity('Hosur');
    setStateName('Tamil Nadu');
    setPincode('');
    setCreditLimit(50000);
    setOutstandingBalance(0);
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setCompanyName(client.company_name || '');
    setType(client.type);
    setCustomerTier(client.customer_tier || 'wholesale');
    setPhone(client.phone);
    setEmail(client.email || '');
    setGstin(client.gstin || '');
    setAddress(client.address || '');
    setCity(client.city || '');
    setStateName(client.state || 'Tamil Nadu');
    setPincode(client.pincode || '');
    setCreditLimit(client.credit_limit || 0);
    setOutstandingBalance(client.outstanding_balance || 0);
    setNotes(client.notes || '');
    setIsModalOpen(true);
  };

  const handleToggleActive = async (client: Client) => {
    const updatedStatus = !client.is_active;
    const now = new Date().toISOString();
    const updatedClient: Client = {
      ...client,
      is_active: updatedStatus,
      updated_at: now,
    };
    await db.clients.put(updatedClient);
    await db.outbox.add({
      id: generateUUID(),
      entity: 'clients',
      op: 'update',
      payload: updatedClient,
      status: 'pending',
      attempts: 0,
      created_at: now,
    });
    syncService.triggerSync();
    toast(updatedStatus ? `Activated ${client.name}` : `Deactivated ${client.name}`, 'info');
    loadData();
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Please enter client or business name', 'error');
      return;
    }
    if (!phone.trim()) {
      toast('Please enter contact phone number', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const clientId = editingClient ? editingClient.id : generateUUID();

      const clientRecord: Client = {
        id: clientId,
        name: name.trim(),
        company_name: companyName.trim() || undefined,
        type: type,
        customer_tier: type === 'supplier' ? undefined : customerTier,
        phone: phone.trim(),
        email: email.trim() || undefined,
        gstin: gstin.trim().toUpperCase() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: stateName.trim() || 'Tamil Nadu',
        pincode: pincode.trim() || undefined,
        credit_limit: Math.max(0, Number(creditLimit) || 0),
        outstanding_balance: Number(outstandingBalance) || 0,
        current_balance: Number(outstandingBalance) || 0,
        notes: notes.trim() || undefined,
        is_active: editingClient ? editingClient.is_active : true,
        created_at: editingClient?.created_at || now,
        updated_at: now,
      };

      await db.clients.put(clientRecord);
      await db.outbox.add({
        id: generateUUID(),
        entity: 'clients',
        op: editingClient ? 'update' : 'insert',
        payload: clientRecord,
        status: 'pending',
        attempts: 0,
        created_at: now,
      });
      syncService.triggerSync();
      toast(editingClient ? 'Client updated successfully' : 'Client created successfully', 'success');
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      toast(err?.message || 'Error saving client', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <h1 className="text-xl font-black text-text tracking-tight flex items-center gap-2">
            <Users2 className="text-accent" size={24} />
            <span>Client & Vendor Management</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Manage wholesale buyers, retail customers, and Sivakasi cracker manufacturers/suppliers.
          </p>
        </div>

        {isAdmin && (
          <Button variant="primary" size="sm" onClick={handleOpenAdd} className="gap-1.5 self-start sm:self-auto font-bold">
            <Plus size={15} />
            <span>Add New Client</span>
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted uppercase">Total Directory</span>
          <div className="text-xl font-black text-text mt-1">{metrics.total}</div>
          <span className="text-[10px] text-text-muted">Customers & Suppliers</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-accent flex items-center gap-1">
            <Building2 size={13} /> Wholesale Dealers
          </span>
          <div className="text-xl font-black text-accent mt-1">{metrics.wholesaleCount}</div>
          <span className="text-[10px] text-text-muted">Bulk cracker buyers</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1">
            <UserCheck size={13} /> Retail Clients
          </span>
          <div className="text-xl font-black text-text mt-1">{metrics.customersCount - metrics.wholesaleCount}</div>
          <span className="text-[10px] text-text-muted">Walk-in & local</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs">
          <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1">
            <Truck size={13} /> Suppliers / Factories
          </span>
          <div className="text-xl font-black text-text mt-1">{metrics.suppliersCount}</div>
          <span className="text-[10px] text-text-muted">Sivakasi & vendors</span>
        </div>

        <div className="bg-surface border border-border rounded p-3 shadow-xs col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-success flex items-center gap-1">
            <IndianRupee size={13} /> Receivables
          </span>
          <div className="text-base font-bold text-success font-mono mt-1">{formatINR(metrics.totalReceivables)}</div>
          <span className="text-[10px] text-text-muted">Total balance due</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-surface border border-border rounded p-3 flex flex-wrap gap-2.5 items-center justify-between">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search by client name, company, phone, GSTIN, or city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs min-h-[38px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="text-xs min-h-[38px]"
          >
            <option value="all">All Roles (Customers & Suppliers)</option>
            <option value="customer">Customers Only</option>
            <option value="supplier">Suppliers / Vendors Only</option>
          </Select>

          {typeFilter !== 'supplier' && (
            <Select
              value={customerTierFilter}
              onChange={(e) => setCustomerTierFilter(e.target.value as any)}
              className="text-xs min-h-[38px]"
            >
              <option value="all">All Customer Tiers</option>
              <option value="wholesale">Wholesale Dealers</option>
              <option value="retail">Retail Buyers</option>
            </Select>
          )}

          {(searchQuery || typeFilter !== 'all' || customerTierFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setTypeFilter('all');
                setCustomerTierFilter('all');
              }}
              className="text-danger hover:underline text-xs font-semibold px-2 flex items-center gap-1"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          message="No clients found matching your filter"
          actionLabel={isAdmin ? 'Add First Client' : undefined}
          onAction={isAdmin ? handleOpenAdd : undefined}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client / Business</TableHead>
              <TableHead>Type & Tier</TableHead>
              <TableHead>Contact (Phone & Email)</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>GSTIN</TableHead>
              <TableHead className="text-right">Balance Due (₹)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClients.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-bold text-text text-sm">{c.name}</div>
                  {c.company_name && (
                    <div className="text-xs text-text-muted flex items-center gap-1">
                      <Building2 size={11} className="text-accent" />
                      <span>{c.company_name}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 items-start">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-background border border-border">
                      {c.type === 'both' ? 'Customer & Supplier' : c.type}
                    </span>
                    {c.customer_tier && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        c.customer_tier === 'wholesale'
                          ? 'bg-accent/10 text-accent border border-accent/20'
                          : 'bg-surface text-text-muted'
                      }`}>
                        {c.customer_tier === 'wholesale' ? 'Wholesale Dealer' : 'Retail'}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs font-semibold text-text flex items-center gap-1">
                    <Phone size={11} className="text-accent" />
                    <span>{c.phone}</span>
                  </div>
                  {c.email && (
                    <div className="text-[11px] text-text-muted flex items-center gap-1">
                      <Mail size={11} />
                      <span>{c.email}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-xs text-text-muted">
                  <div className="flex items-center gap-1">
                    <MapPin size={11} className="text-accent shrink-0" />
                    <span>{c.city ? `${c.city}, ${c.state || 'TN'}` : c.state || 'Tamil Nadu'}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs font-semibold text-text">
                  {c.gstin || <span className="text-text-muted font-normal text-[11px]">Unregistered</span>}
                </TableCell>
                <TableCell className="text-right font-mono font-bold text-sm">
                  <span className={(c.outstanding_balance || 0) > 0 ? 'text-danger' : 'text-success'}>
                    {formatINR(c.outstanding_balance || 0)}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    c.is_active ? 'bg-success-light text-success' : 'bg-danger-light text-danger'
                  }`}>
                    {c.is_active ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                    <span>{c.is_active ? 'Active' : 'Inactive'}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {isAdmin && (
                      <Button variant="secondary" size="sm" onClick={() => handleOpenEdit(c)} className="p-1 min-h-[30px]" title="Edit client">
                        <Edit size={13} />
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleToggleActive(c)}
                      className={`p-1 min-h-[30px] ${c.is_active ? 'text-danger' : 'text-success'}`}
                      title={c.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {c.is_active ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* ADD / EDIT CLIENT MODAL */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClient ? `Edit Client: ${editingClient.name}` : 'Add New Client / Vendor'}
        maxWidth="lg"
      >
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Contact / Owner Name <span className="text-danger">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Business / Shop Name</label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Sri Balaji Fireworks"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Client Role Type</label>
              <Select value={type} onChange={(e) => setType(e.target.value as ClientType)}>
                <option value="customer">Customer (Buyer)</option>
                <option value="supplier">Supplier / Manufacturer (Vendor)</option>
                <option value="both">Both (Customer & Supplier)</option>
              </Select>
            </div>

            {type !== 'supplier' && (
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Customer Pricing Tier</label>
                <Select value={customerTier} onChange={(e) => setCustomerTier(e.target.value as CustomerTier)}>
                  <option value="wholesale">Wholesale Dealer (Wholesale rates)</option>
                  <option value="retail">Retail Buyer (Standard rates & brand discount)</option>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Mobile Number <span className="text-danger">*</span>
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 98421 23456"
                type="tel"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Email Address</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                type="email"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">GSTIN Number</label>
              <Input
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="e.g. 33AAAAA0000A1Z5"
                className="font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-text mb-1">Address / Street</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop door no, street, landmark"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">City / Town</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Hosur / Sivakasi / Bangalore"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">State</label>
              <Input value={stateName} onChange={(e) => setStateName(e.target.value)} placeholder="Tamil Nadu" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Pincode</label>
              <Input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="635109" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Credit Limit (₹)</label>
              <Input
                type="number"
                min="0"
                value={creditLimit}
                onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)}
                placeholder="50000"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text mb-1">Notes / Preferences</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Preferred transport service, payment terms 15 days"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button variant="secondary" size="sm" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingClient ? 'Save Changes' : 'Create Client'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
