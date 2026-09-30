import nodemailer from 'nodemailer'

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => {
    switch (character) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default:  return '&#39;'
    }
  })
}

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   ?? 'localhost',
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === '465',
    auth:   process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    // No mail path in this application needs to read local files or fetch
    // remote content. Keep these disabled even if a future template changes.
    disableFileAccess: true,
    disableUrlAccess: true,
  })
}

export async function sendMapPasswordResetToken(payload: {
  recipientEmail: string
  recipientName: string
  token: string
}): Promise<void> {
  const transporter = createTransport()
  const recipientName = escapeHtml(payload.recipientName)
  const token = escapeHtml(payload.token)

  await transporter.sendMail({
    from: `"Kosher Map" <${process.env.SMTP_USER ?? 'noreply@kashrut.local'}>`,
    to: payload.recipientEmail,
    subject: 'Kosher Map password reset code',
    text: `Your Kosher Map password reset code is: ${payload.token}\n\nIt expires in 30 minutes. If you did not request this, ignore this message.`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Kosher Map password reset</h2>
        <p>Hello ${recipientName},</p>
        <p>Enter this code in the password reset form:</p>
        <p style="font-family:monospace;font-size:18px;font-weight:bold;word-break:break-all">${token}</p>
        <p>The code expires in 30 minutes. If you did not request this, ignore this message.</p>
      </div>
    `,
  })
}

// No greeting with the account's name: anyone can register any address, so
// the name is text a stranger chose.
export async function sendMapEmailVerification(payload: {
  recipientEmail: string
  link: string
}): Promise<void> {
  const transporter = createTransport()
  const link = escapeHtml(payload.link)
  const notYours = 'If you did not create a Kosher Map account, do not confirm: someone else entered your address. Ignore this message and that account stays unconfirmed.'

  await transporter.sendMail({
    from: `"Kosher Map" <${process.env.SMTP_USER ?? 'noreply@kashrut.local'}>`,
    to: payload.recipientEmail,
    subject: 'Confirm your Kosher Map email',
    text: `Someone registered a Kosher Map account with this email address. To confirm that it is yours, open this link and press "Confirm email":\n\n${payload.link}\n\nThe link expires in 24 hours. ${notYours}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Confirm your email</h2>
        <p>Someone registered a Kosher Map account with this email address. Confirm that it is yours to post reviews and suggest places:</p>
        <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#E8A507;color:#000;text-decoration:none;border-radius:4px">Confirm email</a></p>
        <p style="font-size:12px;color:#666;word-break:break-all">Or open this link: ${link}</p>
        <p>The link expires in 24 hours. ${notYours}</p>
      </div>
    `,
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

  const subjectRestaurantName = payload.restaurantName.replace(/[\r\n]+/g, ' ').trim()
  const subject = `⚠️ Kashrut certificate expiring in ${payload.daysLeft} days — ${subjectRestaurantName}`
  const recipientName = escapeHtml(payload.recipientName)
  const restaurantName = escapeHtml(payload.restaurantName)
  const daysLeft = escapeHtml(String(payload.daysLeft))
  const expires = escapeHtml(payload.expires)

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#E8C96D">Kashrut Certificate Expiry Notice</h2>
      <p>Dear ${recipientName},</p>
      <p>
        The kashrut certificate for <strong>${restaurantName}</strong>
        is expiring in <strong>${daysLeft} days</strong>
        (on <strong>${expires}</strong>).
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
