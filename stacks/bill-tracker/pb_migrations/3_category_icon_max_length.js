// Widen `categories.icon` so the whole Phosphor icon set fits.
//
// The field is `max: 10` in `1_initial_schema.js`, and that number made sense
// when it was written: `Category.icon` held an **emoji**. `DEFAULT_CATEGORY_ICON`
// was `'📁'`, an emoji is one or two characters, and a cap of 10 was generous.
//
// The redesign changed the field to a Phosphor icon *name* and nobody revisited
// the constraint. The curated set is 145 icons, and:
//
//     29 of them are longer than 10 characters          (20%)
//     the longest are ShoppingCartSimple and IdentificationCard at 18
//     and the DEFAULT, `FolderSimple`, is 12
//
// So on the database provider, creating a category failed unless you noticed the
// problem and deliberately picked an icon with a short name — and creating one
// without touching the icon picker, which is what most people do, failed every
// time. The app-side check in `lib/services/billService.ts` mirrored the same cap
// and rejected the write before it reached PocketBase, so the failure did not
// even arrive as a database error: it arrived as a thrown
// "Category icon is required and must be between 1-10 characters", about a field
// the person had never knowingly filled in.
//
// 50 rather than 18, which is the longest name that exists today. It matches the
// `name` field beside it, so there is one number for "a short label in this
// collection" rather than two arbitrary ones, and it leaves room for any icon
// Phosphor adds later. The field still needs a bound — an unbounded text field
// would accept a paragraph.
//
// Append-only: `1_initial_schema.js` stays untouched, so databases that already
// applied it do not re-run it. PocketBase applies this one on the next start.
//
// The `3_` prefix follows the two files above it rather than being a Unix
// timestamp. That is not a style choice: PocketBase applies migrations in
// filename order, and a timestamp sorts before `1_` (`7` < `_` in ASCII), which
// put one of them before the schema it depended on and broke every fresh
// install. The file that had the timestamp is now `5_frequency_once.js`.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId('categories')
    const icon = collection.fields.getByName('icon')

    if (!icon) return

    icon.max = 50
    app.save(collection)
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('categories')
    const icon = collection.fields.getByName('icon')

    if (!icon) return

    // Narrowing back is only safe if nothing longer than 10 was stored while
    // this migration was applied. The down path is here for completeness; a
    // revert after a long-named icon has been saved will be rejected by
    // PocketBase rather than silently truncating the value.
    icon.max = 10
    app.save(collection)
  }
)
