migrate((app) => {
  let users
  let usersCreatedByMigration = false
  try {
    users = app.findCollectionByNameOrId('users')
  } catch (error) {
    users = new Collection({
      type: 'auth',
      name: 'users',
      listRule: 'id = @request.auth.id',
      viewRule: 'id = @request.auth.id',
      createRule: '',
      updateRule: 'id = @request.auth.id',
      deleteRule: 'id = @request.auth.id',
    })
    app.save(users)
    usersCreatedByMigration = true
  }

  const userFieldNames = users.fields.fieldNames()
  if (!userFieldNames.includes('name')) {
    users.fields.add(new TextField({ name: 'name' }))
  }
  if (!userFieldNames.includes('avatar')) {
    users.fields.add(new FileField({
      name: 'avatar',
      maxSelect: 1,
      maxSize: 5242880,
      mimeTypes: [
        'image/jpeg',
        'image/png',
        'image/svg+xml',
        'image/gif',
        'image/webp',
      ],
    }))
  }

  users.listRule = 'id = @request.auth.id'
  users.viewRule = 'id = @request.auth.id'
  users.createRule = ''
  users.updateRule = 'id = @request.auth.id'
  users.deleteRule = 'id = @request.auth.id'
  app.save(users)
  app.store().set('billReminderInitialSchemaCreatedUsers', usersCreatedByMigration)

  const categories = new Collection({
    type: 'base',
    name: 'categories',
    listRule: "@request.auth.id != '' && user_id = @request.auth.id",
    viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.user_id = @request.auth.id",
    updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
    fields: [
      {
        name: 'user_id',
        type: 'relation',
        required: true,
        collectionId: users.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: 'name',
        type: 'text',
        required: true,
        min: 1,
        max: 50,
      },
      {
        name: 'icon',
        type: 'text',
        required: true,
        min: 1,
        max: 10,
      },
      {
        name: 'color',
        type: 'text',
        required: true,
        min: 3,
        max: 20,
      },
      {
        name: 'is_custom',
        type: 'bool',
        required: false,
      },
    ],
    indexes: [
      'CREATE INDEX idx_categories_user_id ON categories (user_id)',
    ],
  })

  app.save(categories)

  const bills = new Collection({
    type: 'base',
    name: 'bills',
    listRule: "@request.auth.id != '' && user_id = @request.auth.id",
    viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.user_id = @request.auth.id",
    updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
    fields: [
      {
        name: 'user_id',
        type: 'relation',
        required: true,
        collectionId: users.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: 'name',
        type: 'text',
        required: true,
        min: 1,
        max: 200,
      },
      {
        name: 'price',
        type: 'number',
        required: true,
        min: 0,
      },
      {
        name: 'currency',
        type: 'text',
        required: true,
        min: 3,
        max: 3,
        pattern: '^[A-Z]{3}$',
      },
      {
        name: 'type',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: ['subscription', 'bill'],
      },
      {
        name: 'frequency_value',
        type: 'number',
        required: true,
        min: 1,
        onlyInt: true,
      },
      {
        name: 'frequency_unit',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: ['days', 'weeks', 'months', 'years'],
      },
      {
        name: 'due_date',
        type: 'number',
        required: false,
        min: 1,
        max: 31,
        onlyInt: true,
      },
      {
        name: 'start_date',
        type: 'text',
        required: true,
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
      },
      {
        name: 'next_due_date',
        type: 'text',
        required: true,
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
      },
      {
        name: 'last_payment_date',
        type: 'text',
        required: false,
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}',
      },
      {
        name: 'is_paid',
        type: 'bool',
        required: false,
      },
      {
        name: 'current_billing_period',
        type: 'text',
        required: false,
      },
      {
        name: 'paid_for_period',
        type: 'text',
        required: false,
      },
      {
        name: 'category_id',
        type: 'relation',
        required: false,
        collectionId: categories.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: 'notification_enabled',
        type: 'bool',
        required: false,
      },
      {
        name: 'notification_days',
        type: 'number',
        required: false,
        min: 1,
        max: 30,
        onlyInt: true,
      },
    ],
    indexes: [
      'CREATE INDEX idx_bills_user_id ON bills (user_id)',
      'CREATE INDEX idx_bills_next_due_date ON bills (next_due_date)',
      'CREATE INDEX idx_bills_is_paid ON bills (is_paid)',
    ],
  })

  app.save(bills)

  const notifications = new Collection({
    type: 'base',
    name: 'notifications',
    listRule: "@request.auth.id != '' && user_id = @request.auth.id",
    viewRule: "@request.auth.id != '' && user_id = @request.auth.id",
    createRule: "@request.auth.id != '' && @request.body.user_id = @request.auth.id",
    updateRule: "@request.auth.id != '' && user_id = @request.auth.id",
    deleteRule: "@request.auth.id != '' && user_id = @request.auth.id",
    fields: [
      {
        name: 'user_id',
        type: 'relation',
        required: true,
        collectionId: users.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: 'bill_id',
        type: 'relation',
        required: false,
        collectionId: bills.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      {
        name: 'type',
        type: 'select',
        required: true,
        maxSelect: 1,
        values: [
          'due_soon',
          'overdue',
          'payment_confirmed',
          'billing_period_reset',
        ],
      },
      {
        name: 'message',
        type: 'text',
        required: true,
        min: 1,
        max: 500,
      },
      {
        name: 'is_read',
        type: 'bool',
        required: false,
      },
      {
        name: 'is_dismissed',
        type: 'bool',
        required: false,
      },
    ],
    indexes: [
      'CREATE INDEX idx_notifications_user_id ON notifications (user_id)',
      'CREATE INDEX idx_notifications_is_read ON notifications (is_read)',
    ],
  })

  app.save(notifications)
}, (app) => {
  const removeIfPresent = (name) => {
    try {
      app.delete(app.findCollectionByNameOrId(name))
    } catch (error) {
    }
  }

  removeIfPresent('notifications')
  removeIfPresent('bills')
  removeIfPresent('categories')
  if (app.store().get('billReminderInitialSchemaCreatedUsers') === true) {
    removeIfPresent('users')
  }
})
