/// <reference path="../pb_data/types.d.ts" />

/**
 * Daily email reminders.
 *
 * The app's bell is generated in an open tab (`StoreInitializer` runs the
 * generator on load and hourly while the page is open), so nothing reminds
 * anyone at 8am with the app closed. This is the only always-on process, and
 * PocketBase is the only place it can live: the default provider is
 * localStorage, which has no server at all.
 *
 * **Who gets mail.** Only users with `email_notifications = true` — the switch
 * in Settings. That is separate from the per-bill `notification_enabled`, which
 * decides *which* bills are included. Both are opt-in; mail leaves the machine.
 *
 * **How often.** At most twice per billing cycle per bill: once when it enters
 * its reminder window (`notification_days` before the due date), and once when
 * it first goes overdue. `notification_last_sent_at` is the marker, and the
 * window test is deliberately "not sent since the window opened" rather than
 * "sent exactly on the boundary day" — a server that was down on the boundary
 * day still sends when it comes back, instead of skipping the cycle.
 *
 * **Configuration.** SMTP comes from PocketBase's own settings (Dashboard →
 * Settings → Mail settings); if it is not enabled this hook does nothing.
 * `PB_REMINDERS_CRON` overrides the schedule (exactly five fields, default
 * `0 8 * * *`), `PB_REMINDERS_TZ` sets the cron's timezone — PocketBase ticks
 * in UTC otherwise, so "8" means 8am UTC — and `PB_REMINDERS_DISABLED=1`
 * unregisters the job.
 *
 * **Why everything lives inside `runReminders`.** `cronAdd` does not receive a
 * function: it receives the handler's *source text* and recompiles it as
 * `{ (source).apply(undefined) }` in one of PocketBase's pooled executor VMs
 * (see `plugins/jsvm/binds.go`). Top-level helpers from this file are not
 * globals in those VMs, so a handler that calls `startOfDay` dies with a
 * ReferenceError that only reaches `app.Logger()` — invisible on `serve`
 * stdout, and indistinguishable from "nothing was due". Keep the handler
 * self-contained, or the cron silently stops working.
 */

const REMINDER_CRON = $os.getenv('PB_REMINDERS_CRON') || '0 8 * * *'
const REMINDER_TZ = $os.getenv('PB_REMINDERS_TZ')

