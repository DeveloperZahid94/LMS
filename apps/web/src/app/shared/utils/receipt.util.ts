/**
 * Payment-receipt rendering — produces a print-ready, branded HTML invoice
 * and opens it in a new window. The user picks "Save as PDF" in the browser's
 * print dialog. Keeps the bundle library-free.
 */

export interface ReceiptPayment {
  id: string;
  amount: number;
  method: string;            // CASH | UPI | CARD | NETBANKING | RAZORPAY | OTHER
  status: string;            // PENDING | PAID | FAILED | REFUNDED
  paidAt: string | null;
  createdAt: string;
  notes: string | null;
  student: {
    id: string;
    code: string;
    fullName: string;
    phone: string;
    email: string | null;
  };
  branch?: { id: string; name: string; code: string } | null;
}

export interface ReceiptOrg {
  /** Display name of the tenant, e.g. "Phoenix Academy". Falls back to slug if not supplied. */
  name: string;
  tagline?: string;          // e.g. "Library & Study Cabin"
  address?: string;          // optional multi-line
  contact?: string;          // phone / email / website
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  NETBANKING: 'Net banking',
  RAZORPAY: 'Razorpay',
  OTHER: 'Other',
};

/** RCP-XXXXXXXX based on last 8 chars of payment UUID. */
export function receiptNumber(payment: ReceiptPayment): string {
  const tail = payment.id.replace(/-/g, '').slice(-8).toUpperCase();
  return `RCP-${tail}`;
}

export function printPaymentReceipt(payment: ReceiptPayment, org: ReceiptOrg): void {
  const html = buildReceiptHtml(payment, org);
  const win = window.open('', '_blank', 'width=820,height=900');
  if (!win) {
    // Pop-up blocked — fall back to navigating the current tab.
    window.location.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 150);
}

