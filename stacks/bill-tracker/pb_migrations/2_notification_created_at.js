// Add an auto-managed creation timestamp to the notifications collection.
//
// The initial schema creates collections with an explicit field list, so records
// do not carry the framework `created`/`updated` fields. Notifications need a
// real timestamp for ordering and for the "x minutes ago" label, so it is added
// here as an explicit autodate field.
//
// This is an append-only migration: `1_initial_schema.js` stays untouched so
// databases that already applied it do not re-run it.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('notifications')

    if (!collection.fields.getByName('created_at')) {
      collection.fields.add(
        new AutodateField({
          name: 'created_at',
          onCreate: true,
        })
      )
    }

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('notifications')

    if (collection && collection.fields.getByName('created_at')) {
      collection.fields.removeById('created_at')
      app.save(collection)
    }
  }
)
