import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { query, pool } from './db/connection'
import { initializeDatabase } from './db/init'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 8080

// Rate limiting - configured for Railway reverse proxy
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many API requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Trust proxy is handled by app.set('trust proxy', true) below
})

const staticLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 static file requests per minute
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Trust proxy is handled by app.set('trust proxy', true) below
})

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Trust proxy for Railway deployment - be more specific to avoid rate limiting warnings
app.set('trust proxy', 1) // Trust first proxy (Railway)

// Apply rate limiting
app.use('/api/', apiLimiter)
app.use(express.static('dist', {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000') // 1 year cache
  }
}))

// Health check
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const result = await query('SELECT 1 as test')
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      test: result.rows[0]?.test
    })
  } catch (error) {
    console.error('Health check database error:', error)
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    })
  }
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

app.put('/api/members/:id', async (req, res) => {
  try {
    const { name, color } = req.body
    const result = await query(`
      UPDATE members SET name = $1, color = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, name, color, created_at as "createdAt", updated_at as "updatedAt"
    `, [name, color, req.params.id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Member update error:', error)
    res.status(500).json({ error: 'Failed to update member' })
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
    // First, get basic bill information
    const billsResult = await query(`
      SELECT
        id, name, amount_cents as "amountCents", due_date as "dueDate",
        recurring_bill_id as "recurringBillId", period, split_mode as "splitMode",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM bills
      ORDER BY due_date DESC
    `)

    const bills = billsResult.rows

    // For each bill, get splits and payments separately
    for (const bill of bills) {
      // Get splits
      const splitsResult = await query(`
        SELECT id, member_id as "memberId", value
        FROM bill_splits
        WHERE bill_id = $1
      `, [bill.id])
      bill.splits = splitsResult.rows

      // Get payments with basic info
      const paymentsResult = await query(`
        SELECT
          p.id, p.amount_cents as "amountCents", p.payer_member_id as "payerId",
          p.note, p.created_at as "createdAt",
          m.id as "payerMemberId", m.name as "payerMemberName", m.color as "payerMemberColor"
        FROM payments p
        LEFT JOIN members m ON p.payer_member_id = m.id
        WHERE p.bill_id = $1
        ORDER BY p.created_at DESC
      `, [bill.id])

      // Process payments and get allocations
      bill.payments = []
      for (const payment of paymentsResult.rows) {
        const allocationsResult = await query(`
          SELECT id, member_id as "memberId", amount_cents as "amountCents"
          FROM payment_allocations
          WHERE payment_id = $1
        `, [payment.id])

        bill.payments.push({
          id: payment.id,
          amountCents: payment.amountCents,
          payerId: payment.payerId,
          note: payment.note,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          payerMember: payment.payerMemberId ? {
            id: payment.payerMemberId,
            name: payment.payerMemberName,
            color: payment.payerMemberColor
          } : null,
          allocations: allocationsResult.rows
        })
      }
    }

    res.json(bills)
  } catch (error) {
    console.error('Bills fetch error:', error)
    res.status(500).json({ error: 'Failed to fetch bills' })
  }
})

app.post('/api/bills', async (req, res) => {
  try {
    const { name, amount, amountCents, dueDate, recurringBillId, period, splitMode, splits } = req.body
    // Handle both frontend (amount in dollars) and API (amountCents) formats
    const finalAmountCents = amountCents || (amount ? Math.round(amount * 100) : 0)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const billResult = await client.query(`
        INSERT INTO bills (name, amount_cents, due_date, recurring_bill_id, period, split_mode)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, amount_cents as "amountCents", due_date as "dueDate",
                 recurring_bill_id as "recurringBillId", period, split_mode as "splitMode",
                 created_at as "createdAt", updated_at as "updatedAt"
      `, [name, finalAmountCents, new Date(dueDate), recurringBillId, period, splitMode])

      const bill = billResult.rows[0]

      if (splits && splits.length > 0) {
        // Insert splits one by one to avoid parameter binding issues
        const insertedSplits = []
        for (const split of splits) {
          const splitResult = await client.query(`
            INSERT INTO bill_splits (bill_id, member_id, value)
            VALUES ($1, $2, $3)
            RETURNING id, member_id as "memberId", value
          `, [bill.id, split.memberId || split.personId, split.value])
          insertedSplits.push(splitResult.rows[0])
        }
        bill.splits = insertedSplits
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
        // Insert splits one by one to avoid parameter binding issues
        const insertedSplits = []
        for (const split of splits) {
          const splitResult = await client.query(`
            INSERT INTO bill_splits (bill_id, member_id, value)
            VALUES ($1, $2, $3)
            RETURNING id, member_id as "memberId", value
          `, [bill.id, split.memberId || split.personId, split.value])
          insertedSplits.push(splitResult.rows[0])
        }
        bill.splits = insertedSplits
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
        // Insert allocations one by one to avoid parameter binding issues
        const insertedAllocations = []
        for (const allocation of allocations) {
          const allocResult = await client.query(`
            INSERT INTO payment_allocations (payment_id, member_id, amount_cents)
            VALUES ($1, $2, $3)
            RETURNING id, member_id as "memberId", amount_cents as "amountCents"
          `, [payment.id, allocation.memberId, allocation.amountCents])
          insertedAllocations.push(allocResult.rows[0])
        }
        payment.allocations = insertedAllocations
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
        // Insert allocations one by one to avoid parameter binding issues
        const insertedAllocations = []
        for (const allocation of allocations) {
          const allocResult = await client.query(`
            INSERT INTO payment_allocations (payment_id, member_id, amount_cents)
            VALUES ($1, $2, $3)
            RETURNING id, member_id as "memberId", amount_cents as "amountCents"
          `, [payment.id, allocation.memberId, allocation.amountCents])
          insertedAllocations.push(allocResult.rows[0])
        }
        payment.allocations = insertedAllocations
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
    const { name, amount, amountCents, dayOfMonth, frequency, lastGeneratedPeriod, splitMode, splits } = req.body
    // Handle both frontend (amount in dollars) and API (amountCents) formats
    const finalAmountCents = amountCents || (amount ? Math.round(amount * 100) : 0)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const billResult = await client.query(`
        INSERT INTO recurring_bills (name, amount_cents, day_of_month, frequency, last_generated_period, split_mode)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, amount_cents as "amountCents", day_of_month as "dayOfMonth",
                 frequency, last_generated_period as "lastGeneratedPeriod", split_mode as "splitMode",
                 created_at as "createdAt", updated_at as "updatedAt"
      `, [name, finalAmountCents, dayOfMonth, frequency, lastGeneratedPeriod, splitMode])

      const recurringBill = billResult.rows[0]

      if (splits && splits.length > 0) {
        // Insert splits one by one to avoid parameter binding issues
        const insertedSplits = []
        for (const split of splits) {
          const splitResult = await client.query(`
            INSERT INTO recurring_bill_splits (recurring_bill_id, member_id, value)
            VALUES ($1, $2, $3)
            RETURNING id, member_id as "memberId", value
          `, [recurringBill.id, split.memberId, split.value])
          insertedSplits.push(splitResult.rows[0])
        }
        recurringBill.splits = insertedSplits
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
        // Insert splits one by one to avoid parameter binding issues
        const insertedSplits = []
        for (const split of splits) {
          const splitResult = await client.query(`
            INSERT INTO recurring_bill_splits (recurring_bill_id, member_id, value)
            VALUES ($1, $2, $3)
            RETURNING id, member_id as "memberId", value
          `, [recurringBill.id, split.memberId, split.value])
          insertedSplits.push(splitResult.rows[0])
        }
        recurringBill.splits = insertedSplits
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

// Mortgages API
app.get('/api/mortgages', async (req, res) => {
  try {
    console.log('=== MORTGAGE GET DEBUG ===')
    // Get all mortgages with splits
    const mortgagesResult = await query(`
      SELECT
        id, name, lender, is_primary,
        original_principal_cents, current_principal_cents,
        interest_rate_apy, term_months,
        start_date, scheduled_payment_cents,
        payment_day, escrow_enabled,
        escrow_taxes_cents, escrow_insurance_cents,
        escrow_mip_cents, escrow_hoa_cents,
        notes, active, split_mode,
        created_at, updated_at
      FROM mortgages
      ORDER BY created_at DESC
    `)

    // Get splits for each mortgage and convert cents to dollars as numbers
    const mortgages = []
    for (const mortgage of mortgagesResult.rows) {
      const splitsResult = await query(`
        SELECT id, member_id as "memberId", value
        FROM mortgage_splits
        WHERE mortgage_id = $1
      `, [mortgage.id])

      // Convert to API format: camelCase field names with cent amounts
      const formattedMortgage = {
        id: mortgage.id,
        name: mortgage.name,
        lender: mortgage.lender,
        isPrimary: mortgage.is_primary,
        originalPrincipalCents: mortgage.original_principal_cents,
        currentPrincipalCents: mortgage.current_principal_cents,
        interestRateApy: mortgage.interest_rate_apy,
        termMonths: mortgage.term_months,
        startDate: mortgage.start_date,
        scheduledPaymentCents: mortgage.scheduled_payment_cents,
        paymentDay: mortgage.payment_day,
        escrowEnabled: mortgage.escrow_enabled,
        escrowTaxesCents: mortgage.escrow_taxes_cents,
        escrowInsuranceCents: mortgage.escrow_insurance_cents,
        escrowMipCents: mortgage.escrow_mip_cents,
        escrowHoaCents: mortgage.escrow_hoa_cents,
        notes: mortgage.notes,
        active: mortgage.active,
        splitMode: mortgage.split_mode,
        createdAt: mortgage.created_at,
        updatedAt: mortgage.updated_at,
        splits: splitsResult.rows.map(split => ({
          id: split.id,
          mortgageId: mortgage.id,
          memberId: split.memberId,
          value: split.value,
          createdAt: split.created_at
        }))
      }

      mortgages.push(formattedMortgage)
    }

    console.log('Returning mortgages:', JSON.stringify(mortgages, null, 2))
    console.log('========================')
    res.json(mortgages)
  } catch (error) {
    console.error('Error fetching mortgages:', error)
    res.status(500).json({ error: 'Failed to fetch mortgages' })
  }
})

app.post('/api/mortgages', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Debug logging to see what we're receiving
    console.log('=== MORTGAGE CREATE DEBUG ===')
    console.log('Full request body:', JSON.stringify(req.body, null, 2))
    console.log('=============================')

    const {
      name, lender, isPrimary, originalPrincipalCents, currentPrincipalCents,
      interestRateApy, termMonths, startDate, scheduledPaymentCents,
      paymentDay, escrowEnabled, escrowTaxesCents, escrowInsuranceCents,
      escrowMipCents, escrowHoaCents, notes, active, splitMode, splits
    } = req.body

    // Debug the extracted values
    console.log('Extracted values:')
    console.log('name:', name)
    console.log('originalPrincipalCents:', originalPrincipalCents)
    console.log('currentPrincipalCents:', currentPrincipalCents)
    console.log('scheduledPaymentCents:', scheduledPaymentCents)
    console.log('active:', active)

    // Insert mortgage
    const mortgageResult = await client.query(`
      INSERT INTO mortgages (
        name, lender, is_primary, original_principal_cents, current_principal_cents,
        interest_rate_apy, term_months, start_date, scheduled_payment_cents,
        payment_day, escrow_enabled, escrow_taxes_cents, escrow_insurance_cents,
        escrow_mip_cents, escrow_hoa_cents, notes, active, split_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING id, name, lender, is_primary,
               original_principal_cents / 100.0 as "original_principal",
               current_principal_cents / 100.0 as "current_principal",
               interest_rate_apy, term_months,
               start_date, scheduled_payment_cents / 100.0 as "scheduled_payment",
               payment_day, escrow_enabled,
               escrow_taxes_cents / 100.0 as "escrow_taxes",
               escrow_insurance_cents / 100.0 as "escrow_insurance",
               escrow_mip_cents / 100.0 as "escrow_mip",
               escrow_hoa_cents / 100.0 as "escrow_hoa",
               notes, active, split_mode,
               created_at, updated_at
    `, [name, lender, isPrimary, originalPrincipalCents, currentPrincipalCents,
        interestRateApy, termMonths, startDate, scheduledPaymentCents,
        paymentDay, escrowEnabled, escrowTaxesCents, escrowInsuranceCents,
        escrowMipCents, escrowHoaCents, notes, active, splitMode])

    const mortgage = mortgageResult.rows[0]

    // Insert splits
    if (splits && splits.length > 0) {
      const insertedSplits = []
      for (const split of splits) {
        const splitResult = await client.query(`
          INSERT INTO mortgage_splits (mortgage_id, member_id, value)
          VALUES ($1, $2, $3)
          RETURNING id, member_id as "memberId", value
        `, [mortgage.id, split.memberId, split.value])
        insertedSplits.push({
          personId: split.memberId,
          value: split.value
        })
      }
      mortgage.splits = insertedSplits
    } else {
      mortgage.splits = []
    }

    // Convert to API format: camelCase field names with cent amounts
    const formattedMortgage = {
      id: mortgage.id,
      name: mortgage.name,
      lender: mortgage.lender,
      isPrimary: mortgage.is_primary,
      originalPrincipalCents: Math.round((mortgage.original_principal || 0) * 100),
      currentPrincipalCents: Math.round((mortgage.current_principal || 0) * 100),
      interestRateApy: mortgage.interest_rate_apy,
      termMonths: mortgage.term_months,
      startDate: mortgage.start_date,
      scheduledPaymentCents: Math.round((mortgage.scheduled_payment || 0) * 100),
      paymentDay: mortgage.payment_day,
      escrowEnabled: mortgage.escrow_enabled,
      escrowTaxesCents: mortgage.escrow_taxes ? Math.round(mortgage.escrow_taxes * 100) : undefined,
      escrowInsuranceCents: mortgage.escrow_insurance ? Math.round(mortgage.escrow_insurance * 100) : undefined,
      escrowMipCents: mortgage.escrow_mip ? Math.round(mortgage.escrow_mip * 100) : undefined,
      escrowHoaCents: mortgage.escrow_hoa ? Math.round(mortgage.escrow_hoa * 100) : undefined,
      notes: mortgage.notes,
      active: mortgage.active,
      splitMode: mortgage.split_mode,
      createdAt: mortgage.created_at,
      updatedAt: mortgage.updated_at,
      splits: mortgage.splits
    }

    await client.query('COMMIT')
    res.json(formattedMortgage)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error creating mortgage:', error)
    res.status(500).json({ error: 'Failed to create mortgage' })
  } finally {
    client.release()
  }
})

app.put('/api/mortgages/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const {
      name, lender, isPrimary, originalPrincipalCents, currentPrincipalCents,
      interestRateApy, termMonths, startDate, scheduledPaymentCents,
      paymentDay, escrowEnabled, escrowTaxesCents, escrowInsuranceCents,
      escrowMipCents, escrowHoaCents, notes, active, splitMode, splits
    } = req.body

    // Update mortgage
    const mortgageResult = await client.query(`
      UPDATE mortgages SET
        name = $2, lender = $3, is_primary = $4, original_principal_cents = $5,
        current_principal_cents = $6, interest_rate_apy = $7, term_months = $8,
        start_date = $9, scheduled_payment_cents = $10, payment_day = $11,
        escrow_enabled = $12, escrow_taxes_cents = $13, escrow_insurance_cents = $14,
        escrow_mip_cents = $15, escrow_hoa_cents = $16, notes = $17,
        active = $18, split_mode = $19, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, lender, is_primary,
               original_principal_cents, current_principal_cents,
               interest_rate_apy, term_months,
               start_date, scheduled_payment_cents,
               payment_day, escrow_enabled,
               escrow_taxes_cents, escrow_insurance_cents,
               escrow_mip_cents, escrow_hoa_cents,
               notes, active, split_mode,
               created_at, updated_at
    `, [req.params.id, name, lender, isPrimary, originalPrincipalCents, currentPrincipalCents,
        interestRateApy, termMonths, startDate, scheduledPaymentCents,
        paymentDay, escrowEnabled, escrowTaxesCents, escrowInsuranceCents,
        escrowMipCents, escrowHoaCents, notes, active, splitMode])

    const mortgage = mortgageResult.rows[0]

    // Delete existing splits
    await client.query('DELETE FROM mortgage_splits WHERE mortgage_id = $1', [req.params.id])

    // Insert new splits
    if (splits && splits.length > 0) {
      const insertedSplits = []
      for (const split of splits) {
        const splitResult = await client.query(`
          INSERT INTO mortgage_splits (mortgage_id, member_id, value)
          VALUES ($1, $2, $3)
          RETURNING id, member_id as "memberId", value
        `, [mortgage.id, split.memberId, split.value])
        insertedSplits.push({
          personId: split.memberId,
          value: split.value
        })
      }
      mortgage.splits = insertedSplits
    } else {
      mortgage.splits = []
    }

    // Convert to API format: camelCase field names with cent amounts
    const formattedMortgage = {
      id: mortgage.id,
      name: mortgage.name,
      lender: mortgage.lender,
      isPrimary: mortgage.is_primary,
      originalPrincipalCents: mortgage.original_principal_cents,
      currentPrincipalCents: mortgage.current_principal_cents,
      interestRateApy: mortgage.interest_rate_apy,
      termMonths: mortgage.term_months,
      startDate: mortgage.start_date,
      scheduledPaymentCents: mortgage.scheduled_payment_cents,
      paymentDay: mortgage.payment_day,
      escrowEnabled: mortgage.escrow_enabled,
      escrowTaxesCents: mortgage.escrow_taxes_cents,
      escrowInsuranceCents: mortgage.escrow_insurance_cents,
      escrowMipCents: mortgage.escrow_mip_cents,
      escrowHoaCents: mortgage.escrow_hoa_cents,
      notes: mortgage.notes,
      active: mortgage.active,
      splitMode: mortgage.split_mode,
      createdAt: mortgage.created_at,
      updatedAt: mortgage.updated_at,
      splits: mortgage.splits
    }

    await client.query('COMMIT')
    res.json(formattedMortgage)
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('Error updating mortgage:', error)
    res.status(500).json({ error: 'Failed to update mortgage' })
  } finally {
    client.release()
  }
})

app.delete('/api/mortgages/:id', async (req, res) => {
  try {
    // Delete mortgage (cascade will handle splits and payments)
    const result = await query('DELETE FROM mortgages WHERE id = $1', [req.params.id])

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Mortgage not found' })
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting mortgage:', error)
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

// Financial calculation utilities for financed expenses
function calculateMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) {
    return principal / termMonths;
  }

  const monthlyRate = annualRate / 100 / 12;
  const numerator = principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths);
  const denominator = Math.pow(1 + monthlyRate, termMonths) - 1;
  return numerator / denominator;
}

function generatePaymentSchedule(
  totalAmountCents: number,
  interestRatePercent: number,
  termMonths: number,
  firstPaymentDate: string
): Array<{
  paymentNumber: number;
  dueDate: string;
  amountCents: number;
  principalCents: number;
  interestCents: number;
}> {
  const schedule: Array<{
    paymentNumber: number;
    dueDate: string;
    amountCents: number;
    principalCents: number;
    interestCents: number;
  }> = [];

  const monthlyPaymentCents = Math.round(calculateMonthlyPayment(totalAmountCents, interestRatePercent, termMonths));
  let remainingPrincipalCents = totalAmountCents;
  const monthlyRate = interestRatePercent / 100 / 12;

  const startDate = new Date(firstPaymentDate);

  for (let i = 1; i <= termMonths; i++) {
    // Calculate due date
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    // Calculate interest and principal for this payment
    const interestCents = Math.round(remainingPrincipalCents * monthlyRate);
    let principalCents = monthlyPaymentCents - interestCents;

    // For final payment, ensure we pay off exactly the remaining principal
    if (i === termMonths) {
      principalCents = remainingPrincipalCents;
    }

    const actualPaymentCents = principalCents + interestCents;

    schedule.push({
      paymentNumber: i,
      dueDate: dueDate.toISOString().split('T')[0],
      amountCents: actualPaymentCents,
      principalCents,
      interestCents
    });

    remainingPrincipalCents -= principalCents;
  }

  return schedule;
}

// Financed Expenses API
app.get('/api/financed-expenses', async (req, res) => {
  try {
    // Get all financed expenses
    const expensesResult = await query(`
      SELECT
        id, title, description, total_amount_cents, monthly_payment_cents,
        interest_rate_percent, financing_term_months, purchase_date,
        first_payment_date, is_active, split_mode,
        created_at, updated_at
      FROM financed_expenses
      ORDER BY created_at DESC
    `);

    const expenses = [];
    for (const expense of expensesResult.rows) {
      // Get splits for this expense
      const splitsResult = await query(`
        SELECT id, member_id as "memberId", value
        FROM financed_expense_splits
        WHERE financed_expense_id = $1
      `, [expense.id]);

      // Get payment summary
      const paymentSummaryResult = await query(`
        SELECT
          COUNT(*) as total_payments,
          COUNT(*) FILTER (WHERE is_paid = true) as paid_payments,
          SUM(amount_cents) FILTER (WHERE is_paid = true) as total_paid_cents,
          MIN(due_date) FILTER (WHERE is_paid = false) as next_due_date
        FROM financed_expense_payments
        WHERE financed_expense_id = $1
      `, [expense.id]);

      const paymentSummary = paymentSummaryResult.rows[0];
      const totalPaidCents = parseInt(paymentSummary.total_paid_cents || '0');
      const remainingBalanceCents = expense.total_amount_cents - totalPaidCents;

      expenses.push({
        id: expense.id,
        title: expense.title,
        description: expense.description,
        totalAmountCents: expense.total_amount_cents,
        monthlyPaymentCents: expense.monthly_payment_cents,
        interestRatePercent: parseFloat(expense.interest_rate_percent),
        financingTermMonths: expense.financing_term_months,
        purchaseDate: expense.purchase_date,
        firstPaymentDate: expense.first_payment_date,
        isActive: expense.is_active,
        splitMode: expense.split_mode,
        createdAt: expense.created_at,
        updatedAt: expense.updated_at,
        splits: splitsResult.rows,
        paymentSummary: {
          totalPayments: parseInt(paymentSummary.total_payments),
          paidPayments: parseInt(paymentSummary.paid_payments),
          totalPaidCents,
          remainingBalanceCents,
          nextDueDate: paymentSummary.next_due_date
        }
      });
    }

    res.json(expenses);
  } catch (error) {
    console.error('Financed expenses fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch financed expenses' });
  }
});

app.post('/api/financed-expenses', async (req, res) => {
  try {
    const {
      title, description, totalAmountCents, interestRatePercent,
      financingTermMonths, purchaseDate, firstPaymentDate,
      isActive = true, splitMode, splits
    } = req.body;

    // Validation
    if (!title || !totalAmountCents || !financingTermMonths || !purchaseDate || !firstPaymentDate) {
      return res.status(400).json({ error: 'Missing required fields: title, totalAmountCents, financingTermMonths, purchaseDate, firstPaymentDate' });
    }

    if (totalAmountCents <= 0) {
      return res.status(400).json({ error: 'Total amount must be greater than 0' });
    }

    if (financingTermMonths <= 0) {
      return res.status(400).json({ error: 'Financing term must be greater than 0' });
    }

    if (interestRatePercent < 0) {
      return res.status(400).json({ error: 'Interest rate cannot be negative' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Calculate monthly payment
      const monthlyPaymentCents = Math.round(calculateMonthlyPayment(
        totalAmountCents,
        interestRatePercent,
        financingTermMonths
      ));

      // Insert financed expense
      const expenseResult = await client.query(`
        INSERT INTO financed_expenses (
          title, description, total_amount_cents, monthly_payment_cents,
          interest_rate_percent, financing_term_months, purchase_date,
          first_payment_date, is_active, split_mode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, title, description, total_amount_cents as "totalAmountCents",
                 monthly_payment_cents as "monthlyPaymentCents",
                 interest_rate_percent as "interestRatePercent",
                 financing_term_months as "financingTermMonths",
                 purchase_date as "purchaseDate", first_payment_date as "firstPaymentDate",
                 is_active as "isActive", split_mode as "splitMode",
                 created_at as "createdAt", updated_at as "updatedAt"
      `, [title, description, totalAmountCents, monthlyPaymentCents,
          interestRatePercent, financingTermMonths, purchaseDate,
          firstPaymentDate, isActive, splitMode]);

      const expense = expenseResult.rows[0];

      // Insert splits
      const insertedSplits = [];
      if (splits && splits.length > 0) {
        for (const split of splits) {
          const splitResult = await client.query(`
            INSERT INTO financed_expense_splits (financed_expense_id, member_id, value)
            VALUES ($1, $2, $3)
            RETURNING id, member_id as "memberId", value
          `, [expense.id, split.memberId, split.value]);
          insertedSplits.push(splitResult.rows[0]);
        }
      }
      expense.splits = insertedSplits;

      // Generate payment schedule
      const paymentSchedule = generatePaymentSchedule(
        totalAmountCents,
        interestRatePercent,
        financingTermMonths,
        firstPaymentDate
      );

      // Insert payment schedule
      for (const payment of paymentSchedule) {
        await client.query(`
          INSERT INTO financed_expense_payments (
            financed_expense_id, payment_number, due_date,
            amount_cents, principal_cents, interest_cents
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [expense.id, payment.paymentNumber, payment.dueDate,
            payment.amountCents, payment.principalCents, payment.interestCents]);
      }

      await client.query('COMMIT');
      res.status(201).json(expense);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Financed expense creation error:', error);
    res.status(500).json({ error: 'Failed to create financed expense' });
  }
});

app.get('/api/financed-expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get financed expense details
    const expenseResult = await query(`
      SELECT
        id, title, description, total_amount_cents, monthly_payment_cents,
        interest_rate_percent, financing_term_months, purchase_date,
        first_payment_date, is_active, split_mode,
        created_at, updated_at
      FROM financed_expenses
      WHERE id = $1
    `, [id]);

    if (expenseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Financed expense not found' });
    }

    const expense = expenseResult.rows[0];

    // Get splits
    const splitsResult = await query(`
      SELECT id, member_id as "memberId", value
      FROM financed_expense_splits
      WHERE financed_expense_id = $1
    `, [id]);

    // Get all payments with status
    const paymentsResult = await query(`
      SELECT
        id, payment_number, due_date, amount_cents,
        principal_cents, interest_cents, is_paid,
        paid_date, bill_id
      FROM financed_expense_payments
      WHERE financed_expense_id = $1
      ORDER BY payment_number ASC
    `, [id]);

    // Calculate summary statistics
    const totalPaidCents = paymentsResult.rows
      .filter(p => p.is_paid)
      .reduce((sum, p) => sum + p.amount_cents, 0);

    const remainingBalanceCents = expense.total_amount_cents - totalPaidCents;
    const nextUnpaidPayment = paymentsResult.rows.find(p => !p.is_paid);

    res.json({
      id: expense.id,
      title: expense.title,
      description: expense.description,
      totalAmountCents: expense.total_amount_cents,
      monthlyPaymentCents: expense.monthly_payment_cents,
      interestRatePercent: parseFloat(expense.interest_rate_percent),
      financingTermMonths: expense.financing_term_months,
      purchaseDate: expense.purchase_date,
      firstPaymentDate: expense.first_payment_date,
      isActive: expense.is_active,
      splitMode: expense.split_mode,
      createdAt: expense.created_at,
      updatedAt: expense.updated_at,
      splits: splitsResult.rows,
      payments: paymentsResult.rows.map(payment => ({
        id: payment.id,
        paymentNumber: payment.payment_number,
        dueDate: payment.due_date,
        amountCents: payment.amount_cents,
        principalCents: payment.principal_cents,
        interestCents: payment.interest_cents,
        isPaid: payment.is_paid,
        paidDate: payment.paid_date,
        billId: payment.bill_id
      })),
      summary: {
        totalPaidCents,
        remainingBalanceCents,
        nextDueDate: nextUnpaidPayment?.due_date,
        paymentsRemaining: paymentsResult.rows.filter(p => !p.is_paid).length
      }
    });
  } catch (error) {
    console.error('Financed expense fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch financed expense' });
  }
});

app.put('/api/financed-expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, totalAmountCents, interestRatePercent,
      financingTermMonths, purchaseDate, firstPaymentDate,
      isActive, splitMode, splits
    } = req.body;

    // Validation - title is optional for updates

    if (totalAmountCents !== undefined && totalAmountCents <= 0) {
      return res.status(400).json({ error: 'Total amount must be greater than 0' });
    }

    if (financingTermMonths !== undefined && financingTermMonths <= 0) {
      return res.status(400).json({ error: 'Financing term must be greater than 0' });
    }

    if (interestRatePercent !== undefined && interestRatePercent < 0) {
      return res.status(400).json({ error: 'Interest rate cannot be negative' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if expense exists
      const existingExpense = await client.query(
        'SELECT * FROM financed_expenses WHERE id = $1',
        [id]
      );

      if (existingExpense.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Financed expense not found' });
      }

      const currentExpense = existingExpense.rows[0];

      // Determine if we need to recalculate payment schedule
      const needsRecalculation =
        (totalAmountCents !== undefined && totalAmountCents !== currentExpense.total_amount_cents) ||
        (interestRatePercent !== undefined && interestRatePercent !== parseFloat(currentExpense.interest_rate_percent)) ||
        (financingTermMonths !== undefined && financingTermMonths !== currentExpense.financing_term_months) ||
        (firstPaymentDate !== undefined && firstPaymentDate !== currentExpense.first_payment_date);

      // Use current values if not provided in update
      const finalTotalAmountCents = totalAmountCents ?? currentExpense.total_amount_cents;
      const finalInterestRatePercent = interestRatePercent ?? parseFloat(currentExpense.interest_rate_percent);
      const finalFinancingTermMonths = financingTermMonths ?? currentExpense.financing_term_months;
      const finalFirstPaymentDate = firstPaymentDate ?? currentExpense.first_payment_date;

      // Calculate new monthly payment if needed
      const monthlyPaymentCents = needsRecalculation
        ? Math.round(calculateMonthlyPayment(finalTotalAmountCents, finalInterestRatePercent, finalFinancingTermMonths))
        : currentExpense.monthly_payment_cents;

      // Update financed expense
      const expenseResult = await client.query(`
        UPDATE financed_expenses SET
          title = $2, description = $3, total_amount_cents = $4,
          monthly_payment_cents = $5, interest_rate_percent = $6,
          financing_term_months = $7, purchase_date = $8,
          first_payment_date = $9, is_active = $10, split_mode = $11,
          updated_at = NOW()
        WHERE id = $1
        RETURNING id, title, description, total_amount_cents as "totalAmountCents",
                 monthly_payment_cents as "monthlyPaymentCents",
                 interest_rate_percent as "interestRatePercent",
                 financing_term_months as "financingTermMonths",
                 purchase_date as "purchaseDate", first_payment_date as "firstPaymentDate",
                 is_active as "isActive", split_mode as "splitMode",
                 created_at as "createdAt", updated_at as "updatedAt"
      `, [id, title ?? currentExpense.title, description ?? currentExpense.description,
          finalTotalAmountCents, monthlyPaymentCents, finalInterestRatePercent,
          finalFinancingTermMonths, purchaseDate ?? currentExpense.purchase_date,
          finalFirstPaymentDate, isActive ?? currentExpense.is_active,
          splitMode ?? currentExpense.split_mode]);

      const expense = expenseResult.rows[0];

      // Update splits if provided
      if (splits !== undefined) {
        await client.query('DELETE FROM financed_expense_splits WHERE financed_expense_id = $1', [id]);

        const insertedSplits = [];
        for (const split of splits) {
          const splitResult = await client.query(`
            INSERT INTO financed_expense_splits (financed_expense_id, member_id, value)
            VALUES ($1, $2, $3)
            RETURNING id, member_id as "memberId", value
          `, [id, split.memberId, split.value]);
          insertedSplits.push(splitResult.rows[0]);
        }
        expense.splits = insertedSplits;
      } else {
        // Get existing splits
        const splitsResult = await client.query(`
          SELECT id, member_id as "memberId", value
          FROM financed_expense_splits
          WHERE financed_expense_id = $1
        `, [id]);
        expense.splits = splitsResult.rows;
      }

      // Recalculate payment schedule if needed
      if (needsRecalculation) {
        // Delete existing unpaid payments
        await client.query(
          'DELETE FROM financed_expense_payments WHERE financed_expense_id = $1 AND is_paid = false',
          [id]
        );

        // Get the number of paid payments to determine starting payment number
        const paidPaymentsResult = await client.query(
          'SELECT COUNT(*) as count FROM financed_expense_payments WHERE financed_expense_id = $1 AND is_paid = true',
          [id]
        );
        const paidPaymentsCount = parseInt(paidPaymentsResult.rows[0].count);
        const remainingTermMonths = finalFinancingTermMonths - paidPaymentsCount;

        if (remainingTermMonths > 0) {
          // Calculate remaining principal
          const totalPaidResult = await client.query(
            'SELECT SUM(principal_cents) as total_paid FROM financed_expense_payments WHERE financed_expense_id = $1 AND is_paid = true',
            [id]
          );
          const totalPaidPrincipal = parseInt(totalPaidResult.rows[0].total_paid || '0');
          const remainingPrincipal = finalTotalAmountCents - totalPaidPrincipal;

          // Generate new payment schedule for remaining payments
          const nextPaymentDate = new Date(finalFirstPaymentDate);
          nextPaymentDate.setMonth(nextPaymentDate.getMonth() + paidPaymentsCount);

          const newPaymentSchedule = generatePaymentSchedule(
            remainingPrincipal,
            finalInterestRatePercent,
            remainingTermMonths,
            nextPaymentDate.toISOString().split('T')[0]
          );

          // Insert new payment schedule
          for (const payment of newPaymentSchedule) {
            await client.query(`
              INSERT INTO financed_expense_payments (
                financed_expense_id, payment_number, due_date,
                amount_cents, principal_cents, interest_cents
              ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [id, paidPaymentsCount + payment.paymentNumber, payment.dueDate,
                payment.amountCents, payment.principalCents, payment.interestCents]);
          }
        }
      }

      await client.query('COMMIT');
      res.json(expense);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Financed expense update error:', error);
    res.status(500).json({ error: 'Failed to update financed expense' });
  }
});

app.get('/api/financed-expenses/:id/payments', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify expense exists
    const expenseCheck = await query(
      'SELECT id FROM financed_expenses WHERE id = $1',
      [id]
    );

    if (expenseCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Financed expense not found' });
    }

    // Get all payments for this expense
    const paymentsResult = await query(`
      SELECT
        id, payment_number, due_date, amount_cents,
        principal_cents, interest_cents, is_paid,
        paid_date, bill_id, created_at
      FROM financed_expense_payments
      WHERE financed_expense_id = $1
      ORDER BY payment_number ASC
    `, [id]);

    const payments = paymentsResult.rows.map(payment => ({
      id: payment.id,
      financedExpenseId: id,
      paymentNumber: payment.payment_number,
      dueDate: payment.due_date,
      amountCents: payment.amount_cents,
      principalCents: payment.principal_cents,
      interestCents: payment.interest_cents,
      isPaid: payment.is_paid,
      paidDate: payment.paid_date,
      billId: payment.bill_id,
      createdAt: payment.created_at
    }));

    res.json(payments);
  } catch (error) {
    console.error('Financed expense payments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch financed expense payments' });
  }
});

