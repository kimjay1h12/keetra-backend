export type BulkEmailPreset = {
  key: string;
  name: string;
  description: string;
  subject: string;
  htmlBody: string;
  textBody: string;
};

const wrap = (inner: string) => `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,.08);">
${inner}
</table>
</td></tr></table></body></html>`;

export const BULK_EMAIL_PRESETS: BulkEmailPreset[] = [
  {
    key: 'welcome',
    name: 'Welcome',
    description: 'Warm onboarding for new contacts.',
    subject: 'Welcome to KeeTra',
    htmlBody: wrap(`
<tr><td style="padding:28px 32px 8px;font-size:22px;font-weight:700;color:#111827;">Welcome aboard</td></tr>
<tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#4b5563;">We are glad you are here. KeeTra helps your team meet, collaborate, and stay aligned — all in one place.</td></tr>
<tr><td style="padding:0 32px 32px;"><a href="#" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">Open your workspace</a></td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">You received this message as part of a team update.</td></tr>`),
    textBody:
      'Welcome aboard\n\nWe are glad you are here. KeeTra helps your team meet, collaborate, and stay aligned.\n\n— KeeTra',
  },
  {
    key: 'newsletter',
    name: 'Newsletter',
    description: 'Product news and highlights.',
    subject: 'KeeTra — This month at a glance',
    htmlBody: wrap(`
<tr><td style="padding:28px 32px 8px;font-size:20px;font-weight:700;color:#111827;">This month at a glance</td></tr>
<tr><td style="padding:8px 32px 16px;font-size:15px;line-height:1.65;color:#4b5563;">Here is a concise roundup of what shipped, what improved, and what is next for your team.</td></tr>
<tr><td style="padding:8px 32px 16px;font-size:15px;line-height:1.65;color:#374151;"><strong>Highlights</strong><br/>• Faster meetings<br/>• Clearer handoffs<br/>• Safer sharing</td></tr>
<tr><td style="padding:8px 32px 32px;font-size:15px;color:#4b5563;">Reply to this email if you would like a deeper walkthrough.</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">KeeTra newsletter</td></tr>`),
    textBody:
      'This month at a glance\n\nHighlights: faster meetings, clearer handoffs, safer sharing.\n\n— KeeTra',
  },
  {
    key: 'meeting-recap',
    name: 'Meeting recap',
    description: 'Follow-up after a sync.',
    subject: 'Notes from our meeting',
    htmlBody: wrap(`
<tr><td style="padding:28px 32px 8px;font-size:20px;font-weight:700;color:#111827;">Thank you for your time today</td></tr>
<tr><td style="padding:8px 32px 20px;font-size:15px;line-height:1.65;color:#4b5563;">Here is a short recap of decisions and next steps we aligned on. Please reply with any corrections.</td></tr>
<tr><td style="padding:0 32px 20px;font-size:15px;color:#111827;"><strong>Next steps</strong></td></tr>
<tr><td style="padding:0 32px 28px;font-size:14px;line-height:1.6;color:#4b5563;">• Owner: [Name] — [Task]<br/>• Due: [Date]</td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">Meeting recap</td></tr>`),
    textBody:
      'Thank you for your time today.\n\nNext steps:\n- [Owner] — [Task] — Due [Date]\n\n— KeeTra',
  },
  {
    key: 'invoice-style',
    name: 'Statement',
    description: 'Formal notice / statement layout.',
    subject: 'Important account notice',
    htmlBody: wrap(`
<tr><td style="padding:28px 32px 8px;font-size:18px;font-weight:700;color:#111827;letter-spacing:.02em;">Account notice</td></tr>
<tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.65;color:#4b5563;">This is a formal-style message for statements, renewals, or policy updates. Replace this paragraph with your details.</td></tr>
<tr><td style="padding:0 32px 28px;font-size:14px;color:#6b7280;">Reference: <span style="font-family:ui-monospace,monospace;">REF-0000</span></td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">KeeTra business messaging</td></tr>`),
    textBody:
      'Account notice\n\nReplace this paragraph with your details.\nReference: REF-0000\n\n— KeeTra',
  },
  {
    key: 'event-invite',
    name: 'Event invite',
    description: 'Save the date style.',
    subject: 'You are invited',
    htmlBody: wrap(`
<tr><td style="padding:28px 32px 8px;font-size:22px;font-weight:700;color:#111827;">You are invited</td></tr>
<tr><td style="padding:8px 32px 12px;font-size:15px;line-height:1.65;color:#4b5563;">We would love for you to join us. Add the details of your event below.</td></tr>
<tr><td style="padding:12px 32px 28px;font-size:15px;color:#111827;"><strong>When:</strong> [Date & time]<br/><strong>Where:</strong> [Location or link]</td></tr>
<tr><td style="padding:0 32px 32px;"><span style="display:inline-block;border:1px solid #1a73e8;color:#1a73e8;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">RSVP</span></td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">Invitation</td></tr>`),
    textBody:
      'You are invited\n\nWhen: [Date]\nWhere: [Location]\n\n— KeeTra',
  },
  {
    key: 'minimal',
    name: 'Minimal',
    description: 'Clean single-column letter.',
    subject: 'A quick note from our team',
    htmlBody: wrap(`
<tr><td style="padding:32px;font-size:16px;line-height:1.7;color:#374151;">Hello,<br/><br/>Thank you for being part of our community. This is a minimal template — edit this text to match your voice.<br/><br/>Best regards,<br/><strong>Your team</strong></td></tr>
<tr><td style="padding:16px 32px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">Sent via KeeTra</td></tr>`),
    textBody:
      'Hello,\n\nThank you for being part of our community.\n\nBest regards,\nYour team\n\n— KeeTra',
  },
];

export function presetByKey(key: string): BulkEmailPreset | undefined {
  return BULK_EMAIL_PRESETS.find((p) => p.key === key);
}
