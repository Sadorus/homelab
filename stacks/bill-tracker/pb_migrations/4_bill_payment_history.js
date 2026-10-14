// Persist payment history on the bill.
//
// `Bill.paymentHistory` has existed in the app since persist version 3, and the
// local store has always appended a record to it on "Mark paid". The database
// provider never did: `convertDBBillToApp` hardcoded `payment_history: []` and
// `convertAppBillToDB` never sent the field, so on PocketBase every recorded
// payment disappeared on the next load. Nothing read the array until now, which
// is why the loss went unnoticed.
//
// Analytics is what reads it. The on-time rate needs a payment date to compare
// against its due date, and "what changed" needs the amounts over time — a
// price increase is invisible in a bill that only stores its current amount.
//
// The field is JSON rather than a relation to a payments collection because a
// payment has no standalone identity in this app: it is only ever read as part
// of its bill's history, and it is deleted with the bill. A `json` field keeps
// that ownership literal, and PocketBase applies `cascadeDelete` to a relation
// anyway — the difference would be ceremony, not safety.
//
// `maxSize` is a bound, not an expectation: at roughly 120 bytes per record it
// holds several thousand payments, which is more than a household's lifetime
// of bills. A bound exists so a bug that appends on every render cannot grow
// the row without limit.
//
// Append-only: `1_initial_schema.js` stays untouched, so databases that already
// applied it do not re-run it. PocketBase applies this one on the next start.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('bills')

    if (!collection.fields.getByName('payment_history')) {
      collection.fields.add(
        new JSONField({
          name: 'payment_history',
          required: false,
          maxSize: 500000,
        })
      )
    }

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('bills')
    const field = collection.fields.getByName('payment_history')

    if (field) {
      collection.fields.removeById(field.id)
      app.save(collection)
    }
  }
)
