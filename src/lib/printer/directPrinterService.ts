import { Bill, BillItem, ShopSettings } from '@/types';
import { buildEscPosReceipt, buildTestReceipt } from './escpos';

export type PrinterConnectionType = 'bluetooth' | 'serial' | 'none';

export interface PrinterStatus {
  isConnected: boolean;
  deviceName: string;
  connectionType: PrinterConnectionType;
  lastError?: string;
}

class DirectPrinterService {
  // Web Bluetooth handles
  private bluetoothDevice: any = null;
  private bluetoothCharacteristic: any = null;

  // Web Serial handles
  private serialPort: any = null;
  private serialWriter: any = null;

  private status: PrinterStatus = {
    isConnected: false,
    deviceName: '',
    connectionType: 'none',
  };

  private listeners = new Set<(status: PrinterStatus) => void>();

  constructor() {
    this.restoreSavedDevice();
  }

  private restoreSavedDevice() {
    const savedName = localStorage.getItem('vna_printer_name');
    const savedType = localStorage.getItem('vna_printer_type') as PrinterConnectionType;
    if (savedName && savedType && savedType !== 'none') {
      this.status.deviceName = savedName;
      this.status.connectionType = savedType;
      // Note: Actual device connection requires user activation gesture in browser, but we remember pairing
    }
  }

  public getStatus(): PrinterStatus {
    return { ...this.status };
  }

  public isConnected(): boolean {
    return this.status.isConnected;
  }

  public subscribe(callback: (status: PrinterStatus) => void) {
    this.listeners.add(callback);
    callback(this.getStatus());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    const s = this.getStatus();
    for (const l of this.listeners) {
      l(s);
    }
  }

  /**
   * Connect to a thermal printer via Web Bluetooth
   */
  public async connectBluetooth(): Promise<string> {
    if (!('bluetooth' in navigator)) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Chrome for Android.'
      );
    }

    try {
      // Common Bluetooth Printer Service UUIDs
      const PRINTER_SERVICES = [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
        '0000ffe0-0000-1000-8000-00805f9b34fb', // Common POS BLE Service
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Service
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Android / Mobile POS
      ];

      // Request device from user picker
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINTER_SERVICES,
      });

      if (!device) throw new Error('No printer device selected.');

      // Disconnect any existing session
      await this.disconnect();

      device.addEventListener('gattserverdisconnected', () => {
        this.status.isConnected = false;
        this.bluetoothCharacteristic = null;
        this.notify();
      });

      const server = await device.gatt.connect();

      // Find writable characteristic across common printer services
      let targetChar: any = null;
      for (const serviceUuid of PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              targetChar = char;
              break;
            }
          }
          if (targetChar) break;
        } catch {
          // Continue searching other services
        }
      }

      if (!targetChar) {
        // Fallback: search all available services
        const services = await server.getPrimaryServices();
        for (const s of services) {
          const chars = await s.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              targetChar = c;
              break;
            }
          }
          if (targetChar) break;
        }
      }

      if (!targetChar) {
        throw new Error('Could not find a writable printer characteristic on this Bluetooth device.');
      }

      this.bluetoothDevice = device;
      this.bluetoothCharacteristic = targetChar;
      const deviceName = device.name || 'Bluetooth Thermal Printer';

      this.status = {
        isConnected: true,
        deviceName,
        connectionType: 'bluetooth',
      };

      localStorage.setItem('vna_printer_name', deviceName);
      localStorage.setItem('vna_printer_type', 'bluetooth');
      this.notify();

      return deviceName;
    } catch (err: any) {
      this.status.lastError = err?.message;
      this.notify();
      throw err;
    }
  }

  /**
   * Connect to a thermal printer via Web Serial / USB
   */
  public async connectSerial(baudRate = 9600): Promise<string> {
    if (!('serial' in navigator)) {
      throw new Error(
        'Web Serial (USB/COM) is not supported in this browser. Please use Chrome or Edge.'
      );
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await this.disconnect();

      await port.open({ baudRate });
      this.serialPort = port;
      this.serialWriter = port.writable.getWriter();

      const deviceName = 'USB/COM Thermal Printer';
      this.status = {
        isConnected: true,
        deviceName,
        connectionType: 'serial',
      };

      localStorage.setItem('vna_printer_name', deviceName);
      localStorage.setItem('vna_printer_type', 'serial');
      this.notify();

      return deviceName;
    } catch (err: any) {
      this.status.lastError = err?.message;
      this.notify();
      throw err;
    }
  }

  /**
   * Disconnect any active printer connection
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.bluetoothDevice && this.bluetoothDevice.gatt?.connected) {
        this.bluetoothDevice.gatt.disconnect();
      }
      this.bluetoothDevice = null;
      this.bluetoothCharacteristic = null;

      if (this.serialWriter) {
        await this.serialWriter.close();
        this.serialWriter = null;
      }
      if (this.serialPort) {
        await this.serialPort.close();
        this.serialPort = null;
      }
    } catch (err) {
      console.warn('Disconnect notice:', err);
    } finally {
      this.status.isConnected = false;
      this.notify();
    }
  }

  /**
   * Send raw byte buffer to connected thermal printer
   */
  public async printBytes(bytes: Uint8Array): Promise<void> {
    if (!this.status.isConnected) {
      throw new Error('No direct thermal printer is connected.');
    }

    if (this.status.connectionType === 'bluetooth' && this.bluetoothCharacteristic) {
      // Bluetooth MTU slicing: send in 100-byte chunks with small delay
      const chunkSize = 100;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        if (this.bluetoothCharacteristic.writeValueWithoutResponse) {
          await this.bluetoothCharacteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.bluetoothCharacteristic.writeValue(chunk);
        }
        await new Promise((r) => setTimeout(r, 20));
      }
    } else if (this.status.connectionType === 'serial' && this.serialWriter) {
      await this.serialWriter.write(bytes);
    } else {
      throw new Error('Printer channel not ready.');
    }
  }

  /**
   * Direct print a Bill
   */
  public async printBillDirect(
    bill: Bill,
    items: BillItem[],
    settings: ShopSettings,
    billedBy?: string,
    showScanPay = true
  ): Promise<{ success: boolean; printerName?: string }> {
    if (!this.status.isConnected) {
      return { success: false };
    }

    const bytes = buildEscPosReceipt(bill, items, settings, billedBy, showScanPay);
    await this.printBytes(bytes);
    return { success: true, printerName: this.status.deviceName };
  }

  /**
   * Print a test slip to verify connection
   */
  public async printTest(settings: ShopSettings): Promise<void> {
    const bytes = buildTestReceipt(settings);
    await this.printBytes(bytes);
  }
}

export const directPrinterService = new DirectPrinterService();
