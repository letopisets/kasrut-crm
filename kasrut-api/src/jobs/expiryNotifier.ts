/**
 * Daily cron at 08:00 — find restaurants expiring in exactly 7 or 30 days
 * and email the rabbanut owner + assigned mashgiach.
 *
 * Wired into server startup in src/server.ts:
 *   import './jobs/expiryNotifier'
 */

import cron   from 'node-cron'
import { prisma }            from '../lib/prisma'
import { sendExpiryWarning } from '../lib/mailer'
import { logger }            from '../lib/logger'

const WARN_DAYS = [7, 30]

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

async function runExpiryCheck(): Promise<void> {
  const today = new Date()

  for (const days of WARN_DAYS) {
    const target = addDays(today, days)

    const restaurants = await prisma.restaurant.findMany({
      where: {
        deletedAt: null,
        expires: {
          gte: new Date(target.toISOString().slice(0, 10) + 'T00:00:00.000Z'),
          lt:  new Date(target.toISOString().slice(0, 10) + 'T23:59:59.999Z'),
        },
      },
      include: {
        // Notify users responsible for the rabbanut (role: 'rabbanut'), not
        // platform super-admins (role: 'owner') — the latter are not
        // operational stakeholders for individual restaurants.
        rabbanut:  { include: { users: { where: { role: 'rabbanut' } } } },
        mashgiach: true,
      },
    })

    for (const r of restaurants) {
      if (!isSameDay(r.expires, target)) continue

      const expiresStr = r.expires.toISOString().slice(0, 10)
      const recipients: { email: string; name: string }[] = []

      // Rabbanut user(s)
      for (const u of r.rabbanut.users) {
        recipients.push({ email: u.email, name: u.name })
      }

      // Assigned mashgiach
      if (r.mashgiach) {
        recipients.push({ email: r.mashgiach.email, name: r.mashgiach.name })
      }

      for (const recipient of recipients) {
        try {
          await sendExpiryWarning({
            restaurantName: r.name,
            expires:        expiresStr,
            daysLeft:       days,
            recipientEmail: recipient.email,
            recipientName:  recipient.name,
          })
        } catch (err) {
          logger.error({ err, restaurantId: r.id, recipientEmail: recipient.email },
            'Failed to send expiry warning email')
        }
      }
    }
  }
}

// Every day at 08:00 server time
cron.schedule('0 8 * * *', () => {
  runExpiryCheck().catch(err =>
    logger.error({ err }, 'expiryNotifier cron failed'),
  )
})

logger.info('expiryNotifier cron registered (daily 08:00)')
