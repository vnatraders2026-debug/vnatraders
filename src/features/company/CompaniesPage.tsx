import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCompany } from './CompanyContext';
import { Company } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  Check,
  Star,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  RotateCw,
} from 'lucide-react';

export const CompaniesPage: React.FC = () => {
  const {
    companies,
    activeCompany,
    setActiveCompanyId,
    addCompany,
    updateCompany,
    deleteCompany,
    setDefaultCompany,
    refreshCompanies,
  } = useCompany();

  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [code, setCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Tamil Nadu');
  const [pincode, setPincode] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // Auto-open modal if ?action=new in URL
  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      handleOpenCreate();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleOpenCreate = () => {
    setEditingCompany(null);
    setName('');
    setLegalName('');
    setCode('');
    setGstin('');
    setPan('');
    setPhone('+91 ');
    setEmail('');
    setAddress('');
    setCity('Hosur');
    setState('Tamil Nadu');
    setPincode('635109');
    setBankName('');
    setBankAccountNo('');
    setBankIfsc('');
    setBankBranch('');
    setReceiptFooter('Thank you for choosing us! Wishing you a bright and safe celebration.');
    setIsDefault(companies.length === 0);
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (comp: Company) => {
    setEditingCompany(comp);
    setName(comp.name);
    setLegalName(comp.legal_name || '');
    setCode(comp.code || '');
    setGstin(comp.gstin || '');
    setPan(comp.pan || '');
    setPhone(comp.phone || '');
    setEmail(comp.email || '');
    setAddress(comp.address || '');
    setCity(comp.city || 'Hosur');
    setState(comp.state || 'Tamil Nadu');
    setPincode(comp.pincode || '');
    setBankName(comp.bank_name || '');
    setBankAccountNo(comp.bank_account_no || '');
    setBankIfsc(comp.bank_ifsc || '');
    setBankBranch(comp.bank_branch || '');
    setReceiptFooter(comp.receipt_footer || '');
    setIsDefault(comp.is_default || false);
    setIsActive(comp.is_active);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast('Company Name is required', 'error');
      return;
    }
    if (!code.trim()) {
      toast('Short Code (e.g. VNA, SVF) is required for document series', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        legal_name: legalName.trim() || undefined,
        code: code.trim().toUpperCase(),
        gstin: gstin.trim().toUpperCase() || '33ACSPV5299F1Z5',
        pan: pan.trim().toUpperCase() || (gstin.length >= 12 ? gstin.slice(2, 12) : undefined),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim(),
        city: city.trim() || 'Hosur',
        state: state.trim() || 'Tamil Nadu',
        pincode: pincode.trim(),
        bank_name: bankName.trim() || undefined,
        bank_account_no: bankAccountNo.trim() || undefined,
        bank_ifsc: bankIfsc.trim().toUpperCase() || undefined,
        bank_branch: bankBranch.trim() || undefined,
        receipt_footer: receiptFooter.trim() || undefined,
        is_default: isDefault,
        is_active: isActive,
      };

      if (editingCompany) {
        await updateCompany(editingCompany.id, payload);
        toast(`Company "${payload.name}" updated successfully`, 'success');
      } else {
        const created = await addCompany(payload);
        toast(`New company "${created.name}" created successfully!`, 'success');
      }

      setIsModalOpen(false);
    } catch (err: any) {
      toast(err?.message || 'Failed to save company details', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (comp: Company) => {
    if (companies.length <= 1) {
      toast('Cannot delete the only registered company', 'error');
      return;
    }
    if (window.confirm(`Are you sure you want to delete company "${comp.name}"?`)) {
      try {
        await deleteCompany(comp.id);
        toast(`Company "${comp.name}" deleted`, 'info');
      } catch (err: any) {
        toast(err?.message || 'Failed to delete company', 'error');
      }
    }
  };

  const handleSwitchCompany = (comp: Company) => {
    setActiveCompanyId(comp.id);
    toast(`Switched terminal active company to "${comp.name}"`, 'success');
  };

  const handleSetDefault = async (comp: Company) => {
    try {
      await setDefaultCompany(comp.id);
      toast(`"${comp.name}" set as the primary default company`, 'success');
    } catch (err: any) {
      toast(err?.message || 'Failed to set default', 'error');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={24} className="text-accent" />
            <h1 className="text-lg sm:text-xl font-bold text-text">Company Profiles &amp; Entities</h1>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Manage your multiple business firms, GSTIN registrations, billing presets, and switch active operating context
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={refreshCompanies}
            className="text-xs gap-1.5"
            title="Refresh company list"
          >
            <RotateCw size={13} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenCreate}
            className="text-xs font-semibold gap-1.5"
          >
            <Plus size={14} />
            <span>Register New Company</span>
          </Button>
        </div>
      </div>

      {/* Active Operating Company Spotlight Banner */}
      {activeCompany && (
        <div className="p-4 rounded-lg bg-surface border border-accent/40 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent text-white">
                Active Terminal Context
              </span>
              {activeCompany.code && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-background border border-border text-text-muted">
                  Prefix: [{activeCompany.code}]
                </span>
              )}
              {activeCompany.is_default && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/30 flex items-center gap-0.5">
                  <Star size={10} className="fill-warning" /> Primary Default
                </span>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-black text-text">
              {activeCompany.name}
            </h2>

            <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
              <span>GSTIN: <strong className="font-mono text-text">{activeCompany.gstin}</strong></span>
              <span>•</span>
              <span>Phone: <strong className="text-text">{activeCompany.phone}</strong></span>
              <span>•</span>
              <span>Location: <strong className="text-text">{activeCompany.city}, {activeCompany.state}</strong></span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenEdit(activeCompany)}
              className="text-xs gap-1"
            >
              <Edit2 size={12} />
              <span>Edit Details</span>
            </Button>
          </div>
        </div>
      )}

      {/* Company Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {companies.map((comp) => {
          const isActiveOperating = comp.id === activeCompany?.id;

          return (
            <div
              key={comp.id}
              className={`p-4 rounded-lg border bg-surface flex flex-col justify-between gap-4 transition-all ${
                isActiveOperating
                  ? 'border-accent ring-1 ring-accent/30 shadow-subtle'
                  : 'border-border hover:border-text-muted/60'
              }`}
            >
              {/* Card Top */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black text-sm text-text leading-tight truncate">
                        {comp.name}
                      </span>
                      {comp.code && (
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-background border border-border text-accent">
                          {comp.code}
                        </span>
                      )}
                    </div>
                    {comp.legal_name && comp.legal_name !== comp.name && (
                      <p className="text-[11px] text-text-muted truncate mt-0.5">
                        {comp.legal_name}
                      </p>
                    )}
                  </div>

                  {/* Status & Default Badges */}
                  <div className="flex items-center gap-1 shrink-0">
                    {comp.is_default && (
                      <span
                        className="text-[10px] font-bold p-1 rounded bg-warning/15 text-warning border border-warning/30"
                        title="Primary Default Company"
                      >
                        <Star size={11} className="fill-warning" />
                      </span>
                    )}
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        comp.is_active
                          ? 'bg-success/15 text-success'
                          : 'bg-text-muted/20 text-text-muted'
                      }`}
                    >
                      {comp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>

                {/* Meta details list */}
                <div className="space-y-1.5 text-xs text-text-muted border-t border-border/40 pt-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text text-[11px] uppercase tracking-wider w-14 shrink-0">
                      GSTIN:
                    </span>
                    <span className="font-mono font-bold text-text truncate">{comp.gstin}</span>
                  </div>

                  {comp.pan && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text text-[11px] uppercase tracking-wider w-14 shrink-0">
                        PAN:
                      </span>
                      <span className="font-mono text-text truncate">{comp.pan}</span>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <Phone size={12} className="text-accent shrink-0 mt-0.5" />
                    <span className="truncate">{comp.phone}</span>
                  </div>

                  {comp.email && (
                    <div className="flex items-start gap-2">
                      <Mail size={12} className="text-accent shrink-0 mt-0.5" />
                      <span className="truncate">{comp.email}</span>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <MapPin size={12} className="text-accent shrink-0 mt-0.5" />
                    <span className="line-clamp-2">
                      {comp.address}, {comp.city} - {comp.pincode}
                    </span>
                  </div>

                  {/* Bank snippet */}
                  {comp.bank_name && (
                    <div className="flex items-start gap-2 pt-1 border-t border-border/30">
                      <CreditCard size={12} className="text-accent shrink-0 mt-0.5" />
                      <span className="truncate font-mono text-[11px]">
                        {comp.bank_name} • {comp.bank_account_no}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Actions Footer */}
              <div className="pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                <div>
                  {isActiveOperating ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-accent px-2 py-1 rounded bg-accent/10 border border-accent/20">
                      <Check size={13} /> Active Operating
                    </span>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSwitchCompany(comp)}
                      className="text-xs py-1 px-2.5 h-7 font-bold"
                    >
                      <span>Switch to Firm</span>
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {!comp.is_default && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(comp)}
                      className="p-1.5 rounded hover:bg-background text-text-muted hover:text-warning transition-colors"
                      title="Set as Default Company"
                    >
                      <Star size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(comp)}
                    className="p-1.5 rounded hover:bg-background text-text-muted hover:text-text transition-colors"
                    title="Edit Company"
                  >
                    <Edit2 size={14} />
                  </button>
                  {companies.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDelete(comp)}
                      className="p-1.5 rounded hover:bg-danger-light text-text-muted hover:text-danger transition-colors"
                      title="Delete Company"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Company Dialog */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCompany ? `Edit Company: ${editingCompany.name}` : 'Register New Business Firm'}
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-text mb-1">
                Company / Firm Trade Name <span className="text-danger">*</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. VNA Traders or Sri Venkateshwara Fireworks"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Short Code (Prefix) <span className="text-danger">*</span>
              </label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. VNA or SVF"
                className="font-mono uppercase font-bold"
                maxLength={6}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Legal Registered Entity Name</label>
              <Input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. VNA Traders Fireworks Depot Pvt Ltd"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                GSTIN Number <span className="text-danger">*</span>
              </label>
              <Input
                value={gstin}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setGstin(val);
                  if (val.length >= 12 && !pan) {
                    setPan(val.slice(2, 12));
                  }
                }}
                placeholder="33ACSPV5299F1Z5"
                className="font-mono uppercase"
                maxLength={15}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text mb-1">PAN Number</label>
              <Input
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                placeholder="ACSPV5299F"
                className="font-mono uppercase"
                maxLength={10}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">
                Phone Number <span className="text-danger">*</span>
              </label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 94431 23456"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Email Address</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@vnatraders.com"
              />
            </div>
          </div>

          {/* Address Block */}
          <div className="bg-background p-3 rounded border border-border space-y-2.5">
            <span className="text-[11px] font-bold text-text uppercase tracking-wider flex items-center gap-1">
              <MapPin size={13} className="text-accent" /> Location &amp; Registered Address
            </span>

            <div>
              <label className="block text-xs font-semibold text-text mb-1">Street Address</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Jeermangalam Godown, Mathigiri Road"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">City / Town</label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hosur" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">State</label>
                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="Tamil Nadu" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Pincode</label>
                <Input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="635109" />
              </div>
            </div>
          </div>

          {/* Bank Details for Invoices & Challans */}
          <div className="bg-background p-3 rounded border border-border space-y-2.5">
            <span className="text-[11px] font-bold text-text uppercase tracking-wider flex items-center gap-1">
              <CreditCard size={13} className="text-accent" /> Bank Account Details (Printed on Invoices &amp; Quotes)
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Bank Name</label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. State Bank of India" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Account Number</label>
                <Input value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} placeholder="e.g. 39482019482" className="font-mono" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">IFSC Code</label>
                <Input value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" className="font-mono uppercase" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Branch Name</label>
                <Input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="e.g. Hosur Main Branch" />
              </div>
            </div>
          </div>

          {/* Receipt Custom Footer */}
          <div>
            <label className="block text-xs font-semibold text-text mb-1">Custom Receipt / Invoice Footer Note</label>
            <Input
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="e.g. Thank you for choosing us! Wishing you a bright and safe celebration."
            />
          </div>

          {/* Checkboxes */}
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-text">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span>Set as Primary Default Company</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-text">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent"
              />
              <span>Active in Terminal Switcher</span>
            </label>
          </div>

          {/* Modal Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingCompany ? 'Save Changes' : 'Register Firm'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
