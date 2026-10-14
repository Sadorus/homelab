// Drop `bills.type`.
//
// `Bill.type` was `'subscription' | 'bill'` and nothing read it. Its only
// effects were a name placeholder and whether the form showed its start date,
// and neither is a distinction worth asking a person to make: the split the app
// actually uses is `frequency_unit === 'once'` versus a repeating bill, which
// the Bills page, the calendar and Analytics all read. The form now shows the
// start date for every bill, because it is the anchor a frequency without a due
// day computes from.
//
// The values are dropped with the column, and the down path says so: it re-adds
// the field empty and optional, because the values are gone and a `required`
// select with no values would reject every create.
//
// Ordering, stated because it bites once: the column is `required`, and the app
// stops sending it in the same release. A create issued between the client
// deploy and the server restart is rejected by the still-required column. The
// supported deployment starts the app and PocketBase together, and the restart
// is what applies this migration.
//
// Append-only: `1_initial_schema.js` stays untouched, so databases that already
// applied it do not re-run it.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('bills')
    const field = collection.fields.getByName('type')

    if (field) {
      collection.fields.removeById(field.id)
      app.save(collection)
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('bills')

    if (!collection.fields.getByName('type')) {
      collection.fields.add(
        new SelectField({
          name: 'type',
          required: false,
          maxSelect: 1,
          values: ['subscription', 'bill'],
        })
      )
      app.save(collection)
    }
  }
)
