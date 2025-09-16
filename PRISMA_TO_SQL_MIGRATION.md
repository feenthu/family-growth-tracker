# Prisma to Direct SQL Migration - Work in Progress

## Current Status

**Production Issue**: Railway deployment keeps crashing due to Prisma migration failures. Tables don't exist and Prisma auto-migrations aren't working reliably.

**Solution Decided**: Replace Prisma with direct PostgreSQL queries using `pg` library for simplicity and reliability.

## ✅ Completed Work

### 1. Package Dependencies Updated
- ❌ Removed: `@prisma/client`, `prisma`
- ✅ Added: `pg`, `@types/pg`
- ✅ Updated package.json scripts (removed Prisma commands)

### 2. Database Infrastructure Created
- ✅ `db/connection.ts` - PostgreSQL connection pool with helper functions
- ✅ `db/init.ts` - Complete table creation script with all schema
- ✅ Updated imports in server.ts (removed Prisma, added pg)

### 3. Members API Converted
- ✅ GET /api/members - Direct SQL query
- ✅ POST /api/members - Direct SQL insert
- ✅ DELETE /api/members/:id - Direct SQL delete
- ✅ Updated debug endpoint to use direct SQL

## ⚠️ Critical Current Status

**URGENT**: The server.ts file is currently **BROKEN** - it has ~30 Prisma method calls but no Prisma import or client initialization. This will cause the server to crash immediately when accessing any Bills, Payments, Recurring Bills, Mortgages, or Settings endpoints.

## 🚧 Work Remaining

### 4. Convert Remaining API Endpoints (CRITICAL - SERVER IS BROKEN)

**ALL of these endpoints currently have Prisma calls that will crash the server:**

**High Priority (Basic CRUD):**
- [ ] 🔥 Bills API (4 endpoints):
  - [ ] GET /api/bills (line ~130) - Complex with joins for splits and payments
  - [ ] POST /api/bills (line ~151) - Creates bill with splits in transaction
  - [ ] PUT /api/bills/:id (line ~182) - Updates bill and replaces splits
  - [ ] DELETE /api/bills/:id (line ~204) - Simple delete

- [ ] 🔥 Settings API (2 endpoints):
  - [ ] GET /api/settings (line ~563) - Simple key-value lookup
  - [ ] PUT /api/settings (line ~570) - Upsert key-value pairs

**Medium Priority:**
- [ ] Payments API (3 endpoints):
  - [ ] POST /api/payments (line ~218) - Creates payment with allocations
  - [ ] PUT /api/payments/:id (line ~248) - Updates payment and allocations
  - [ ] DELETE /api/payments/:id (line ~276) - Cascading delete

- [ ] Recurring Bills API (4 endpoints):
  - [ ] GET /api/recurring-bills (line ~291) - With splits relation
  - [ ] POST /api/recurring-bills (line ~307) - Creates with splits
  - [ ] PUT /api/recurring-bills/:id (line ~330) - Updates with splits
  - [ ] DELETE /api/recurring-bills/:id (line ~354) - Simple delete

**Lower Priority (Complex):**
- [ ] Mortgages API (4 endpoints):
  - [ ] GET /api/mortgages (line ~369) - With splits relation
  - [ ] POST /api/mortgages (line ~385) - Creates with splits
  - [ ] PUT /api/mortgages/:id (line ~408) - Updates with splits
  - [ ] DELETE /api/mortgages/:id (line ~432) - Simple delete

- [ ] Mortgage Payments API (3 endpoints):
  - [ ] POST /api/mortgage-payments (line ~447) - Complex with breakdown and allocations
  - [ ] PUT /api/mortgage-payments/:id (line ~483) - Updates all related tables
  - [ ] DELETE /api/mortgage-payments/:id (line ~521) - Cascading delete

### 5. Update Startup Function (CRITICAL)
**Current startup function is COMPLETELY BROKEN (lines 610-693):**
- Tries to run `npx prisma generate` but Prisma is not installed
- Tries to run `npx prisma migrate deploy` but no migrations exist
- Tries to call `prisma.$connect()` but prisma client doesn't exist
- Tries to call `prisma.member.count()` but should use direct SQL
- Tries to call `prisma.$disconnect()` in shutdown handlers

