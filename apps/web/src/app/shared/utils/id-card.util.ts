/**
 * Student ID-card (i-card) printing.
 *
 * Renders a polished, print-ready membership card with the student's photo,
 * details and a QR code (encoding their attendance token) into a new window,
 * then opens the print dialog. The QR is generated locally as a data-URL via
 * the `qrcode` package, so it works fully offline and embeds cleanly in print.
 */
import * as QRCode from 'qrcode';

export interface IdCardStudent {
  fullName: string;
  code: string;
  phone: string;
  photoUrl: string | null;
  qrCode: string;            // attendance token encoded in the QR
  examTarget?: string | null;
  expiresAt?: string | null;
  gender?: string | null;
  branchName?: string | null;
}

export interface IdCardOrg {
  name: string;
  tagline?: string;
  contact?: string;
}

export async function printStudentIdCard(student: IdCardStudent, org: IdCardOrg): Promise<void> {
  // Encode a vCard so a phone camera recognises it and shows the student's
  // details (name, phone, org) as a contact card. The NOTE keeps code / exam /
  // validity and the attendance `Ref` token for the entry scanner to parse.
  const validTill = student.expiresAt
    ? new Date(student.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const vEsc = (v: string | null | undefined) =>
    String(v ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const note = [
    `Code: ${student.code}`,
    student.examTarget ? `Exam: ${student.examTarget}` : null,
    student.branchName ? `Branch: ${student.branchName}` : null,
    validTill ? `Valid till: ${validTill}` : null,
    `Ref: ${student.qrCode}`,
  ].filter(Boolean).join('\n');
  const qrPayload = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${vEsc(student.fullName)}`,
    `N:${vEsc(student.fullName)};;;;`,
    `ORG:${vEsc(org.name)}`,
    `TITLE:${vEsc('Student · ' + student.code)}`,
    student.phone ? `TEL;TYPE=CELL:${vEsc(student.phone)}` : null,
    `NOTE:${vEsc(note)}`,
    'END:VCARD',
  ].filter(Boolean).join('\r\n');

  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    // More data → denser QR; higher EC keeps it scannable even if slightly worn.
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#1e1b4b', light: '#ffffff' },
  });
  const html = buildCardHtml(student, org, qrDataUrl);

  const win = window.open('', '_blank', 'width=520,height=760');
  if (!win) {
    window.location.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 200);
}

function buildCardHtml(s: IdCardStudent, org: IdCardOrg, qrDataUrl: string): string {
  const esc = (v: string | null | undefined) =>
    (v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const initials = s.fullName.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  const orgLogo = (org.name || 'L').trim().charAt(0).toUpperCase();
  const validTill = s.expiresAt
    ? new Date(s.expiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  const photoBlock = s.photoUrl
    ? `<img class="photo" src="${esc(s.photoUrl)}" alt="photo" />`
    : `<div class="photo photo-fallback">${esc(initials)}</div>`;

  const row = (label: string, value: string) =>
    `<div class="row"><span class="row-l">${esc(label)}</span><span class="row-v">${esc(value)}</span></div>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<title>ID Card — ${esc(s.fullName)} (${esc(s.code)})</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif;
    background: #eef2f7; color: #1f2937;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    display: flex; flex-direction: column; align-items: center; padding: 24px;
  }
  .toolbar { display: flex; gap: 8px; margin-bottom: 18px; }
  .btn { background: #4f46e5; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn.ghost { background: transparent; color: #4f46e5; border: 1px solid #c7d2fe; }

  /* CR80-ish portrait card (54mm x 86mm), scaled up for screen/print clarity */
  .card {
    width: 320px; min-height: 510px;
    background: #ffffff;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 12px 32px rgba(31,41,55,0.18);
    position: relative;
    display: flex; flex-direction: column;
  }
  .head {
    position: relative;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #a855f7 100%);
    color: #fff; padding: 18px 20px 56px; text-align: center;
  }
  .head::after {
    content: ''; position: absolute; left: -40px; bottom: -50px; width: 160px; height: 160px;
    background: rgba(255,255,255,0.08); border-radius: 50%;
  }
  .brand { display: flex; align-items: center; justify-content: center; gap: 10px; position: relative; z-index: 1; }
  .logo { width: 34px; height: 34px; border-radius: 9px; background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.4); display: grid; place-items: center; font-weight: 700; font-size: 16px; }
  .brand-name { font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
  .brand-tag { font-size: 10px; opacity: 0.9; margin-top: 2px; position: relative; z-index: 1; }

  .photo-wrap { display: flex; justify-content: center; margin-top: -42px; position: relative; z-index: 2; }
  .photo, .photo-fallback {
    width: 96px; height: 96px; border-radius: 50%; object-fit: cover;
    border: 4px solid #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.15); background: #eef2ff;
  }
  .photo-fallback { display: grid; place-items: center; font-size: 30px; font-weight: 700; color: #4338ca; }

  .name { text-align: center; font-size: 19px; font-weight: 800; color: #111827; margin: 10px 16px 2px; }
  .code { text-align: center; }
  .code span { display: inline-block; font-family: ui-monospace, Menlo, monospace; font-size: 12px; font-weight: 700;
               letter-spacing: 1px; color: #4338ca; background: #eef2ff; padding: 3px 10px; border-radius: 999px; }

  .info { padding: 14px 22px 4px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px dashed #eceef2; font-size: 12.5px; }
  .row:last-child { border-bottom: none; }
  .row-l { color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; font-weight: 700; padding-top: 2px; }
  .row-v { color: #1f2937; font-weight: 600; text-align: right; }

  .qr-wrap { margin-top: auto; display: flex; align-items: center; gap: 12px; padding: 14px 22px 18px; }
  .qr { width: 78px; height: 78px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 4px; background: #fff; }
  .qr-cap { font-size: 10.5px; color: #6b7280; line-height: 1.5; }
  .qr-cap strong { color: #1f2937; display: block; font-size: 12px; }

  .foot { background: #111827; color: #fff; text-align: center; font-size: 9.5px; letter-spacing: 0.8px;
          padding: 7px; text-transform: uppercase; }

  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .card { box-shadow: none; border: 1px solid #e5e7eb; margin: 10mm auto; }
    @page { margin: 8mm; }
  }
</style>
</head><body>
  <div class="toolbar">
    <button class="btn ghost" onclick="window.close()">Close</button>
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="card">
    <div class="head">
      <div class="brand">
        <div class="logo">${esc(orgLogo)}</div>
        <div class="brand-name">${esc(org.name)}</div>
      </div>
      <div class="brand-tag">${esc(org.tagline || 'Library & Study Cabin')}</div>
    </div>

    <div class="photo-wrap">${photoBlock}</div>
    <div class="name">${esc(s.fullName)}</div>
    <div class="code"><span>${esc(s.code)}</span></div>

    <div class="info">
      ${row('Phone', s.phone || '—')}
      ${s.examTarget ? row('Preparing for', s.examTarget) : ''}
      ${s.branchName ? row('Branch', s.branchName) : ''}
      ${s.gender ? row('Gender', s.gender) : ''}
      ${row('Valid till', validTill)}
    </div>

    <div class="qr-wrap">
      <img class="qr" src="${qrDataUrl}" alt="QR" />
      <div class="qr-cap">
        <strong>Scan to view details</strong>
        Scan with any phone camera to see this student's details.${org.contact ? '<br>' + esc(org.contact) : ''}
      </div>
    </div>

    <div class="foot">${esc(org.name)} · Membership Card</div>
  </div>
</body></html>`;
}
