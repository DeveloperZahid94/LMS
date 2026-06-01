/**
 * Lightweight export helpers — no third-party libraries.
 *  - exportCsv(): builds a UTF-8 BOM CSV and triggers a download.
 *  - exportPdf(): opens a print-friendly window so the user saves as PDF.
 */

export interface ExportColumn<T> {
  /** Column header shown in CSV / PDF table */
  header: string;
  /** Cell extractor; should return a primitive or string. null/undefined render as empty. */
  value: (row: T) => string | number | boolean | Date | null | undefined;
}

export interface ExportMeta {
  /** Document/file title, e.g. "Payments report" */
  title: string;
  /** Human-readable subtitle line, e.g. "01 Jun 2026 – 30 Jun 2026 · Branch: Main" */
  subtitle?: string;
  /** File slug (no extension) — defaults to slugified title + today */
  fileSlug?: string;
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function csvEscape(s: string): string {
  if (s == null) return '';
  const needsQuotes = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

export function exportCsv<T>(rows: T[], columns: ExportColumn<T>[], meta: ExportMeta): void {
  const lines: string[] = [];
  lines.push(columns.map((c) => csvEscape(c.header)).join(','));
  for (const r of rows) {
    lines.push(columns.map((c) => csvEscape(fmtCell(c.value(r)))).join(','));
  }
  // UTF-8 BOM so Excel opens INR symbols / unicode correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${meta.fileSlug ?? slug(meta.title)}-${todayStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Opens a new window with a print-friendly HTML report and invokes window.print().
 * The user picks "Save as PDF" in the browser's print dialog.
 * This avoids shipping a 500KB+ PDF library; quality is identical.
 */
export function exportPdf<T>(rows: T[], columns: ExportColumn<T>[], meta: ExportMeta): void {
  const html = buildPrintableHtml(rows, columns, meta);
  const win = window.open('', '_blank', 'width=1024,height=768');
  if (!win) {
    // Pop-up was blocked — fall back to data URL navigation in current tab.
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    window.location.href = url;
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Wait for fonts/layout before triggering print.
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 100);
  };
}

function buildPrintableHtml<T>(rows: T[], columns: ExportColumn<T>[], meta: ExportMeta): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const thead = `<tr>${columns.map((c) => `<th>${escapeHtml(c.header)}</th>`).join('')}</tr>`;
  const tbody = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${escapeHtml(fmtCell(c.value(r)))}</td>`).join('')}</tr>`)
    .join('');

  const now = new Date().toLocaleString();
  const sub = meta.subtitle ? `<div class="sub">${escapeHtml(meta.subtitle)}</div>` : '';

  return `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <title>${escapeHtml(meta.title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    .sub { color: #555; font-size: 12px; margin-bottom: 4px; }
    .meta { color: #888; font-size: 11px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f4f4f5; font-weight: 600; }
    tr:nth-child(even) td { background: #fafafa; }
    .empty { text-align: center; color: #888; padding: 32px; }
    @media print {
      body { padding: 0; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head><body>
  <h1>${escapeHtml(meta.title)}</h1>
  ${sub}
  <div class="meta">Generated ${escapeHtml(now)} · ${rows.length} row${rows.length === 1 ? '' : 's'}</div>
  ${
    rows.length === 0
      ? '<div class="empty">No records match the selected filters.</div>'
      : `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`
  }
</body></html>`;
}

/** Formats an ISO date string (or Date) as DD-MMM-YYYY; returns '' for null/undefined. */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Formats an ISO date-time string (or Date) as DD-MMM-YYYY HH:mm; returns '' for null/undefined. */
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