**Must replace entire startup function with:**
```typescript
async function startServer() {
  try {
    console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`)
    console.log(`DATABASE_URL is ${process.env.DATABASE_URL ? 'SET' : 'MISSING'}`)

    // Initialize database with our direct SQL approach
    console.log('Initializing database...')
    await initializeDatabase()
    console.log('✅ Database initialized successfully')

    // Test database connection with direct SQL
    const result = await query('SELECT COUNT(*) as count FROM members')
    const count = parseInt(result.rows[0].count)
    console.log(`✅ Database connection verified (${count} members found)`)

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`)
      console.log(`🛠️  Debug info: http://localhost:${PORT}/api/debug`)
    })
  } catch (error) {
    console.error('💥 Failed to start server:', error)
    process.exit(1)
  }
}

// Update shutdown handlers to close pool instead of prisma
process.on('beforeExit', async () => {
  await pool.end()
})
process.on('SIGINT', async () => {
  await pool.end()
  process.exit(0)
})
process.on('SIGTERM', async () => {
  await pool.end()
  process.exit(0)
})
```

### 6. Clean Up Files
- [ ] Delete `prisma/` directory entirely
- [ ] Remove any remaining Prisma imports
- [ ] Update CLAUDE.md to reflect new direct SQL approach

## Database Schema Reference

All tables are defined in `db/init.ts`:
- `members` - Family members
- `bills` - One-time bills with splits
- `bill_splits` - How bills are split between members
- `payments` - Bill payments with allocations
- `payment_allocations` - How payments are allocated
- `recurring_bills` - Template bills that generate instances
- `recurring_bill_splits` - How recurring bills are split
- `mortgages` - Mortgage loans with splits
- `mortgage_splits` - How mortgage payments are split
- `mortgage_payments` - Mortgage payment records
- `mortgage_payment_allocations` - How mortgage payments are allocated
- `mortgage_payment_breakdowns` - Principal/interest/escrow breakdown
- `settings` - App configuration key-value pairs

## Detailed SQL Conversion Patterns

### 1. Bills API Conversions

#### GET /api/bills (Complex with Relations)
```typescript
// Replace: await prisma.bill.findMany({ include: { splits: true, payments: { include: { allocations: true, payerMember: true } } } })

const result = await query(`
  SELECT
    b.id, b.name, b.amount_cents as "amountCents", b.due_date as "dueDate",
    b.recurring_bill_id as "recurringBillId", b.period, b.split_mode as "splitMode",
    b.created_at as "createdAt", b.updated_at as "updatedAt",
    COALESCE(
      json_agg(
        DISTINCT jsonb_build_object(
          'id', bs.id,
          'memberId', bs.member_id,
          'value', bs.value
        )
      ) FILTER (WHERE bs.id IS NOT NULL),
      '[]'
    ) as splits,
    COALESCE(
      json_agg(
        DISTINCT jsonb_build_object(
          'id', p.id,
          'amountCents', p.amount_cents,
          'payerId', p.payer_id,
          'note', p.note,
          'createdAt', p.created_at,
          'updatedAt', p.updated_at,
          'payerMember', jsonb_build_object('id', pm.id, 'name', pm.name, 'color', pm.color),
          'allocations', p.allocations
        )
      ) FILTER (WHERE p.id IS NOT NULL),
      '[]'
    ) as payments
  FROM bills b
  LEFT JOIN bill_splits bs ON b.id = bs.bill_id
  LEFT JOIN payments p ON b.id = p.bill_id
  LEFT JOIN members pm ON p.payer_id = pm.id
  LEFT JOIN LATERAL (
    SELECT json_agg(
      jsonb_build_object('id', pa.id, 'memberId', pa.member_id, 'amountCents', pa.amount_cents)
    ) as allocations
    FROM payment_allocations pa
    WHERE pa.payment_id = p.id
  ) pa ON true
  GROUP BY b.id
  ORDER BY b.due_date DESC
`)
```

#### POST /api/bills (Transaction)
```typescript
// Replace: await prisma.bill.create({ data: { ..., splits: { create: splits } } })

const client = await pool.connect()
try {
  await client.query('BEGIN')

  const billResult = await client.query(`
    INSERT INTO bills (name, amount_cents, due_date, recurring_bill_id, period, split_mode)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, name, amount_cents as "amountCents", due_date as "dueDate",
             recurring_bill_id as "recurringBillId", period, split_mode as "splitMode",
             created_at as "createdAt", updated_at as "updatedAt"
  `, [name, amountCents, new Date(dueDate), recurringBillId, period, splitMode])

  const bill = billResult.rows[0]

  if (splits && splits.length > 0) {
    const splitValues = splits.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ')
    const splitParams = [bill.id, ...splits.flatMap(s => [s.memberId, s.value])]

    await client.query(`
      INSERT INTO bill_splits (bill_id, member_id, value)
      VALUES ${splitValues}
    `, splitParams)
  }

  await client.query('COMMIT')
  res.json(bill)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
}
```

### 2. Settings API (Simple Key-Value)

#### GET /api/settings
```typescript
// Replace: await prisma.setting.findMany()

