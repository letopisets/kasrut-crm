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


async function runExpiryCheck(): Promise<void> {
  const today = new Date()

  for (const days of WARN_DAYS) {
    const target = addDays(today, days)
    const dateStr = target.toISOString().slice(0, 10)

    const restaurants = await prisma.restaurant.findMany({
      where: {
        deletedAt: null,
        expires: {
          gte: new Date(dateStr + 'T00:00:00.000Z'),
          lt:  new Date(dateStr + 'T23:59:59.999Z'),
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

    const sends: Promise<void>[] = []

    for (const r of restaurants) {
      const expiresStr = r.expires.toISOString().slice(0, 10)
      const recipients: { email: string; name: string }[] = [
        ...r.rabbanut.users.map(u => ({ email: u.email, name: u.name })),
        ...(r.mashgiach ? [{ email: r.mashgiach.email, name: r.mashgiach.name }] : []),
      ]

      for (const recipient of recipients) {
        sends.push(
          sendExpiryWarning({
            restaurantName: r.name,
            expires:        expiresStr,
            daysLeft:       days,
            recipientEmail: recipient.email,
            recipientName:  recipient.name,
          }).catch(err => {
            logger.error({ err, restaurantId: r.id, recipientEmail: recipient.email },
              'Failed to send expiry warning email')
          }),
        )
      }
    }

    await Promise.allSettled(sends)
  }
}

// Every day at 08:00 server time
cron.schedule('0 8 * * *', () => {
  runExpiryCheck().catch(err =>
    logger.error({ err }, 'expiryNotifier cron failed'),
  )
})

logger.info('expiryNotifier cron registered (daily 08:00)')
