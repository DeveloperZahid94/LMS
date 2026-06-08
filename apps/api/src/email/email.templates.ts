export type EmailTemplateKey = 'TEST' | 'WELCOME' | 'PAYMENT_RECEIPT' | 'PAYMENT_REMINDER';

export interface RenderedEmail {
  subject: string;
  html: string;
}

/** Shared branded wrapper so every template looks consistent. */
function wrap(orgName: string, title: string, bodyHtml: string): string {
  return `
  <div style="background:#f4f6fb;padding:24px 0;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(90deg,#4f46e5,#0ea5e9);padding:18px 24px;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;">${orgName}</div>
      </div>
      <div style="padding:24px;">
        <h1 style="margin:0 0 12px;font-size:20px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding:14px 24px;border-top:1px solid #f0f2f6;color:#9ca3af;font-size:12px;">
        Sent by ${orgName} · Library & Study Cabin Management
      </div>
    </div>
  </div>`;
}

const money = (n: unknown) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

/**
 * Ready-made email templates. `data.orgName` is the tenant/brand name; other
 * fields depend on the template.
 */
export function renderEmailTemplate(key: EmailTemplateKey, data: Record<string, any>): RenderedEmail {
  const org = data.orgName || 'LMS Platform';
  switch (key) {
    case 'WELCOME':
      return {
        subject: `Welcome to ${org}, ${data.fullName ?? 'student'}!`,
        html: wrap(org, `Welcome aboard 🎉`, `
          <p>Hi ${data.fullName ?? 'there'},</p>
          <p>Your registration at <strong>${org}</strong> is confirmed. Your student code is
            <strong>${data.code ?? '—'}</strong>.</p>
          <p>You can check in at the desk using your code and phone number. See you soon!</p>
        `),
      };
    case 'PAYMENT_RECEIPT':
      return {
        subject: `Payment received — ${money(data.amount)} · ${org}`,
        html: wrap(org, `Payment receipt`, `
          <p>Hi ${data.fullName ?? 'there'},</p>
          <p>We've received your payment. Thank you!</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
            <tr><td style="padding:6px 0;color:#6b7280;">Amount</td><td style="text-align:right;font-weight:700;">${money(data.amount)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Method</td><td style="text-align:right;">${data.method ?? '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Receipt #</td><td style="text-align:right;">${data.receiptNo ?? '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="text-align:right;">${data.date ?? '—'}</td></tr>
          </table>
          <p style="color:#6b7280;font-size:13px;">Keep this email as your receipt.</p>
        `),
      };
    case 'PAYMENT_REMINDER':
      return {
        subject: `Payment ${data.overdue ? 'overdue' : 'due'} — ${org}`,
        html: wrap(org, `Payment ${data.overdue ? 'overdue' : 'reminder'}`, `
          <p>Hi ${data.fullName ?? 'there'},</p>
          <p>This is a friendly reminder that your monthly fee of <strong>${money(data.amount)}</strong>
             is ${data.overdue ? '<strong style="color:#dc2626;">overdue</strong>' : `due on <strong>${data.dueDate ?? 'soon'}</strong>`}.</p>
          <p>Please clear your dues at the desk to keep your seat/PG allocation active. Thank you!</p>
        `),
      };
    case 'TEST':
    default:
      return {
        subject: `Test email from ${org}`,
        html: wrap(org, `It works! ✅`, `
          <p>This is a test email confirming your <strong>${data.provider ?? 'email'}</strong> integration is configured correctly.</p>
          <p style="color:#6b7280;font-size:13px;">Sent at ${data.now ?? new Date().toISOString()}.</p>
        `),
      };
  }
}