const result = await query('SELECT key, value FROM settings')
const settings = result.rows.reduce((acc, row) => {
  acc[row.key] = row.value
  return acc
}, {})
res.json(settings)
```

#### PUT /api/settings
```typescript
// Replace: await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })

const client = await pool.connect()
try {
  await client.query('BEGIN')

  for (const [key, value] of Object.entries(req.body)) {
    await client.query(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `, [key, value])
  }

  await client.query('COMMIT')
  res.json({ success: true })
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
}
```

### 3. Payments API (Complex Allocations)

#### POST /api/payments
```typescript
// Replace complex Prisma create with allocations

const client = await pool.connect()
try {
  await client.query('BEGIN')

  const paymentResult = await client.query(`
    INSERT INTO payments (amount_cents, payer_id, bill_id, note)
    VALUES ($1, $2, $3, $4)
    RETURNING id, amount_cents as "amountCents", payer_id as "payerId",
             bill_id as "billId", note, created_at as "createdAt", updated_at as "updatedAt"
  `, [amountCents, payerId, billId, note])

  const payment = paymentResult.rows[0]

  if (allocations && allocations.length > 0) {
    const allocValues = allocations.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ')
    const allocParams = [payment.id, ...allocations.flatMap(a => [a.memberId, a.amountCents])]

    await client.query(`
      INSERT INTO payment_allocations (payment_id, member_id, amount_cents)
      VALUES ${allocValues}
    `, allocParams)
  }

  await client.query('COMMIT')
  res.json(payment)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
}
```

### 4. Common Transaction Pattern
**All CREATE/UPDATE operations with relations should use this pattern:**

```typescript
const client = await pool.connect()
try {
  await client.query('BEGIN')

  // 1. Main entity operation
  const mainResult = await client.query('INSERT/UPDATE main table...')

  // 2. Delete existing relations (for updates)
  await client.query('DELETE FROM relation_table WHERE main_id = $1', [id])

  // 3. Insert new relations
  if (relations.length > 0) {
    const values = relations.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ')
    await client.query(`INSERT INTO relation_table VALUES ${values}`, params)
  }

  await client.query('COMMIT')
  res.json(result)
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  client.release()
}
```

### 5. Field Name Mapping
**Critical: Convert between frontend and database field names:**

```typescript
// Database uses snake_case, frontend expects camelCase
const convertToFrontend = (row) => ({
  id: row.id,
  amountCents: row.amount_cents,      // amount_cents -> amountCents
  dueDate: row.due_date,              // due_date -> dueDate
  splitMode: row.split_mode,          // split_mode -> splitMode
  recurringBillId: row.recurring_bill_id,  // recurring_bill_id -> recurringBillId
  createdAt: row.created_at,          // created_at -> createdAt
  updatedAt: row.updated_at           // updated_at -> updatedAt
})
```

## Railway Environment
- DATABASE_URL is already set correctly
- Direct SQL approach should eliminate all Prisma migration issues
- Much simpler and more reliable for Railway deployment

## Recommended Migration Order

### Phase 1: Fix Server Startup (IMMEDIATE)
1. **Replace startup function** - Server won't start without this
2. **Fix Settings API** - Simplest endpoints, needed for app config

### Phase 2: Core Functionality
3. **Bills API** - Most critical business logic
4. **Payments API** - Needed for bill tracking

### Phase 3: Advanced Features
5. **Recurring Bills API** - Template system
6. **Mortgages API** - Complex but lower priority
7. **Mortgage Payments API** - Most complex relationships

### Phase 4: Cleanup
8. Delete `prisma/` directory
9. Update documentation
10. Deploy and verify Railway works

## Testing Strategy
- Test each endpoint immediately after conversion
- Use `curl` or Postman to verify API responses match expected structure
- Check Railway deployment after each critical endpoint
- Verify multi-device sync works with PostgreSQL

## Critical Success Factors
1. **Transactions**: Always use transactions for multi-table operations
2. **Field mapping**: Convert snake_case DB fields to camelCase frontend fields
3. **Error handling**: Properly rollback transactions on errors
4. **Connection pooling**: Use `pool.connect()` for transactions, `query()` for simple reads

The Members API conversion is the perfect reference pattern - follow its structure for all other endpoints!