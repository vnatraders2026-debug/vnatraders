/**
 * VNA Traders Print Service
 * Universal, isolated document printing utility for:
 * 1. A4 Standard Laser / Inkjet Printers (Tax Invoices, Delivery Challans, POs, Sale Orders)
 * 2. 80mm Thermal Receipt Printers (POS Counter Cash Bills)
 * 3. 58mm Mini Mobile Bluetooth Printers
 */

export interface PrintDocumentOptions {
  title?: string;
  paperSize?: 'a4' | '80mm' | '58mm';
  copies?: number;
  autoClose?: boolean;
}

/**
 * Extract clean HTML content and print via an isolated iframe to bypass any screen CSS,
 * scrollbars, fixed dialog overlays, or background artifacts.
 */
export function printFormattedElement(
  target: HTMLElement | string,
  options: PrintDocumentOptions = {}
): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const {
        title = 'VNA Traders Document',
        paperSize = 'a4',
      } = options;

      let contentHtml = '';
      if (typeof target === 'string') {
        const el = document.getElementById(target) || document.querySelector(target);
        if (!el) {
          throw new Error(`Print target element "${target}" not found.`);
        }
        contentHtml = el.innerHTML;
      } else if (target instanceof HTMLElement) {
        contentHtml = target.innerHTML;
      } else {
        throw new Error('Invalid print target provided.');
      }

      // Create an invisible iframe attached to body
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.setAttribute('title', title);
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) {
        document.body.removeChild(iframe);
        throw new Error('Failed to access print frame document.');
      }

      // Paper size specific CSS rules
      let pageCss = '';
      if (paperSize === '80mm') {
        pageCss = `
          @page {
            size: 80mm auto;
            margin: 2mm 3mm;
          }
          body {
            width: 74mm;
            max-width: 74mm;
            margin: 0 auto;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
            font-size: 11px;
            font-weight: 600;
            line-height: 1.35;
            color: #000000;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          table { width: 100%; border-collapse: collapse; }
          .no-print { display: none !important; }
        `;
      } else if (paperSize === '58mm') {
        pageCss = `
          @page {
            size: 58mm auto;
            margin: 1mm 2mm;
          }
          body {
            width: 52mm;
            max-width: 52mm;
            margin: 0 auto;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
            font-size: 9.5px;
            font-weight: 600;
            line-height: 1.25;
            color: #000000;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          table { width: 100%; border-collapse: collapse; }
          .no-print { display: none !important; }
        `;
      } else {
        // A4 Paper format
        pageCss = `
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 10mm 10mm;
          }
          body {
            width: 100%;
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 11px;
            line-height: 1.35;
            color: #111827;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #d1d5db;
            padding: 4px 6px;
          }
          thead {
            display: table-header-group;
          }
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .avoid-break, .avoid-page-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print, button {
            display: none !important;
          }
        `;
      }

      // Collect existing Tailwind & document styles
      let externalStyles = '';
      const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]');
      styleElements.forEach((node) => {
        externalStyles += node.outerHTML;
      });

      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${title}</title>
            ${externalStyles}
            <style>
              ${pageCss}
              /* High contrast overrides for all printer outputs */
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              img {
                max-width: 100% !important;
                height: auto !important;
              }
            </style>
          </head>
          <body>
            ${contentHtml}
          </body>
        </html>
      `);
      iframeDoc.close();

      // Trigger print after styles & images load
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          resolve();
        } catch (printErr) {
          // Fallback to standard window.print if iframe print blocks
          window.print();
          resolve();
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1500);
        }
      }, 350);
    } catch (err) {
      // Fallback
      window.print();
      resolve();
    }
  });
}
