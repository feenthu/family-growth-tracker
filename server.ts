import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { query, pool } from './db/connection'
import { initializeDatabase } from './db/init'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 8080

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many API requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

const staticLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 static file requests per minute
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Apply rate limiting
app.use('/api/', apiLimiter)
app.use(express.static('dist', {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000') // 1 year cache
  }
}))

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Database connection check
app.get('/api/debug', async (req, res) => {
  try {
    // Check if DATABASE_URL exists
    const hasDatabaseUrl = !!process.env.DATABASE_URL

    // Try a simple query to test connection
    const result = await query('SELECT COUNT(*) as count FROM members')
    const memberCount = parseInt(result.rows[0].count)

    res.json({
      status: 'ok',
      database: {
        connected: true,
        hasDatabaseUrl,
        memberCount,
        databaseUrl: process.env.DATABASE_URL ? 'SET' : 'MISSING'
      },
      env: {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT
      }
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: {
        connected: false,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        databaseUrl: process.env.DATABASE_URL ? 'SET' : 'MISSING'
      },
      error: error instanceof Error ? error.message : 'Unknown error',
      env: {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT
      }
    })
  }
})

// Members API
app.get('/api/members', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, color, created_at as "createdAt", updated_at as "updatedAt"
      FROM members
      ORDER BY created_at ASC
    `)
    res.json(result.rows)
  } catch (error) {
    console.error('Members fetch error:', error)
    res.status(500).json({ error: 'Failed to fetch members' })
  }
})

app.post('/api/members', async (req, res) => {
  try {
    const { name, color } = req.body
    const result = await query(`
      INSERT INTO members (name, color)
      VALUES ($1, $2)
      RETURNING id, name, color, created_at as "createdAt", updated_at as "updatedAt"
    `, [name, color])
    res.json(result.rows[0])
  } catch (error) {
    console.error('Member creation error:', error)
    res.status(500).json({ error: 'Failed to create member' })
  }
})

app.delete('/api/members/:id', async (req, res) => {
  try {
    await query('DELETE FROM members WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Member deletion error:', error)
    res.status(500).json({ error: 'Failed to delete member' })
  }
})

// Bills API
app.get('/api/bills', async (req, res) => {
  try {
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
              'allocations', COALESCE(pa.allocations, '[]'::json)
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
          jsonb_build_object('id', pa_inner.id, 'memberId', pa_inner.member_id, 'amountCents', pa_inner.amount_cents)
        ) as allocations
        FROM payment_allocations pa_inner
        WHERE pa_inner.payment_id = p.id
      ) pa ON true
      GROUP BY b.id
      ORDER BY b.due_date DESC
    `)
    res.json(result.rows)
  } catch (error) {
    console.error('Bills fetch error:', error)
    res.status(500).json({ error: 'Failed to fetch bills' })
  }
})

app.post('/api/bills', async (req, res) => {
  try {
    const { name, amountCents, dueDate, recurringBillId, period, splitMode, splits } = req.body
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

        // Fetch the splits we just created
        const splitsResult = await client.query(`
          SELECT id, member_id as "memberId", value
          FROM bill_splits WHERE bill_id = $1
        `, [bill.id])

        bill.splits = splitsResult.rows
      } else {
        bill.splits = []
      }

      await client.query('COMMIT')
      res.json(bill)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Bill creation error:', error)
    res.status(500).json({ error: 'Failed to create bill' })
  }
})

app.put('/api/bills/:id', async (req, res) => {
  try {
    const { name, amountCents, dueDate, splitMode, splits } = req.body
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Update the bill
      const billResult = await client.query(`
        UPDATE bills SET
          name = $2,
          amount_cents = $3,
          due_date = $4,
          split_mode = $5,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, amount_cents as "amountCents", due_date as "dueDate",
                 recurring_bill_id as "recurringBillId", period, split_mode as "splitMode",
                 created_at as "createdAt", updated_at as "updatedAt"
      `, [req.params.id, name, amountCents, new Date(dueDate), splitMode])

      const bill = billResult.rows[0]

      // Delete existing splits
      await client.query('DELETE FROM bill_splits WHERE bill_id = $1', [req.params.id])

      // Insert new splits
      if (splits && splits.length > 0) {
        const splitValues = splits.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ')
        const splitParams = [bill.id, ...splits.flatMap(s => [s.memberId, s.value])]

        await client.query(`
          INSERT INTO bill_splits (bill_id, member_id, value)
          VALUES ${splitValues}
        `, splitParams)

        // Fetch the splits we just created
        const splitsResult = await client.query(`
          SELECT id, member_id as "memberId", value
          FROM bill_splits WHERE bill_id = $1
        `, [bill.id])

        bill.splits = splitsResult.rows
      } else {
        bill.splits = []
      }

      await client.query('COMMIT')
      res.json(bill)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Bill update error:', error)
    res.status(500).json({ error: 'Failed to update bill' })
  }
})