function buildReceiptHtml(p: ReceiptPayment, org: ReceiptOrg): string {
  const esc = (s: string | null | undefined) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const number = receiptNumber(p);
  const paidAt = p.paidAt || p.createdAt;
  const dateStr = new Date(paidAt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const methodLabel = METHOD_LABELS[p.method] || p.method;
  const amountStr = `₹${Number(p.amount).toLocaleString('en-IN')}`;
  const initials = p.student.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');
  const inWords = numberToIndianWords(Number(p.amount)) + ' rupees only';

  const statusPill = p.status === 'PAID'
    ? '<span class="status status-paid">PAID</span>'
    : p.status === 'PENDING'
      ? '<span class="status status-pending">PENDING</span>'
      : p.status === 'REFUNDED'
        ? '<span class="status status-refunded">REFUNDED</span>'
        : '<span class="status status-failed">' + esc(p.status) + '</span>';

  const orgLogo = (org.name || 'L').trim().charAt(0).toUpperCase();
  const orgAddr = org.address
    ? `<div class="addr">${esc(org.address).replace(/\n/g, '<br>')}</div>`
    : '';
  const orgContact = org.contact ? `<div class="addr">${esc(org.contact)}</div>` : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>Receipt ${esc(number)} — ${esc(p.student.fullName)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif;
    color: #1f2937;
    background: #f3f4f6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    max-width: 780px;
    margin: 24px auto;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.06);
    overflow: hidden;
  }
  /* Header band with diagonal accent */
  .head {
    position: relative;
    padding: 28px 36px 22px;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 60%, #a855f7 100%);
    color: #ffffff;
  }
  .head::after {
    content: '';
    position: absolute;
    right: -60px; top: -60px; width: 200px; height: 200px;
    background: rgba(255,255,255,0.07);
    border-radius: 50%;
  }
  .head-row {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    position: relative; z-index: 1;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 52px; height: 52px; border-radius: 12px;
    background: rgba(255,255,255,0.18); backdrop-filter: blur(4px);
    display: grid; place-items: center;
    font-weight: 700; font-size: 22px; letter-spacing: 0.5px;
    border: 1px solid rgba(255,255,255,0.35);
  }
  .brand-name { font-size: 20px; font-weight: 700; letter-spacing: 0.2px; }
  .brand-tag  { font-size: 12px; opacity: 0.85; margin-top: 2px; }
  .rcpt-meta { text-align: right; font-size: 12px; opacity: 0.95; }
  .rcpt-meta .lbl { opacity: 0.75; text-transform: uppercase; letter-spacing: 1px; font-size: 10px; }
  .rcpt-meta .val { font-weight: 700; font-size: 18px; letter-spacing: 0.5px; margin-top: 2px; }
  .rcpt-meta .date { margin-top: 6px; opacity: 0.85; }

  .title-band {
    padding: 18px 36px;
    border-bottom: 1px solid #e5e7eb;
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  }
  .title {
    font-size: 22px; font-weight: 800; letter-spacing: 1.5px;
    color: #111827;
  }
  .status {
    display: inline-block;
    padding: 5px 14px;
    font-size: 11px; font-weight: 700; letter-spacing: 1px;
    border-radius: 999px;
  }
  .status-paid     { background: #dcfce7; color: #166534; }
  .status-pending  { background: #fef3c7; color: #92400e; }
  .status-refunded { background: #e5e7eb; color: #374151; }
  .status-failed   { background: #fee2e2; color: #991b1b; }

  .parties {
    display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
    padding: 24px 36px; border-bottom: 1px dashed #e5e7eb;
  }
  .party-label {
    font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px;
    color: #6b7280; font-weight: 700; margin-bottom: 8px;
  }
  .party-name { font-size: 16px; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 10px; }
  .avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: #eef2ff; color: #4338ca;
    display: inline-grid; place-items: center;
    font-weight: 700; font-size: 13px;
  }
  .party-meta { color: #4b5563; font-size: 13px; margin-top: 4px; }
  .addr { color: #6b7280; font-size: 12px; margin-top: 4px; line-height: 1.5; }

  .amount-card {
    margin: 24px 36px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    overflow: hidden;
  }
  .amount-card table { width: 100%; border-collapse: collapse; }
  .amount-card th, .amount-card td {
    padding: 12px 16px; text-align: left; font-size: 13px;
    border-bottom: 1px solid #f3f4f6;
  }
  .amount-card th {
    background: #f9fafb; color: #4b5563;
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;
  }
  .amount-card td.right, .amount-card th.right { text-align: right; }
  .amount-card tfoot td {
    background: #fafafa;
    font-weight: 700; font-size: 14px; color: #111827;
    border-bottom: none;
  }
  .amount-card tfoot td.total {
    font-size: 18px;
    color: #4f46e5;
  }
  .words {
    padding: 0 36px 4px;
    color: #6b7280; font-size: 12px; font-style: italic;
  }
  .words strong { color: #1f2937; font-style: normal; }

  .pay-info {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px;
    padding: 18px 36px 8px;
  }
  .pay-info .row { font-size: 13px; }
  .pay-info .lbl { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
  .pay-info .val { color: #1f2937; font-weight: 600; margin-top: 2px; word-break: break-all; }

  .footer {
    display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: end;
    padding: 26px 36px 28px;
    border-top: 1px dashed #e5e7eb;
    margin-top: 12px;
  }
  .sig { text-align: center; }
  .sig-line {
    border-top: 1.5px solid #1f2937;
    height: 1px; margin: 0 auto 6px; width: 200px;
  }
  .sig-label { font-size: 11px; color: #4b5563; letter-spacing: 0.5px; }
  .note { color: #6b7280; font-size: 11px; line-height: 1.6; }
  .note strong { color: #4338ca; }

  .stamp {
    position: absolute;
    right: 60px; top: 240px;
    border: 3px solid #16a34a; color: #16a34a;
    padding: 6px 18px;
    font-weight: 800; font-size: 22px; letter-spacing: 4px;
    transform: rotate(-12deg);
    opacity: 0.18;
    border-radius: 8px;
    pointer-events: none;
  }
  .page-wrap { position: relative; }

  .toolbar {
    max-width: 780px;
    margin: 0 auto 12px;
    padding: 0 4px;
    display: flex; justify-content: flex-end; gap: 8px;
  }
  .btn {
    background: #4f46e5; color: #ffffff;
    border: none; border-radius: 8px;
    padding: 8px 16px; font-size: 13px; font-weight: 600;
    cursor: pointer;
  }
  .btn.ghost {
    background: transparent; color: #4f46e5; border: 1px solid #c7d2fe;
  }

  @media print {
    body { background: #ffffff; }
    .page { box-shadow: none; margin: 0; border-radius: 0; }
    .toolbar { display: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn ghost" onclick="window.close()">Close</button>
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="page-wrap">
  <div class="page">
    <div class="head">
      <div class="head-row">
        <div class="brand">
          <div class="logo">${esc(orgLogo)}</div>
          <div>
            <div class="brand-name">${esc(org.name)}</div>
            <div class="brand-tag">${esc(org.tagline || 'Library & Study Cabin')}</div>
          </div>
        </div>
        <div class="rcpt-meta">
          <div class="lbl">Receipt No.</div>
          <div class="val">${esc(number)}</div>
          <div class="date">${esc(dateStr)}</div>
        </div>
      </div>
    </div>

    <div class="title-band">
      <div class="title">PAYMENT RECEIPT</div>
      ${statusPill}
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Received from</div>
        <div class="party-name">
          <span class="avatar">${esc(initials)}</span>
          ${esc(p.student.fullName)}
        </div>
        <div class="party-meta">${esc(p.student.code)} · ${esc(p.student.phone)}</div>
        ${p.student.email ? `<div class="addr">${esc(p.student.email)}</div>` : ''}
      </div>
      <div class="party" style="text-align:right;">
        <div class="party-label">Issued by</div>
        <div class="party-name" style="justify-content:flex-end;">${esc(org.name)}</div>
        ${p.branch ? `<div class="party-meta">Branch: ${esc(p.branch.name)} (${esc(p.branch.code)})</div>` : ''}
        ${orgAddr}
        ${orgContact}
      </div>
    </div>

    <div class="amount-card">
      <table>
        <thead>
          <tr><th>Description</th><th class="right">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div style="font-weight:600;">Library / Study cabin fee</div>
              <div style="font-size:12px;color:#6b7280;margin-top:2px;">
                Payment received via ${esc(methodLabel)}${p.notes ? ' · Ref: ' + esc(p.notes) : ''}
              </div>
            </td>
            <td class="right">${esc(amountStr)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="right">Total Paid</td>
            <td class="right total">${esc(amountStr)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="words"><strong>In words:</strong> ${esc(capitalize(inWords))}</div>

    <div class="pay-info">
      <div class="row">
        <div class="lbl">Payment Method</div>
        <div class="val">${esc(methodLabel)}</div>
      </div>
      <div class="row">
        <div class="lbl">Status</div>
        <div class="val">${esc(p.status)}</div>
      </div>
      <div class="row">
        <div class="lbl">Reference / Notes</div>
        <div class="val">${esc(p.notes || '—')}</div>
      </div>
      <div class="row">
        <div class="lbl">Transaction ID</div>
        <div class="val" style="font-family:ui-monospace,Menlo,monospace;font-size:11px;">${esc(p.id)}</div>
      </div>
    </div>

    <div class="footer">
      <div class="note">
        Thank you for your payment.<br>
        This is a <strong>computer-generated receipt</strong> and does not require a physical signature.
      </div>
      <div class="sig">
        <div class="sig-line"></div>
        <div class="sig-label">Authorized Signatory</div>
      </div>
    </div>
  </div>
  ${p.status === 'PAID' ? '<div class="stamp">PAID</div>' : ''}
  </div>
</body></html>`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Converts a non-negative integer rupee amount to Indian-English words.
 * e.g. 12345 -> "twelve thousand three hundred forty-five".
 * Decimal paisa is intentionally ignored — fees in this app are whole rupees.
 */
function numberToIndianWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zero';

  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen',
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  const twoDigits = (num: number): string => {
    if (num < 20) return ones[num];
    const t = Math.floor(num / 10);
    const o = num % 10;
    return o === 0 ? tens[t] : `${tens[t]}-${ones[o]}`;
  };

  const threeDigits = (num: number): string => {
    const h = Math.floor(num / 100);
    const rest = num % 100;
    const out: string[] = [];
    if (h) out.push(`${ones[h]} hundred`);
    if (rest) out.push(twoDigits(rest));
    return out.join(' ');
  };

  const parts: string[] = [];
  // Indian numbering: ... crore, lakh, thousand, hundred
  const crore = Math.floor(n / 10000000); n = n % 10000000;
  const lakh = Math.floor(n / 100000);    n = n % 100000;
  const thousand = Math.floor(n / 1000);  n = n % 1000;
  const remainder = n;

  if (crore)    parts.push(`${threeDigits(crore)} crore`);
  if (lakh)     parts.push(`${twoDigits(lakh)} lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} thousand`);
  if (remainder) parts.push(threeDigits(remainder));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
