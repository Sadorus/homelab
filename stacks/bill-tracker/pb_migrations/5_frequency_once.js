// Add "once" to the frequency units, so a bill can be a one-off payment.
//
// **The filename is `5_`, and it used to be a Unix timestamp.** PocketBase
// applies migrations in filename order, and `1790669171_frequency_once.js`
// sorts *before* `1_initial_schema.js` — '7' < '_' in ASCII — so on a fresh
// data directory this migration ran first, found no `bills` collection, and
// every new install failed with `sql: no rows in result set`. Existing
// databases were unaffected because the file was added after the schema had
// already been applied, which is why it went unnoticed.
//
// The rename is safe for those existing databases: the old name simply has no
// file any more, and the body is idempotent (the `includes` check below), so
// re-applying it under the new name is a no-op.
//
// `bills.frequency_unit` is a PocketBase **select** with a fixed value list, so a
// new unit is a schema change rather than only a TypeScript one. The app has to
// agree in three places and this is the one that fails hardest: the others reject
// the write before it is attempted, with a message about the value being invalid,
// whereas this one would return a 400 from the server for a form that looked
// perfectly valid.
//
// The value is `once` rather than `one-time` or `one_time` because it is stored
// and compared, not displayed: the label people read comes from `cadenceLabel`,
// which says "One time". Same split as the rest of the app's stored values.
//
// Append-only in body: the up function only appends the value, so it cannot
// clobber a unit another migration adds later.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('bills')
    const unit = collection.fields.getByName('frequency_unit')

    if (!unit) return

    // Read the existing values rather than restating them, so a value added by
    // another migration in between is not silently dropped by this one.
    const current = unit.values || []
    if (!current.includes('once')) {
      unit.values = [...current, 'once']
    }

    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('bills')
    const unit = collection.fields.getByName('frequency_unit')

    if (!unit) return

    // Narrowing back would fail on any bill already stored as `once`, which is
    // the correct behaviour rather than a bug: PocketBase refuses rather than
    // rewriting the rows. The down path is here for completeness.
    unit.values = (unit.values || []).filter((v) => v !== 'once')

    app.save(collection)
  }
)