app.delete('/api/bills/:id', async (req, res) => {
  try {
    await query('DELETE FROM bills WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Bill deletion error:', error)
    res.status(500).json({ error: 'Failed to delete bill' })
  }
})

// Payments API
app.post('/api/payments', async (req, res) => {
  try {
    const { billId, paidDate, amountCents, method, payerMemberId, note, receiptFilename, receiptData, allocations } = req.body
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const paymentResult = await client.query(`
        INSERT INTO payments (bill_id, paid_date, amount_cents, method, payer_member_id, note, receipt_filename, receipt_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, bill_id as "billId", paid_date as "paidDate", amount_cents as "amountCents",
                 method, payer_member_id as "payerMemberId", note, receipt_filename as "receiptFilename",
                 receipt_data as "receiptData", created_at as "createdAt"
      `, [billId, new Date(paidDate), amountCents, method, payerMemberId, note, receiptFilename, receiptData])

      const payment = paymentResult.rows[0]

      // Insert allocations
      if (allocations && allocations.length > 0) {
        const allocValues = allocations.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ')
        const allocParams = [payment.id, ...allocations.flatMap(a => [a.memberId, a.amountCents])]

        await client.query(`
          INSERT INTO payment_allocations (payment_id, member_id, amount_cents)
          VALUES ${allocValues}
        `, allocParams)

        // Fetch the allocations we just created
        const allocResult = await client.query(`
          SELECT id, member_id as "memberId", amount_cents as "amountCents"
          FROM payment_allocations WHERE payment_id = $1
        `, [payment.id])

        payment.allocations = allocResult.rows
      } else {
        payment.allocations = []
      }

      // Fetch payer member info
      if (payerMemberId) {
        const memberResult = await client.query(`
          SELECT id, name, color FROM members WHERE id = $1
        `, [payerMemberId])
        payment.payerMember = memberResult.rows[0] || null
      } else {
        payment.payerMember = null
      }

      await client.query('COMMIT')
      res.json(payment)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Payment creation error:', error)
    res.status(500).json({ error: 'Failed to create payment' })
  }
})

app.put('/api/payments/:id', async (req, res) => {
  try {
    const { paidDate, amountCents, method, payerMemberId, note, allocations } = req.body
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Update the payment
      const paymentResult = await client.query(`
        UPDATE payments SET
          paid_date = $2,
          amount_cents = $3,
          method = $4,
          payer_member_id = $5,
          note = $6
        WHERE id = $1
        RETURNING id, bill_id as "billId", paid_date as "paidDate", amount_cents as "amountCents",
                 method, payer_member_id as "payerMemberId", note, receipt_filename as "receiptFilename",
                 receipt_data as "receiptData", created_at as "createdAt"
      `, [req.params.id, new Date(paidDate), amountCents, method, payerMemberId, note])

      const payment = paymentResult.rows[0]

      // Delete existing allocations
      await client.query('DELETE FROM payment_allocations WHERE payment_id = $1', [req.params.id])

      // Insert new allocations
      if (allocations && allocations.length > 0) {
        const allocValues = allocations.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ')
        const allocParams = [payment.id, ...allocations.flatMap(a => [a.memberId, a.amountCents])]

        await client.query(`
          INSERT INTO payment_allocations (payment_id, member_id, amount_cents)
          VALUES ${allocValues}
        `, allocParams)

        // Fetch the allocations we just created
        const allocResult = await client.query(`
          SELECT id, member_id as "memberId", amount_cents as "amountCents"
          FROM payment_allocations WHERE payment_id = $1
        `, [payment.id])

        payment.allocations = allocResult.rows
      } else {
        payment.allocations = []
      }

      // Fetch payer member info
      if (payerMemberId) {
        const memberResult = await client.query(`
          SELECT id, name, color FROM members WHERE id = $1
        `, [payerMemberId])
        payment.payerMember = memberResult.rows[0] || null
      } else {
        payment.payerMember = null
      }

      await client.query('COMMIT')
      res.json(payment)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Payment update error:', error)
    res.status(500).json({ error: 'Failed to update payment' })
  }
})

