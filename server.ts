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