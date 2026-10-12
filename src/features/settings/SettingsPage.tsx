import React, { useState, useEffect } from 'react';
import { db, getShopSettings, saveShopSettings, resetAllLocalData } from '@/db';
import { ShopSettings } from '@/types';
import { useSync } from '@/sync/useSync';
import { formatISTDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { useCartStore } from '@/features/billing/store';
import { directPrinterService, PrinterStatus } from '@/lib/printer/directPrinterService';
import {
  Store,
  Printer,
  RefreshCw,
  HardDriveDownload,
  Save,
  Bluetooth,
  Usb,
  Zap,
  CheckCircle2,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { toast } = useToast();
  const { state: syncState, pendingCount, retrySync, lastError } = useSync();

  const [settings, setSettings] = useState<ShopSettings>({
    shop_name: '',
    shop_address: '',
    shop_phone: '',
    gst_no: '',
    receipt_footer: '',
    device_code: 'A',
    paper_size: '80mm',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('-');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      await resetAllLocalData();
      useCartStore.getState().clearCart();
      toast('All local data cleared and reset successfully!', 'success');
      setIsResetModalOpen(false);
      setTimeout(() => {
        window.location.href = '/billing';
      }, 800);
    } catch (err: any) {
      toast(`Reset failed: ${err.message}`, 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const [printerStatus, setPrinterStatus] = useState<PrinterStatus>(directPrinterService.getStatus());
  const [isConnectingBluetooth, setIsConnectingBluetooth] = useState(false);
  const [isConnectingSerial, setIsConnectingSerial] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);

  useEffect(() => {
    return directPrinterService.subscribe((s) => {
      setPrinterStatus(s);
    });
  }, []);

  const handleConnectBluetooth = async () => {
    setIsConnectingBluetooth(true);
    try {
      const name = await directPrinterService.connectBluetooth();
      toast(`Successfully connected to ${name}! Ready for 1-click direct print.`, 'success');
    } catch (err: any) {
      if (!err.message?.includes('User cancelled')) {
        toast(`Bluetooth connection notice: ${err.message}`, 'error');
      }
    } finally {
      setIsConnectingBluetooth(false);
    }
  };

  const handleConnectSerial = async () => {
    setIsConnectingSerial(true);
    try {
      const name = await directPrinterService.connectSerial(9600);
      toast(`Successfully connected to ${name}! Ready for 1-click direct print.`, 'success');
    } catch (err: any) {
      if (!err.message?.includes('User cancelled') && !err.message?.includes('No port selected')) {
        toast(`USB/Serial connection notice: ${err.message}`, 'error');
      }
    } finally {
      setIsConnectingSerial(false);
    }
  };

  const handleDisconnectPrinter = async () => {
    await directPrinterService.disconnect();
    toast('Direct thermal printer disconnected.', 'info');
  };

  const handleTestDirectPrint = async () => {
    setIsTestingPrint(true);
    try {
      await directPrinterService.printTest(settings);
      toast('Test receipt sent directly to printer successfully!', 'success');
    } catch (err: any) {
      toast(`Direct test print failed: ${err.message}`, 'error');
    } finally {
      setIsTestingPrint(false);
    }
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const current = await getShopSettings();
        setSettings(current);

        const meta = await db.sync_meta.get('bills');
        if (meta?.last_synced_at) {
          setLastSyncedTime(formatISTDate(meta.last_synced_at));
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveShopSettings(settings);
      toast('Shop and device settings saved successfully', 'success');
    } catch (err: any) {
      toast(`Failed to save settings: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Download unsynced data as JSON safety net
  const handleDownloadUnsyncedData = async () => {
    try {
      const pendingOutbox = await db.outbox
        .where('status')
        .anyOf('pending', 'failed')
        .toArray();

      const allBills = await db.bills.toArray();
      const allItems = await db.bill_items.toArray();

      const safetyBackup = {
        exported_at: new Date().toISOString(),
        pending_outbox: pendingOutbox,
        bills: allBills,
        bill_items: allItems,
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(safetyBackup, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `crackers_unsynced_backup_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toast('Unsynced data JSON backup downloaded', 'success');
    } catch (err: any) {
      toast(`Export failed: ${err.message}`, 'error');
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-text-muted">Loading settings...</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Shop Information Section */}
        <div className="bg-surface border border-border rounded p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Store size={18} className="text-accent" />
            <h2 className="text-sm font-semibold text-text">Store Profile & Receipt Header</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Retail Shop Name"
              value={settings.shop_name}
              onChange={(e) => setSettings({ ...settings, shop_name: e.target.value })}
              placeholder="VNA Traders"
              required
            />

            <Input
              label="Contact Phone"
              type="tel"
              value={settings.shop_phone}
              onChange={(e) => setSettings({ ...settings, shop_phone: e.target.value })}
              placeholder="+91 94431 23456"
              required
            />
          </div>

          <Input
            label="Shop Address"
            value={settings.shop_address}
            onChange={(e) => setSettings({ ...settings, shop_address: e.target.value })}
            placeholder="142 Kakkan Road, Sivakasi, Tamil Nadu - 626123"
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="GSTIN Number (Optional)"
              value={settings.gst_no}
              onChange={(e) => setSettings({ ...settings, gst_no: e.target.value })}
              placeholder="33VNACK0000A1Z5"
            />

            <Input
              label="Receipt Footer Notice"
              value={settings.receipt_footer}
              onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })}
              placeholder="Thank you for choosing VNA Traders!"
            />
          </div>
        </div>

        {/* Device & Hardware Settings Section */}
        <div className="bg-surface border border-border rounded p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Printer size={18} className="text-accent" />
            <h2 className="text-sm font-semibold text-text">Device & POS Hardware</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                label="Device Code for Bill Sequence"
                value={settings.device_code}
                onChange={(e) => setSettings({ ...settings, device_code: e.target.value.toUpperCase().slice(0, 2) })}
                placeholder="A"
                maxLength={2}
                helperText="Identifier for this billing terminal (A, B, C...). Prevents duplicate bill numbers when offline."
                required
              />
            </div>

            <div>
              <Select
                label="Default Paper Size"
                value={settings.paper_size}
                onChange={(e) => setSettings({ ...settings, paper_size: e.target.value as any })}
              >
                <option value="80mm">80 mm (3-inch) Thermal POS Roll (Standard)</option>
                <option value="58mm">58 mm (2-inch) Compact Thermal Roll</option>
                <option value="a4">Standard A4 Sheet</option>
              </Select>
            </div>
          </div>

          {/* Auto-Print on Save Toggle */}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-text block cursor-pointer">
                Auto-Print Receipt on Saving Bill
              </label>
              <p className="text-[11px] text-text-muted mt-0.5">
                Automatically triggers printing immediately when a bill is saved (or with Ctrl+Enter).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.auto_print ?? true}
                onChange={(e) => setSettings({ ...settings, auto_print: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </label>
          </div>
        </div>

        {/* DIRECT THERMAL PRINTER HARDWARE INTEGRATION */}
        <div className="bg-surface border border-border rounded p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-accent" />
              <h2 className="text-sm font-semibold text-text">Direct Thermal Printer Integration</h2>
            </div>
            {printerStatus.isConnected ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-full border border-emerald-300 dark:border-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Connected: {printerStatus.deviceName}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-text-muted bg-background px-2.5 py-1 rounded border border-border">
                <span className="w-2 h-2 rounded-full bg-text-muted" />
                <span>No Direct Printer Connected</span>
              </span>
            )}
          </div>

          <p className="text-xs text-text-muted leading-relaxed">
            Connect directly to an 80mm or 58mm thermal receipt printer via <strong>Wireless Bluetooth</strong> or <strong>USB / COM cable</strong> to enable 1-click silent direct printing that bypasses the browser print dialog completely.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {/* Bluetooth Option */}
            <div className="p-3.5 border border-border rounded bg-background flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-xs text-text">
                  <Bluetooth size={16} className="text-blue-500" />
                  <span>Wireless Bluetooth Thermal Printer</span>
                </div>
                <p className="text-[11px] text-text-muted">
                  Pairs with portable and desktop Bluetooth POS printers (TVS, Everycom, NGX, POS-80/58).
                </p>
              </div>
              <Button
                type="button"
                variant={printerStatus.connectionType === 'bluetooth' && printerStatus.isConnected ? 'secondary' : 'primary'}
                size="sm"
                onClick={handleConnectBluetooth}
                disabled={isConnectingBluetooth}
                className="w-full text-xs"
              >
                <Bluetooth size={14} />
                <span>
                  {isConnectingBluetooth
                    ? 'Pairing...'
                    : printerStatus.connectionType === 'bluetooth' && printerStatus.isConnected
                    ? 'Re-Pair Bluetooth Printer'
                    : 'Connect Bluetooth Printer'}
                </span>
              </Button>
            </div>

            {/* USB / Serial Option */}
            <div className="p-3.5 border border-border rounded bg-background flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-xs text-text">
                  <Usb size={16} className="text-emerald-500" />
                  <span>USB / Serial Cable Thermal Printer</span>
                </div>
                <p className="text-[11px] text-text-muted">
                  Connects to desktop USB POS thermal receipt printers via Web Serial.
                </p>
              </div>
              <Button
                type="button"
                variant={printerStatus.connectionType === 'serial' && printerStatus.isConnected ? 'secondary' : 'primary'}
                size="sm"
                onClick={handleConnectSerial}
                disabled={isConnectingSerial}
                className="w-full text-xs"
              >
                <Usb size={14} />
                <span>
                  {isConnectingSerial
                    ? 'Connecting...'
                    : printerStatus.connectionType === 'serial' && printerStatus.isConnected
                    ? 'Re-Select USB Printer'
                    : 'Connect USB Printer'}
                </span>
              </Button>
            </div>
          </div>

          {/* Test & Disconnect Actions */}
          {printerStatus.isConnected && (
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-xs text-text font-medium flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-500" />
                <span>Active via {printerStatus.connectionType.toUpperCase()} ({printerStatus.deviceName})</span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleTestDirectPrint}
                  disabled={isTestingPrint}
                  className="text-xs"
                >
                  <Zap size={14} className="text-accent" />
                  <span>{isTestingPrint ? 'Testing...' : 'Test Direct Print'}</span>
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={handleDisconnectPrinter}
                  className="text-xs"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          )}

          {/* Silent Kiosk Printing Note */}
          <div className="p-3 bg-accent-light/40 border border-accent/30 rounded text-xs text-text space-y-1">
            <span className="font-semibold text-accent block flex items-center gap-1">
              <Zap size={13} />
              <span>Pro POS Tip: Chrome Kiosk Silent Printing</span>
            </span>
            <p className="text-[11px] text-text-muted leading-relaxed">
              For billing counters with standard Windows thermal printer drivers, launch Chrome with{' '}
              <code className="bg-background px-1.5 py-0.5 rounded font-mono text-[10px] text-text border border-border">
                --kiosk --kiosk-printing
              </code>
              . The terminal will print silently to your default thermal printer with zero popup dialogs!
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={saving}>
            <Save size={16} />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </Button>
        </div>
      </form>

      {/* OFFLINE SYNC & SAFETY NET PANEL */}
      <div className="bg-surface border border-border rounded p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <RefreshCw size={18} className="text-accent" />
          <h2 className="text-sm font-semibold text-text">Offline Sync & Data Safety</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 bg-background border border-border rounded space-y-1">
            <span className="text-text-muted block">Connection State:</span>
            <span className="font-semibold uppercase text-text">{syncState}</span>
          </div>

          <div className="p-3 bg-background border border-border rounded space-y-1">
            <span className="text-text-muted block">Pending Outbox Items:</span>
            <span className="font-semibold tabular-nums text-text">{pendingCount}</span>
          </div>

          <div className="p-3 bg-background border border-border rounded space-y-1">
            <span className="text-text-muted block">Last Delta Sync:</span>
            <span className="font-semibold text-text">{lastSyncedTime}</span>
          </div>
        </div>

        {lastError && (
          <div className="p-3 bg-danger-light border border-danger/30 rounded text-xs text-danger">
            Last sync error: {lastError}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
          <Button variant="secondary" size="sm" onClick={() => retrySync()}>
            <RefreshCw size={14} />
            <span>Retry Sync Now</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadUnsyncedData}
            title="Download safety backup containing local bills and pending queue"
          >
            <HardDriveDownload size={14} />
            <span>Download Unsynced Data as JSON</span>
          </Button>
        </div>
      </div>

        
      {/* Confirmation Dialog */}
      <Dialog
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Confirm Reset All Local Data"
      >
        <div className="space-y-4 pt-2">
          <p className="text-sm text-text">
            Are you sure you want to wipe all local data? This will:
          </p>
          <ul className="text-xs text-text-muted list-disc list-inside space-y-1">
            <li>Delete all local bills and line items</li>
            <li>Clear the pending sync outbox queue</li>
            <li>Reset brands to default (<strong>Standard</strong> & <strong>General</strong>)</li>
            <li>Re-seed pristine default cracker catalog with accurate brands</li>
          </ul>

          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button
              variant="secondary"
              onClick={() => setIsResetModalOpen(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmReset}
              disabled={isResetting}
            >
              {isResetting ? 'Resetting...' : 'Yes, Wipe & Reset Everything'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