app.post('/api/financed-expenses/:id/payments/:paymentId/mark-paid', async (req, res) => {
  try {
    const { id, paymentId } = req.params;
    const { paidDate, createBill = false } = req.body;

    // Validation
    if (!paidDate) {
      return res.status(400).json({ error: 'Paid date is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify payment exists and belongs to the expense
      const paymentResult = await client.query(`
        SELECT p.*, fe.title, fe.split_mode
        FROM financed_expense_payments p
        JOIN financed_expenses fe ON p.financed_expense_id = fe.id
        WHERE p.id = $1 AND p.financed_expense_id = $2
      `, [paymentId, id]);

      if (paymentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Payment not found' });
      }

      const payment = paymentResult.rows[0];

      if (payment.is_paid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Payment is already marked as paid' });
      }

      // Mark payment as paid
      const updatedPaymentResult = await client.query(`
        UPDATE financed_expense_payments
        SET is_paid = true, paid_date = $2
        WHERE id = $1
        RETURNING id, payment_number, due_date, amount_cents,
                 principal_cents, interest_cents, is_paid,
                 paid_date, bill_id
      `, [paymentId, paidDate]);

      const updatedPayment = updatedPaymentResult.rows[0];

      // Optionally create a corresponding bill
      let billId = null;
      if (createBill) {
        // Get expense splits to create bill splits
        const splitsResult = await client.query(`
          SELECT member_id, value
          FROM financed_expense_splits
          WHERE financed_expense_id = $1
        `, [id]);

        // Create bill
        const billResult = await client.query(`
          INSERT INTO bills (name, amount_cents, due_date, split_mode)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [
          `${payment.title} - Payment #${payment.payment_number}`,
          payment.amount_cents,
          payment.due_date,
          payment.split_mode
        ]);

        billId = billResult.rows[0].id;

        // Create bill splits
        for (const split of splitsResult.rows) {
          await client.query(`
            INSERT INTO bill_splits (bill_id, member_id, value)
            VALUES ($1, $2, $3)
          `, [billId, split.member_id, split.value]);
        }

        // Link payment to bill
        await client.query(
          'UPDATE financed_expense_payments SET bill_id = $1 WHERE id = $2',
          [billId, paymentId]
        );
      }

      // Check if this was the final payment and update expense status
      const remainingPaymentsResult = await client.query(
        'SELECT COUNT(*) as count FROM financed_expense_payments WHERE financed_expense_id = $1 AND is_paid = false',
        [id]
      );

      const remainingPayments = parseInt(remainingPaymentsResult.rows[0].count);
      if (remainingPayments === 0) {
        await client.query(
          'UPDATE financed_expenses SET is_active = false WHERE id = $1',
          [id]
        );
      }

      await client.query('COMMIT');

      res.json({
        id: updatedPayment.id,
        paymentNumber: updatedPayment.payment_number,
        dueDate: updatedPayment.due_date,
        amountCents: updatedPayment.amount_cents,
        principalCents: updatedPayment.principal_cents,
        interestCents: updatedPayment.interest_cents,
        isPaid: updatedPayment.is_paid,
        paidDate: updatedPayment.paid_date,
        billId: billId || updatedPayment.bill_id,
        ...(billId && { createdBillId: billId })
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Mark payment as paid error:', error);
    res.status(500).json({ error: 'Failed to mark payment as paid' });
  }
});

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

app.put('/api/settings', async (req, res) => {
  try {
    const settings = req.body
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const results = {}
      for (const [key, value] of Object.entries(settings)) {
        const result = await client.query(`
          INSERT INTO settings (key, value)
          VALUES ($1, $2)
          ON CONFLICT (key) DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW()
          RETURNING key, value
        `, [key, value])
        results[key] = result.rows[0].value
      }

      await client.query('COMMIT')
      res.json(results)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Bulk settings update error:', error)
    res.status(500).json({ error: 'Failed to update settings' })
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