app.delete('/api/payments/:id', async (req, res) => {
  try {
    await query('DELETE FROM payments WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Payment deletion error:', error)
    res.status(500).json({ error: 'Failed to delete payment' })
  }
})

// Recurring Bills API
app.get('/api/recurring-bills', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        rb.id, rb.name, rb.amount_cents as "amountCents", rb.day_of_month as "dayOfMonth",
        rb.frequency, rb.last_generated_period as "lastGeneratedPeriod", rb.split_mode as "splitMode",
        rb.created_at as "createdAt", rb.updated_at as "updatedAt",
        COALESCE(
          json_agg(
            DISTINCT jsonb_build_object(
              'id', rbs.id,
              'memberId', rbs.member_id,
              'value', rbs.value
            )
          ) FILTER (WHERE rbs.id IS NOT NULL),
          '[]'
        ) as splits
      FROM recurring_bills rb
      LEFT JOIN recurring_bill_splits rbs ON rb.id = rbs.recurring_bill_id
      GROUP BY rb.id
      ORDER BY rb.created_at ASC
    `)
    res.json(result.rows)
  } catch (error) {
    console.error('Recurring bills fetch error:', error)
    res.status(500).json({ error: 'Failed to fetch recurring bills' })
  }
})

app.post('/api/recurring-bills', async (req, res) => {
  try {
    const { name, amountCents, dayOfMonth, frequency, lastGeneratedPeriod, splitMode, splits } = req.body
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const billResult = await client.query(`
        INSERT INTO recurring_bills (name, amount_cents, day_of_month, frequency, last_generated_period, split_mode)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, amount_cents as "amountCents", day_of_month as "dayOfMonth",
                 frequency, last_generated_period as "lastGeneratedPeriod", split_mode as "splitMode",
                 created_at as "createdAt", updated_at as "updatedAt"
      `, [name, amountCents, dayOfMonth, frequency, lastGeneratedPeriod, splitMode])

      const recurringBill = billResult.rows[0]

      if (splits && splits.length > 0) {
        const splitValues = splits.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ')
        const splitParams = [recurringBill.id, ...splits.flatMap(s => [s.memberId, s.value])]

        await client.query(`
          INSERT INTO recurring_bill_splits (recurring_bill_id, member_id, value)
          VALUES ${splitValues}
        `, splitParams)

        const splitsResult = await client.query(`
          SELECT id, member_id as "memberId", value
          FROM recurring_bill_splits WHERE recurring_bill_id = $1
        `, [recurringBill.id])
        recurringBill.splits = splitsResult.rows
      } else {
        recurringBill.splits = []
      }

      await client.query('COMMIT')
      res.json(recurringBill)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Recurring bill creation error:', error)
    res.status(500).json({ error: 'Failed to create recurring bill' })
  }
})

app.put('/api/recurring-bills/:id', async (req, res) => {
  try {
    const { name, amountCents, dayOfMonth, frequency, splitMode, splits } = req.body
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const billResult = await client.query(`
        UPDATE recurring_bills SET
          name = $2,
          amount_cents = $3,
          day_of_month = $4,
          frequency = $5,
          split_mode = $6,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, name, amount_cents as "amountCents", day_of_month as "dayOfMonth",
                 frequency, last_generated_period as "lastGeneratedPeriod", split_mode as "splitMode",
                 created_at as "createdAt", updated_at as "updatedAt"
      `, [req.params.id, name, amountCents, dayOfMonth, frequency, splitMode])

      const recurringBill = billResult.rows[0]

      await client.query('DELETE FROM recurring_bill_splits WHERE recurring_bill_id = $1', [req.params.id])

      if (splits && splits.length > 0) {
        const splitValues = splits.map((_, i) => `($1, $${i*2+2}, $${i*2+3})`).join(', ')
        const splitParams = [recurringBill.id, ...splits.flatMap(s => [s.memberId, s.value])]

        await client.query(`
          INSERT INTO recurring_bill_splits (recurring_bill_id, member_id, value)
          VALUES ${splitValues}
        `, splitParams)

        const splitsResult = await client.query(`
          SELECT id, member_id as "memberId", value
          FROM recurring_bill_splits WHERE recurring_bill_id = $1
        `, [recurringBill.id])
        recurringBill.splits = splitsResult.rows
      } else {
        recurringBill.splits = []
      }

      await client.query('COMMIT')
      res.json(recurringBill)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Recurring bill update error:', error)
    res.status(500).json({ error: 'Failed to update recurring bill' })
  }
})

app.delete('/api/recurring-bills/:id', async (req, res) => {
  try {
    await query('DELETE FROM recurring_bills WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (error) {
    console.error('Recurring bill deletion error:', error)
    res.status(500).json({ error: 'Failed to delete recurring bill' })
  }
})

// Mortgages API (TODO: Convert to direct SQL)
app.get('/api/mortgages', async (req, res) => {
  try {
    // TODO: Implement direct SQL query for mortgages
    const mortgages = []
    res.json(mortgages)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mortgages' })
  }
})

app.post('/api/mortgages', async (req, res) => {
  try {
    // TODO: Implement direct SQL query for mortgage creation
    const mortgage = { id: 'temp-id', ...req.body, splits: [] }
    res.json(mortgage)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create mortgage' })
  }
})

app.put('/api/mortgages/:id', async (req, res) => {
  try {
    // TODO: Implement direct SQL query for mortgage update
    const mortgage = { id: req.params.id, ...req.body, splits: [] }
    res.json(mortgage)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update mortgage' })
  }
})

app.delete('/api/mortgages/:id', async (req, res) => {
  try {
    // TODO: Implement direct SQL query for mortgage deletion
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete mortgage' })
  }
})

// Mortgage Payments API (TODO: Convert to direct SQL)
app.post('/api/mortgage-payments', async (req, res) => {
  try {
    // TODO: Implement direct SQL query for mortgage payment creation
    const payment = { id: 'temp-id', ...req.body, allocations: [], payerMember: null }
    res.json(payment)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create mortgage payment' })
  }
})

app.put('/api/mortgage-payments/:id', async (req, res) => {
  try {
    // TODO: Implement direct SQL query for mortgage payment update
    const payment = { id: req.params.id, ...req.body, allocations: [], payerMember: null }
    res.json(payment)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update mortgage payment' })
  }
})

app.delete('/api/mortgage-payments/:id', async (req, res) => {
  try {
    // TODO: Implement direct SQL query for mortgage payment deletion
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete mortgage payment' })
  }
})

// Settings API
app.get('/api/settings', async (req, res) => {
  try {
    const result = await query('SELECT key, value FROM settings')
    const settingsObj = result.rows.reduce((acc, row) => {
      acc[row.key] = row.value
      return acc
    }, {} as Record<string, string>)
    res.json(settingsObj)
  } catch (error) {
    console.error('Settings fetch error:', error)
    res.status(500).json({ error: 'Failed to fetch settings' })
  }
})

app.put('/api/settings/:key', async (req, res) => {
  try {
    const { value } = req.body
    const result = await query(`
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
      RETURNING key, value, created_at as "createdAt", updated_at as "updatedAt"
    `, [req.params.key, value])
    res.json(result.rows[0])
  } catch (error) {
    console.error('Settings update error:', error)
    res.status(500).json({ error: 'Failed to update setting' })
  }
})

// Fallback to serve the React app (with rate limiting for static files)
app.use((req, res, next) => {
  // Apply static limiter only to non-API routes
  if (!req.path.startsWith('/api/')) {
    staticLimiter(req, res, next)
  } else {
    next()
  }
})

// Catch-all route for React app
app.use((req, res, next) => {
  // Only serve index.html for non-API routes
  if (!req.path.startsWith('/api/')) {
    res.sendFile('index.html', { root: 'dist' })
  } else {
    res.status(404).json({ error: 'API endpoint not found' })
  }
})

async function startServer() {
  try {
    console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`)
    console.log(`DATABASE_URL is ${process.env.DATABASE_URL ? 'SET' : 'MISSING'}`)

    // Initialize database with our direct SQL approach
    console.log('Initializing database...')
    await initializeDatabase()
    console.log('✅ Database initialized successfully')

    // Test database connection with direct SQL
    console.log('Testing database connection...')
    const result = await query('SELECT COUNT(*) as count FROM members')
    const count = parseInt(result.rows[0].count)
    console.log(`✅ Database connection verified (${count} members found)`)

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`)
      console.log(`🛠️  Debug info: http://localhost:${PORT}/api/debug`)
    })
  } catch (error) {
    console.error('💥 Failed to start server:', error)
    console.log('📋 Environment info:', {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'MISSING'
    })
    process.exit(1)
  }
}

// Graceful shutdown
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

startServer()