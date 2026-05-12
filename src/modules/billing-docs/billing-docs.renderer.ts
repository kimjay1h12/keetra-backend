import type { BillingComputedTotals, BillingDocPayload, BillingLineItem } from './billing-docs.types';

export const BILLING_STYLE_KEYS = ['classic', 'minimal', 'modern'] as const;
export type BillingStyleKey = (typeof BILLING_STYLE_KEYS)[number];

export function isBillingStyleKey(k: string): k is BillingStyleKey {
  return (BILLING_STYLE_KEYS as readonly string[]).includes(k);
}

type BillingPalette = {
  accent: string;
  accentSoft: string;
  accentDeep: string;
  text: string;
  muted: string;
  border: string;
  bg: string;
  card: string;
  theadBg: string;
  rowStripe: string;
  totalBg: string;
  receiptBannerBg: string;
  receiptBannerBorder: string;
  receiptBannerText: string;
  invoiceDueBg: string;
  shadow: string;
};

const PALETTE: Record<BillingStyleKey, BillingPalette> = {
  classic: {
    accent: '#1a73e8',
    accentSoft: '#e8f1fe',
    accentDeep: '#1557b0',
    text: '#111827',
    muted: '#64748b',
    border: '#e2e8f0',
    bg: '#eef2f7',
    card: '#ffffff',
    theadBg: '#f1f5f9',
    rowStripe: '#f8fafc',
    totalBg: '#f8fafc',
    receiptBannerBg: '#ecfdf5',
    receiptBannerBorder: '#6ee7b7',
    receiptBannerText: '#065f46',
    invoiceDueBg: '#fffbeb',
    shadow: '0 4px 24px rgba(15,23,42,.08), 0 1px 3px rgba(15,23,42,.06)',
  },
  minimal: {
    accent: '#111827',
    accentSoft: '#f3f4f6',
    accentDeep: '#030712',
    text: '#111827',
    muted: '#6b7280',
    border: '#e5e7eb',
    bg: '#fafafa',
    card: '#ffffff',
    theadBg: '#fafafa',
    rowStripe: '#f9fafb',
    totalBg: '#fafafa',
    receiptBannerBg: '#f0fdf4',
    receiptBannerBorder: '#bbf7d0',
    receiptBannerText: '#14532d',
    invoiceDueBg: '#fffbeb',
    shadow: '0 2px 16px rgba(0,0,0,.06)',
  },
  modern: {
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    accentDeep: '#0d9488',
    text: '#0f172a',
    muted: '#475569',
    border: '#cbd5e1',
    bg: '#e8eef4',
    card: '#ffffff',
    theadBg: '#f0fdfa',
    rowStripe: '#f8fafc',
    totalBg: '#f0fdfa',
    receiptBannerBg: '#ecfdf5',
    receiptBannerBorder: '#5eead4',
    receiptBannerText: '#134e4a',
    invoiceDueBg: '#fff7ed',
    shadow: '0 8px 30px rgba(15,118,110,.12), 0 2px 8px rgba(15,23,42,.06)',
  },
};

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function computeTotals(payload: BillingDocPayload): BillingComputedTotals {
  const subtotal = payload.lineItems.reduce((s, row) => s + Math.max(0, row.quantity) * Math.max(0, row.unitPrice), 0);
  const discount = Math.max(0, payload.discount ?? 0);
  const taxable = Math.max(0, subtotal - discount);
  const rate = Math.min(100, Math.max(0, payload.taxRate ?? 0));
  const tax = Math.round(taxable * (rate / 100) * 100) / 100;
  const total = Math.round((taxable + tax) * 100) / 100;
  return { subtotal, discount, taxable, tax, total };
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  return escapeHtml(d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
}

function lineRows(items: BillingLineItem[], currency: string, p: BillingPalette): string {
  return items
    .map((row, i) => {
      const line = Math.max(0, row.quantity) * Math.max(0, row.unitPrice);
      const stripe = i % 2 === 1 ? `background:${p.rowStripe};` : '';
      return `<tr style="${stripe}">
        <td style="padding:12px 12px;border-bottom:1px solid ${p.border};font-size:13px;line-height:1.45;color:${p.text};">${escapeHtml(row.description)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid ${p.border};text-align:right;font-size:13px;color:${p.muted};white-space:nowrap;">${escapeHtml(String(row.quantity))}</td>
        <td style="padding:12px 10px;border-bottom:1px solid ${p.border};text-align:right;font-size:13px;color:${p.muted};white-space:nowrap;">${escapeHtml(money(row.unitPrice, currency))}</td>
        <td style="padding:12px 12px;border-bottom:1px solid ${p.border};text-align:right;font-size:13px;font-weight:700;color:${p.text};white-space:nowrap;">${escapeHtml(money(line, currency))}</td>
      </tr>`;
    })
    .join('');
}

export function renderBillingHtml(payload: BillingDocPayload, styleKey: BillingStyleKey): string {
  const p = PALETTE[styleKey];
  const totals = computeTotals(payload);
  const isInvoice = payload.documentType === 'invoice';
  const title = isInvoice ? 'Invoice' : 'Receipt';
  const docLabel = isInvoice ? 'Invoice' : 'Receipt';

  const dueBlock =
    isInvoice && payload.dueDate?.trim()
      ? `<tr><td style="padding:6px 0;color:${p.muted};font-size:13px;">Due date</td><td style="padding:6px 0;text-align:right;font-size:13px;font-weight:700;color:${p.text};">${formatDate(payload.dueDate)}</td></tr>`
      : !isInvoice
        ? `<tr><td style="padding:6px 0;color:${p.muted};font-size:13px;">Status</td><td style="padding:6px 0;text-align:right;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${p.receiptBannerBg};color:${p.receiptBannerText};font-size:12px;font-weight:700;">Paid</span></td></tr>`
        : '';

  const taxRow =
    (payload.taxRate ?? 0) > 0
      ? `<tr><td style="padding:8px 0;color:${p.muted};font-size:14px;">Tax (${escapeHtml(String(payload.taxRate))}%)</td><td style="padding:8px 0;text-align:right;font-size:14px;font-weight:600;">${escapeHtml(money(totals.tax, payload.currency))}</td></tr>`
      : '';

  const discountRow =
    totals.discount > 0
      ? `<tr><td style="padding:8px 0;color:${p.muted};font-size:14px;">Discount</td><td style="padding:8px 0;text-align:right;font-size:14px;font-weight:600;">− ${escapeHtml(money(totals.discount, payload.currency))}</td></tr>`
      : '';

  const receiptBannerHtml = !isInvoice
    ? `<div style="padding:14px 18px;border-radius:12px;background:${p.receiptBannerBg};border:1px solid ${p.receiptBannerBorder};color:${p.receiptBannerText};font-size:14px;font-weight:600;line-height:1.5;">
        <span style="font-size:18px;line-height:0;vertical-align:-2px;margin-right:6px;">&#10003;</span>Thank you — your payment has been recorded on this receipt.
      </div>`
    : '';

  const invoiceDueBannerHtml =
    isInvoice && payload.dueDate?.trim()
      ? `<div style="padding:14px 18px;border-radius:12px;background:${p.invoiceDueBg};border-left:4px solid ${p.accent};font-size:14px;color:${p.text};line-height:1.5;">
        <span style="font-weight:800;color:${p.accentDeep};">Balance due</span> by ${formatDate(payload.dueDate)}.
      </div>`
      : '';

  const notes = payload.notes?.trim()
    ? `<div style="margin-top:22px;padding:16px 18px;border-radius:12px;background:${p.rowStripe};border-left:4px solid ${p.accent};font-size:13px;color:${p.text};line-height:1.55;">${escapeHtml(payload.notes)}</div>`
    : '';

  const pay = payload.paymentInstructions?.trim()
    ? `<div style="margin-top:18px;padding:18px 20px;border-radius:12px;background:${p.accentSoft};border:1px solid ${p.border};font-size:13px;color:${p.text};line-height:1.6;">
        <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${p.accent};font-weight:800;margin-bottom:8px;">How to pay</div>
        ${escapeHtml(payload.paymentInstructions).replace(/\n/g, '<br/>')}
      </div>`
    : '';

  const statusBannerBlock = `${receiptBannerHtml}${invoiceDueBannerHtml}`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${docLabel} ${escapeHtml(payload.documentNumber)}</title></head>
<body style="margin:0;padding:28px 16px;background:${p.bg};font-family:Segoe UI,system-ui,-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;color:${p.text};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;margin:0 auto;">
    <tr><td>
      <table width="100%" cellspacing="0" cellpadding="0" style="background:${p.card};border-radius:16px;box-shadow:${p.shadow};overflow:hidden;border:1px solid ${p.border};">
        <tr><td style="height:6px;background:${p.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 28px 22px;border-bottom:1px solid ${p.border};">
          <table width="100%" cellspacing="0" cellpadding="0"><tr>
            <td style="vertical-align:top;width:58%;">
              <div style="display:inline-block;padding:4px 10px;border-radius:6px;background:${p.accentSoft};color:${p.accentDeep};font-size:10px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;">${title}</div>
              <div style="font-size:26px;font-weight:800;margin-top:10px;letter-spacing:-.02em;line-height:1.15;color:${p.text};">${escapeHtml(payload.sellerName)}</div>
              ${payload.sellerAddress ? `<div style="font-size:13px;color:${p.muted};margin-top:10px;line-height:1.5;">${escapeHtml(payload.sellerAddress).replace(/\n/g, '<br/>')}</div>` : ''}
              ${payload.sellerEmail ? `<div style="font-size:13px;color:${p.muted};margin-top:6px;"><a href="mailto:${encodeURIComponent(payload.sellerEmail)}" style="color:${p.accent};text-decoration:none;">${escapeHtml(payload.sellerEmail)}</a></div>` : ''}
              ${payload.taxId ? `<div style="font-size:12px;color:${p.muted};margin-top:8px;padding-top:8px;border-top:1px dashed ${p.border};">Tax ID: <strong style="color:${p.text};">${escapeHtml(payload.taxId)}</strong></div>` : ''}
            </td>
            <td style="vertical-align:top;text-align:right;width:42%;">
              <table width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;">
                <tr><td style="padding:6px 0;color:${p.muted};text-align:right;">${docLabel} number</td></tr>
                <tr><td style="padding:0 0 8px;text-align:right;"><span style="display:inline-block;padding:6px 14px;border-radius:10px;background:${p.accentSoft};color:${p.accentDeep};font-weight:800;font-size:15px;letter-spacing:.02em;">${escapeHtml(payload.documentNumber)}</span></td></tr>
                <tr><td style="padding:6px 0;color:${p.muted};">Issue date</td><td style="padding:6px 0;text-align:right;font-weight:600;color:${p.text};">${formatDate(payload.issueDate)}</td></tr>
                ${dueBlock}
              </table>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:8px 28px 20px;">
          <div style="padding:18px 20px;border-radius:14px;background:${p.accentSoft};border:1px solid ${p.border};">
            <div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${p.accent};font-weight:800;margin-bottom:8px;">Bill to</div>
            <div style="font-size:18px;font-weight:800;color:${p.text};letter-spacing:-.02em;">${escapeHtml(payload.clientName)}</div>
            ${payload.clientEmail ? `<div style="font-size:13px;color:${p.muted};margin-top:6px;"><a href="mailto:${encodeURIComponent(payload.clientEmail)}" style="color:${p.accent};text-decoration:none;">${escapeHtml(payload.clientEmail)}</a></div>` : ''}
            ${payload.clientAddress ? `<div style="font-size:13px;color:${p.muted};margin-top:8px;line-height:1.5;">${escapeHtml(payload.clientAddress).replace(/\n/g, '<br/>')}</div>` : ''}
          </div>
        </td></tr>
        ${statusBannerBlock ? `<tr><td style="padding:0 28px 8px;">${statusBannerBlock}</td></tr>` : ''}
        <tr><td style="padding:8px 28px 28px;">
          <div style="border-radius:14px;border:1px solid ${p.border};overflow:hidden;">
            <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:13px;">
              <thead><tr style="background:${p.theadBg};">
                <th style="text-align:left;padding:14px 12px;border-bottom:3px solid ${p.accent};color:${p.text};font-weight:800;font-size:11px;letter-spacing:.08em;text-transform:uppercase;">Description</th>
                <th style="text-align:right;padding:14px 10px;border-bottom:3px solid ${p.accent};color:${p.muted};font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;width:72px;">Qty</th>
                <th style="text-align:right;padding:14px 10px;border-bottom:3px solid ${p.accent};color:${p.muted};font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;width:100px;">Price</th>
                <th style="text-align:right;padding:14px 12px;border-bottom:3px solid ${p.accent};color:${p.muted};font-weight:700;font-size:11px;letter-spacing:.06em;text-transform:uppercase;width:110px;">Amount</th>
              </tr></thead>
              <tbody>${lineRows(payload.lineItems, payload.currency, p)}</tbody>
            </table>
          </div>
          <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;font-size:14px;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:${p.muted};">Subtotal</td><td style="padding:8px 0;text-align:right;font-weight:600;color:${p.text};">${escapeHtml(money(totals.subtotal, payload.currency))}</td></tr>
            ${discountRow}
            ${taxRow}
            <tr><td colspan="2" style="padding:16px 0 0;">
              <div style="padding:16px 18px;border-radius:12px;background:${p.totalBg};border:1px solid ${p.border};">
                <table width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:15px;font-weight:800;color:${p.text};vertical-align:middle;">Total ${isInvoice ? 'due' : 'paid'}</td>
                    <td style="text-align:right;font-size:24px;font-weight:800;color:${p.accent};letter-spacing:-.03em;vertical-align:middle;">${escapeHtml(money(totals.total, payload.currency))}</td>
                  </tr>
                </table>
              </div>
            </td></tr>
          </table>
          ${notes}
          ${pay}
          <div style="margin-top:28px;padding-top:18px;border-top:1px solid ${p.border};text-align:center;font-size:11px;color:${p.muted};letter-spacing:.04em;">
            ${escapeHtml(title)} · ${escapeHtml(payload.documentNumber)}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function plainTextSummary(payload: BillingDocPayload, totals: BillingComputedTotals): string {
  const lines = payload.lineItems
    .map((l) => `${l.description} × ${l.quantity} @ ${l.unitPrice}`)
    .join('\n');
  return `${payload.documentType.toUpperCase()} ${payload.documentNumber}\n${payload.sellerName}\n\nBill to: ${payload.clientName}\n\n${lines}\n\nTotal: ${totals.total} ${payload.currency}\n`;
}
