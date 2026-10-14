// Email reminders: the opt-in, and the marker that keeps the cron honest.
//
// Two fields, and both are load-bearing.
//
// `users.email_notifications` is the opt-in. Per-bill reminders already exist
// (`notification_enabled` and `notification_days`), but those are for the in-app
// bell; sending mail leaves the machine and is a separate choice, so it gets a
// separate switch, off by default. The cron in `pb_hooks/reminders.pb.js` sends
// only to users who have turned it on.
//
// `bills.notification_last_sent_at` is the idempotency marker. The in-app dedupe
// (`hasBeenNotified`) lives inside the JSON settings object, which is not a
// column and is not visible to a server-side cron; and a restart or an
// overlapping run must not email the same bill twice. The hook reads it to send
// at most two emails per billing cycle: one when the bill enters its reminder
// window, and one when it becomes overdue.
//
// `text`, not `date`, for the marker: it matches every other date column in this
// schema and needs no timezone conversion on either side.
//
// Append-only: `1_initial_schema.js` stays untouched.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    if (!users.fields.getByName('email_notifications')) {
      users.fields.add(
        new BoolField({
          name: 'email_notifications',
          required: false,
        })
      )
    }
    app.save(users)

    const bills = app.findCollectionByNameOrId('bills')
    if (!bills.fields.getByName('notification_last_sent_at')) {
      bills.fields.add(
        new TextField({
          name: 'notification_last_sent_at',
          required: false,
          max: 40,
        })
      )
    }
    app.save(bills)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    if (users.fields.getByName('email_notifications')) {
      users.fields.removeById(users.fields.getByName('email_notifications').id)
      app.save(users)
    }

    const bills = app.findCollectionByNameOrId('bills')
    if (bills.fields.getByName('notification_last_sent_at')) {
      bills.fields.removeById(bills.fields.getByName('notification_last_sent_at').id)
      app.save(bills)
    }
  }
)