function runReminders() {
  const DAY_MS = 24 * 60 * 60 * 1000
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  }

  /** `yyyy-MM-dd` or `yyyy-MM-ddTHH:mm:ss`; both are calendar days here. */
  function parseDate(value) {
    if (!value) return null
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  }

  function formatDay(date, today) {
    const base = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
    return date.getFullYear() === today.getFullYear() ? base : `${base} ${date.getFullYear()}`
  }

  function money(amount, currency) {
    const fixed = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return `${fixed} ${currency}`
  }

  /** Bill names are user input and this is an HTML email. */
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /**
   * Why a bill is in this digest, or null. `'due'` is inside the reminder
   * window; `'overdue'` is past the due day with nothing sent since the due
   * day ended.
   */
  function dueReason(bill, today) {
    const dueDate = parseDate(bill.getString('next_due_date'))
    if (!dueDate) return null

    const dueDay = startOfDay(dueDate)
    const daysUntil = Math.round((dueDay.getTime() - today.getTime()) / DAY_MS)
    const windowDays = Math.max(1, bill.getInt('notification_days') || 3)
    const windowStart = new Date(dueDay)
    windowStart.setDate(windowStart.getDate() - windowDays)

    const lastSent = parseDate(bill.getString('notification_last_sent_at'))

    if (daysUntil >= 0 && daysUntil <= windowDays) {
      return !lastSent || lastSent < windowStart ? 'due' : null
    }

    // The due-day digest is not "sent since overdue": a bill whose only send
    // went out on the due date itself still gets one overdue mail, on the
    // first run after the due day ended.
    const overdueFrom = new Date(dueDay.getTime() + DAY_MS)
    if (daysUntil < 0 && (!lastSent || lastSent < overdueFrom)) {
      return 'overdue'
    }

    return null
  }

  function buildDigest(user, entries, today) {
    const name = user.getString('name') || user.getString('email')
    const due = entries.filter((entry) => entry.reason === 'due')
    const overdue = entries.filter((entry) => entry.reason === 'overdue')

    const parts = []
    if (overdue.length > 0) parts.push(`${overdue.length} overdue`)
    if (due.length > 0) parts.push(`${due.length} due soon`)

    const section = (title, list) =>
      list.length === 0
        ? ''
        : `<h3 style="margin:16px 0 4px;font:600 14px sans-serif;">${title}</h3><ul style="margin:0;padding-left:18px;font:14px sans-serif;">${list
            .map((entry) => {
              const bill = entry.bill
              const amount = money(bill.getFloat('price'), bill.getString('currency'))
              const when =
                entry.reason === 'overdue'
                  ? `was due ${formatDay(entry.dueDate, today)}`
                  : `due ${formatDay(entry.dueDate, today)}`
              return `<li><strong>${escapeHtml(bill.getString('name'))}</strong> — ${escapeHtml(amount)}, ${when}</li>`
            })
            .join('')}</ul>`

    const html = [
      `<p style="font:14px sans-serif;">Hello ${escapeHtml(name)},</p>`,
      '<p style="font:14px sans-serif;">This is what is due on your bills:</p>',
      section('Overdue', overdue),
      section('Due soon', due),
      '<p style="margin-top:20px;font:12px sans-serif;color:#666;">Sent because email reminders are on in your account. You can turn them off in Settings.</p>',
    ].join('')

    return {
      subject: `Bill Reminder: ${parts.join(', ')}`,
      html,
    }
  }

  /*
   * `console`, not `$app.logger()`.
   *
   * The default logger's lines do not reach the `serve` stdout in this version,
   * and a reminder job whose skip reason is invisible is the failure mode where
   * nobody can tell "nothing was due" from "the job crashed". The messages go
   * where they can be read.
   */
  const app = $app
  const settings = app.settings()

  if (!settings.smtp.enabled) {
    console.log('Email reminders skipped: SMTP is not configured.')
    return
  }

  const fromAddress = settings.meta.senderAddress
  if (!fromAddress) {
    console.error('Email reminders skipped: no sender address in the mail settings.')
    return
  }

  const fromName = settings.meta.senderName || 'Bill Reminder'
  const now = new Date()
  const today = startOfDay(now)

  const users = app.findRecordsByFilter('users', 'email_notifications = true', '', 0, 0)
  let sent = 0

  for (const user of users) {
    const email = user.getString('email')
    if (!email) continue

    try {
      const bills = app.findRecordsByFilter(
        'bills',
        'user_id = {:userId} && notification_enabled = true && is_paid = false',
        'next_due_date',
        0,
        0,
        { userId: user.id }
      )

      const entries = []
      for (const bill of bills) {
        const reason = dueReason(bill, today)
        if (reason) {
          entries.push({ bill, reason, dueDate: parseDate(bill.getString('next_due_date')) })
        }
      }
      if (entries.length === 0) continue

      const digest = buildDigest(user, entries, today)
      const message = new MailerMessage({
        from: { address: fromAddress, name: fromName },
        to: [{ address: email }],
        subject: digest.subject,
        html: digest.html,
      })
      app.newMailClient().send(message)
      sent++

      // Marked only after the send, so a failed send is retried on the next run
      // rather than silently swallowed by the marker.
      for (const entry of entries) {
        entry.bill.set('notification_last_sent_at', now.toISOString())
        app.save(entry.bill)
      }
    } catch (error) {
      console.error('Email reminder failed for one account.', String(error))
    }
  }

  console.log(`Email reminders run: ${sent} digest(s) sent.`)
}

if ($os.getenv('PB_REMINDERS_DISABLED') !== '1') {
  /*
   * PocketBase's cron scheduler starts in UTC, so `0 8 * * *` is 8am UTC —
   * 10:00 in a UTC+2 household. `PB_REMINDERS_TZ` moves the server's cron
   * ticks so the hour in the expression means what it looks like: `Local` for
   * the machine's zone, or any IANA name. Opt-in, because it is a global
   * setting — PocketBase's own maintenance jobs move with it.
   */
  if (REMINDER_TZ) {
    $app.cron().setTimezone(new Timezone(REMINDER_TZ))
  }

  console.log(`Email reminders scheduled: ${REMINDER_CRON}${REMINDER_TZ ? ` (${REMINDER_TZ})` : ' (UTC)'}`)
  cronAdd('email-reminders', REMINDER_CRON, runReminders)
}
