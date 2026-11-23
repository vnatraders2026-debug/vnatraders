import React, { useState } from 'react';
import { useCompany } from '@/features/companies/CompanyContext';
import { useAuth } from '@/features/auth/AuthContext';
import { Company } from '@/types';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import {
  Building2,
  Plus,
  CheckCircle2,
  Check,
  Star,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  QrCode,
  Edit2,
  Trash2,
  Copy,
  ArrowRight,
} from 'lucide-react';

export const CompaniesPage: React.FC = () => {
  const {
    companies,
    allCompanies,
    activeCompany,
    activeCompanyId,
    setActiveCompany,
    createCompany,
    updateCompany,
    deleteCompany,
    canSwitchCompany,
  } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    trade_name: '',
    gstin: '',
    phone: '',
    email: '',
    address: '',
    city: 'Hosur',
    state: 'Tamil Nadu',
    state_code: '33',
    pincode: '635109',
    bank_name: '',
    bank_account_no: '',
    bank_ifsc: '',
    bank_branch: '',
    upi_id: '',
    receipt_footer: '',
    is_default: false,
    is_active: true,
  });

  const isAdmin = user?.role === 'admin';

  const handleOpenCreateModal = () => {
    setEditingCompany(null);
    setFormData({
      name: '',
      trade_name: '',
      gstin: '',
      phone: '+91 ',
      email: '',
      address: '',
      city: 'Hosur',
      state: 'Tamil Nadu',
      state_code: '33',
      pincode: '635109',
      bank_name: 'State Bank of India',
      bank_account_no: '',
      bank_ifsc: '',
      bank_branch: 'Hosur',
      upi_id: '',
      receipt_footer: 'Thank you for your business! Safe and Happy Celebrations.',
      is_default: false,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (comp: Company) => {
    setEditingCompany(comp);
    setFormData({
      name: comp.name || '',
      trade_name: comp.trade_name || '',
      gstin: comp.gstin || '',
      phone: comp.phone || '',
      email: comp.email || '',
      address: comp.address || '',
      city: comp.city || 'Hosur',
      state: comp.state || 'Tamil Nadu',
      state_code: comp.state_code || '33',
      pincode: comp.pincode || '635109',
      bank_name: comp.bank_name || '',
      bank_account_no: comp.bank_account_no || '',
      bank_ifsc: comp.bank_ifsc || '',
      bank_branch: comp.bank_branch || '',
      upi_id: comp.upi_id || '',
      receipt_footer: comp.receipt_footer || '',
      is_default: !!comp.is_default,
      is_active: comp.is_active !== false,
    });
    setIsModalOpen(true);
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast('Please enter the Company Legal Name', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (editingCompany) {
        await updateCompany(editingCompany.id, {
          name: formData.name.trim(),
          trade_name: formData.trade_name.trim() || undefined,
          gstin: formData.gstin.trim().toUpperCase() || undefined,
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          address: formData.address.trim() || undefined,
          city: formData.city.trim() || undefined,
          state: formData.state.trim() || undefined,
          state_code: formData.state_code.trim() || undefined,
          pincode: formData.pincode.trim() || undefined,
          bank_name: formData.bank_name.trim() || undefined,
          bank_account_no: formData.bank_account_no.trim() || undefined,
          bank_ifsc: formData.bank_ifsc.trim().toUpperCase() || undefined,
          bank_branch: formData.bank_branch.trim() || undefined,
          upi_id: formData.upi_id.trim() || undefined,
          receipt_footer: formData.receipt_footer.trim() || undefined,
          is_default: formData.is_default,
          is_active: formData.is_active,
        });
        toast(`Company "${formData.name.trim()}" updated successfully!`, 'success');
      } else {
        const created = await createCompany({
          name: formData.name.trim(),
          trade_name: formData.trade_name.trim() || undefined,
          gstin: formData.gstin.trim().toUpperCase() || undefined,
          phone: formData.phone.trim() || undefined,
          email: formData.email.trim() || undefined,
          address: formData.address.trim() || undefined,
          city: formData.city.trim() || undefined,
          state: formData.state.trim() || undefined,
          state_code: formData.state_code.trim() || undefined,
          pincode: formData.pincode.trim() || undefined,
          bank_name: formData.bank_name.trim() || undefined,
          bank_account_no: formData.bank_account_no.trim() || undefined,
          bank_ifsc: formData.bank_ifsc.trim().toUpperCase() || undefined,
          bank_branch: formData.bank_branch.trim() || undefined,
          upi_id: formData.upi_id.trim() || undefined,
          receipt_footer: formData.receipt_footer.trim() || undefined,
          is_default: formData.is_default,
          is_active: formData.is_active,
        });
        toast(`Company "${created.name}" created successfully!`, 'success');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      toast(err?.message || 'Failed to save company', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyGstin = (gst: string) => {
    navigator.clipboard.writeText(gst);
    toast(`Copied GSTIN ${gst} to clipboard`, 'info');
  };

  const handleSetDefault = async (comp: Company) => {
    try {
      await updateCompany(comp.id, { is_default: true });
      toast(`Set "${comp.name}" as the default billing company`, 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to set default company', 'error');
    }
  };

  const handleDeactivate = async (comp: Company) => {
    if (!window.confirm(`Are you sure you want to deactivate company "${comp.name}"?`)) return;
    try {
      await deleteCompany(comp.id);
      toast(`Company "${comp.name}" deactivated`, 'info');
    } catch (err: any) {
      toast(err?.message || 'Cannot deactivate company', 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-4 rounded-xl border border-border shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-text tracking-tight flex items-center gap-2">
            <Building2 className="text-accent" size={26} />
            <span>Multiple Companies Management</span>
          </h1>
          <p className="text-xs sm:text-sm text-text-muted mt-0.5">
            Create, manage and switch company workspaces. Bills, stock, orders, and invoices are isolated per company.
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="primary"
            size="md"
            onClick={handleOpenCreateModal}
            className="gap-2 font-bold shadow-md shrink-0"
          >
            <Plus size={16} />
            <span>Add New Company</span>
          </Button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-surface p-3.5 rounded-lg border border-border">
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
            Total Companies
          </span>
          <span className="text-2xl font-black text-text mt-1 block">
            {allCompanies.length}
          </span>
          <span className="text-[10px] text-text-muted">Registered entities</span>
        </div>

        <div className="bg-surface p-3.5 rounded-lg border border-border">
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
            Active Workspaces
          </span>
          <span className="text-2xl font-black text-success mt-1 block">
            {companies.length}
          </span>
          <span className="text-[10px] text-text-muted">Operational</span>
        </div>

        <div className="bg-surface p-3.5 rounded-lg border border-border">
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
            Current Workspace
          </span>
          <span className="text-sm font-bold text-accent truncate mt-2 block" title={activeCompany?.name}>
            {activeCompany?.name || 'VNA TRADERS'}
          </span>
          <span className="text-[10px] font-mono text-text-muted">
            {activeCompany?.gstin ? `GST: ${activeCompany.gstin}` : 'Active Session'}
          </span>
        </div>

        <div className="bg-surface p-3.5 rounded-lg border border-border">
          <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
            Default Company
          </span>
          <span className="text-sm font-bold text-text truncate mt-2 block">
            {allCompanies.find((c) => c.is_default)?.name || 'VNA TRADERS'}
          </span>
          <span className="text-[10px] text-text-muted">Primary billing head</span>
        </div>
      </div>

      {/* Company Cards Grid */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold text-text uppercase tracking-wider flex items-center gap-2">
          <span>Registered Companies &amp; Sister Concerns</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-mono">
            {allCompanies.length}
          </span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allCompanies.map((c) => {
            const isActiveWorkspace = c.id === activeCompanyId;
            const isDefault = !!c.is_default;
            const isInactive = c.is_active === false;

            return (
              <div
                key={c.id}
                className={`bg-surface rounded-xl border p-4 flex flex-col justify-between gap-4 transition-all relative overflow-hidden ${
                  isActiveWorkspace
                    ? 'border-accent shadow-md ring-2 ring-accent/20'
                    : 'border-border hover:border-text-muted/60 shadow-xs'
                } ${isInactive ? 'opacity-60 bg-background' : ''}`}
              >
                {/* Active Indicator Ribbon */}
                {isActiveWorkspace && (
                  <div className="absolute top-0 right-0 bg-accent text-white text-[10px] font-bold px-3 py-0.5 rounded-bl-lg shadow-xs flex items-center gap-1">
                    <CheckCircle2 size={11} />
                    <span>Active Workspace</span>
                  </div>
                )}

                {/* Card Header */}
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isActiveWorkspace
                          ? 'bg-accent text-white'
                          : 'bg-background border border-border text-accent'
                      }`}
                    >
                      <Building2 size={20} />
                    </div>

                    <div className="min-w-0 pr-12">
                      <h3 className="font-bold text-sm text-text leading-tight truncate" title={c.name}>
                        {c.name}
                      </h3>
                      {c.trade_name && (
                        <p className="text-xs text-text-muted truncate mt-0.5" title={c.trade_name}>
                          {c.trade_name}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {isDefault && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 flex items-center gap-0.5">
                            <Star size={9} fill="currentColor" /> Default
                          </span>
                        )}
                        {isInactive ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-danger/15 text-danger border border-danger/30">
                            Deactivated
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-success/15 text-success border border-success/30">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* GSTIN Badge */}
                  {c.gstin && (
                    <div className="bg-background border border-border/80 rounded px-2.5 py-1 flex items-center justify-between text-xs font-mono">
                      <span className="text-[11px] text-text-muted font-sans font-bold">GSTIN:</span>
                      <div className="flex items-center gap-1.5">
                        <strong className="text-text font-bold">{c.gstin}</strong>
                        <button
                          type="button"
                          onClick={() => handleCopyGstin(c.gstin!)}
                          className="text-text-muted hover:text-text p-0.5 rounded"
                          title="Copy GSTIN"
                        >
                          <Copy size={11} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Company Details List */}
                  <div className="space-y-1 text-xs text-text-muted pt-1">
                    {c.address && (
                      <div className="flex items-start gap-1.5">
                        <MapPin size={13} className="text-text-muted shrink-0 mt-0.5" />
                        <span className="truncate">
                          {c.address}, {c.city || 'Hosur'} {c.pincode ? `- ${c.pincode}` : ''}
                        </span>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone size={13} className="text-text-muted shrink-0" />
                        <span>{c.phone}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail size={13} className="text-text-muted shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {c.bank_name && (
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <CreditCard size={13} className="text-text-muted shrink-0" />
                        <span className="truncate">
                          {c.bank_name} {c.bank_account_no ? `• A/C: ${c.bank_account_no}` : ''}
                        </span>
                      </div>
                    )}
                    {c.upi_id && (
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-accent">
                        <QrCode size={13} className="shrink-0" />
                        <span className="truncate">UPI: {c.upi_id}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                  <div>
                    {isActiveWorkspace ? (
                      <span className="text-xs font-bold text-accent flex items-center gap-1">
                        <Check size={14} /> Currently in Use
                      </span>
                    ) : (
                      canSwitchCompany && (
                        <button
                          type="button"
                          onClick={() => setActiveCompany(c)}
                          disabled={isInactive}
                          className="px-2.5 py-1 text-xs font-bold rounded bg-accent text-white hover:bg-accent/90 shadow-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                        >
                          <span>Switch Here</span>
                          <ArrowRight size={12} />
                        </button>
                      )
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      {!isDefault && !isInactive && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(c)}
                          className="p-1.5 rounded hover:bg-background border border-border text-text-muted hover:text-amber-500"
                          title="Set as Default Company"
                        >
                          <Star size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(c)}
                        className="p-1.5 rounded hover:bg-background border border-border text-text-muted hover:text-text"
                        title="Edit Company Details"
                      >
                        <Edit2 size={13} />
                      </button>
                      {!isDefault && !isInactive && (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(c)}
                          className="p-1.5 rounded hover:bg-danger/10 border border-border text-text-muted hover:text-danger"
                          title="Deactivate Company"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create / Edit Company Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCompany ? `Edit Company: ${editingCompany.name}` : 'Register New Company'}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveCompany} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Company Legal Name <span className="text-danger">*</span>
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. VNA TRADERS or SRI BALAJI FIREWORKS"
                required
                className="uppercase font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Trade Name / Display Name
              </label>
              <Input
                value={formData.trade_name}
                onChange={(e) => setFormData({ ...formData, trade_name: e.target.value })}
                placeholder="e.g. VNA Crackers & Fireworks Wholesale"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                GSTIN (15 Digits)
              </label>
              <Input
                value={formData.gstin}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                placeholder="33ACSPV5299F1Z5"
                className="font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Contact Phone
              </label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+91 94431 23456"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Official Email
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="company@gmail.com"
              />
            </div>
          </div>

          {/* Address Information */}
          <div className="bg-background p-3 rounded-lg border border-border space-y-2.5">
            <span className="text-xs font-bold text-text uppercase flex items-center gap-1.5">
              <MapPin size={13} className="text-accent" />
              <span>Registered Business Address</span>
            </span>

            <div>
              <label className="block text-[11px] font-semibold text-text mb-1">
                Street Address / Godown Location
              </label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="e.g. Jeermangalam, Near Checkpost"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">City / Town</label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Hosur"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">State</label>
                <Input
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="Tamil Nadu"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">State Code</label>
                <Input
                  value={formData.state_code}
                  onChange={(e) => setFormData({ ...formData, state_code: e.target.value })}
                  placeholder="33"
                  className="font-mono text-center"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">PIN Code</label>
                <Input
                  value={formData.pincode}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                  placeholder="635109"
                  className="font-mono text-center"
                />
              </div>
            </div>
          </div>

          {/* Banking & UPI Details */}
          <div className="bg-background p-3 rounded-lg border border-border space-y-2.5">
            <span className="text-xs font-bold text-text uppercase flex items-center gap-1.5">
              <CreditCard size={13} className="text-accent" />
              <span>Banking &amp; Digital Payment Information (Printed on Bills &amp; Invoices)</span>
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">Bank Name</label>
                <Input
                  value={formData.bank_name}
                  onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                  placeholder="e.g. State Bank of India"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">Account Number</label>
                <Input
                  value={formData.bank_account_no}
                  onChange={(e) => setFormData({ ...formData, bank_account_no: e.target.value })}
                  placeholder="e.g. 38421098451"
                  className="font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">IFSC Code</label>
                <Input
                  value={formData.bank_ifsc}
                  onChange={(e) => setFormData({ ...formData, bank_ifsc: e.target.value.toUpperCase() })}
                  placeholder="SBIN0001234"
                  className="font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text mb-1">UPI ID (Scan &amp; Pay)</label>
                <Input
                  value={formData.upi_id}
                  onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                  placeholder="9443123456@sbi"
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          {/* Bill Receipt Footer */}
          <div>
            <label className="block text-xs font-semibold text-text mb-1">
              Bill / Invoice Receipt Footer Note
            </label>
            <Input
              value={formData.receipt_footer}
              onChange={(e) => setFormData({ ...formData, receipt_footer: e.target.value })}
              placeholder="e.g. Thank you for choosing us! Wishing you a bright and safe celebration."
            />
          </div>

          {/* Checkboxes */}
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-text">
              <input
                type="checkbox"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span>Set as Default Primary Company</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-text">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span>Company is Active</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSaving}
              className="font-bold"
            >
              {isSaving ? 'Saving...' : editingCompany ? 'Save Changes' : 'Create Company'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
