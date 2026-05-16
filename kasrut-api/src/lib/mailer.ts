import nodemailer from 'nodemailer'

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   ?? 'localhost',
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === '465',
    auth:   process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
}

export interface ExpiryMailPayload {
  restaurantName: string
  expires:        string   // YYYY-MM-DD
  daysLeft:       number
  recipientEmail: string
  recipientName:  string
}

export async function sendExpiryWarning(payload: ExpiryMailPayload): Promise<void> {
  const transporter = createTransport()

  const subject = `⚠️ Kashrut certificate expiring in ${payload.daysLeft} days — ${payload.restaurantName}`

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#E8C96D">Kashrut Certificate Expiry Notice</h2>
      <p>Dear ${payload.recipientName},</p>
      <p>
        The kashrut certificate for <strong>${payload.restaurantName}</strong>
        is expiring in <strong>${payload.daysLeft} days</strong>
        (on <strong>${payload.expires}</strong>).
      </p>
      <p>Please arrange renewal before the expiry date to avoid any service interruption.</p>
      <hr style="border:none;border-top:1px solid #333;margin:24px 0">
      <p style="font-size:12px;color:#888">KashrutCRM · Automated notification</p>
    </div>
  `

  await transporter.sendMail({
    from:    `"KashrutCRM" <${process.env.SMTP_USER ?? 'noreply@kashrut.local'}>`,
    to:      payload.recipientEmail,
    subject,
    html,
  })
}
