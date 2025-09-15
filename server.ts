import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { PrismaClient } from '@prisma/client'

dotenv.config()

const app = express()
const prisma = new PrismaClient()
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

// Members API
app.get('/api/members', async (req, res) => {
  try {
    const members = await prisma.member.findMany({
      orderBy: { createdAt: 'asc' }
    })
    res.json(members)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' })
  }
})

app.post('/api/members', async (req, res) => {
  try {
    const { name, color } = req.body
    const member = await prisma.member.create({
      data: { name, color }
    })
    res.json(member)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create member' })
  }
})

app.delete('/api/members/:id', async (req, res) => {
  try {
    await prisma.member.delete({
      where: { id: req.params.id }
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete member' })
  }
})

// Bills API
app.get('/api/bills', async (req, res) => {
  try {
    const bills = await prisma.bill.findMany({
      include: {
        splits: true,
        payments: {
          include: {
            allocations: true,
            payerMember: true
          }
        }
      },
      orderBy: { dueDate: 'desc' }
    })
    res.json(bills)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bills' })
  }
})

app.post('/api/bills', async (req, res) => {
  try {
    const { name, amountCents, dueDate, recurringBillId, period, splitMode, splits } = req.body
    const bill = await prisma.bill.create({
      data: {
        name,
        amountCents,
        dueDate: new Date(dueDate),
        recurringBillId,
        period,
        splitMode,
        splits: {
          create: splits
        }
      },
      include: {
        splits: true
      }
    })
    res.json(bill)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create bill' })
  }
})

app.put('/api/bills/:id', async (req, res) => {
  try {
    const { name, amountCents, dueDate, splitMode, splits } = req.body

    // Update bill and replace splits
    await prisma.billSplit.deleteMany({
      where: { billId: req.params.id }
    })

    const bill = await prisma.bill.update({
      where: { id: req.params.id },
      data: {
        name,
        amountCents,
        dueDate: new Date(dueDate),
        splitMode,
        splits: {
          create: splits
        }
      },
      include: {
        splits: true
      }
    })
    res.json(bill)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update bill' })
  }
})

app.delete('/api/bills/:id', async (req, res) => {
  try {
    await prisma.bill.delete({
      where: { id: req.params.id }
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete bill' })
  }
})

// Payments API
app.post('/api/payments', async (req, res) => {
  try {
    const { billId, paidDate, amountCents, method, payerMemberId, note, receiptFilename, receiptData, allocations } = req.body
    const payment = await prisma.payment.create({
      data: {
        billId,
        paidDate: new Date(paidDate),
        amountCents,
        method,
        payerMemberId,
        note,
        receiptFilename,
        receiptData,
        allocations: {
          create: allocations
        }
      },
      include: {
        allocations: true,
        payerMember: true
      }
    })
    res.json(payment)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create payment' })
  }
})

app.put('/api/payments/:id', async (req, res) => {
  try {
    const { paidDate, amountCents, method, payerMemberId, note, allocations } = req.body

    // Update payment and replace allocations
    await prisma.paymentAllocation.deleteMany({
      where: { paymentId: req.params.id }
    })

    const payment = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        paidDate: new Date(paidDate),
        amountCents,
        method,
        payerMemberId,
        note,
        allocations: {
          create: allocations
        }
      },
      include: {
        allocations: true,
        payerMember: true
      }
    })
    res.json(payment)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update payment' })
  }
})

app.delete('/api/payments/:id', async (req, res) => {
  try {
    await prisma.payment.delete({
      where: { id: req.params.id }
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete payment' })
  }
})

// Recurring Bills API
app.get('/api/recurring-bills', async (req, res) => {
  try {
    const recurringBills = await prisma.recurringBill.findMany({
      include: {
        splits: true
      },
      orderBy: { createdAt: 'asc' }
    })
    res.json(recurringBills)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recurring bills' })
  }
})

app.post('/api/recurring-bills', async (req, res) => {
  try {
    const { name, amountCents, dayOfMonth, frequency, lastGeneratedPeriod, splitMode, splits } = req.body
    const recurringBill = await prisma.recurringBill.create({
      data: {
        name,
        amountCents,
        dayOfMonth,
        frequency,
        lastGeneratedPeriod,
        splitMode,
        splits: {
          create: splits
        }
      },
      include: {
        splits: true
      }
    })
    res.json(recurringBill)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create recurring bill' })
  }
})

app.put('/api/recurring-bills/:id', async (req, res) => {
  try {
    const { name, amountCents, dayOfMonth, frequency, splitMode, splits } = req.body

    // Update recurring bill and replace splits
    await prisma.recurringBillSplit.deleteMany({
      where: { recurringBillId: req.params.id }
    })

    const recurringBill = await prisma.recurringBill.update({
      where: { id: req.params.id },
      data: {
        name,
        amountCents,
        dayOfMonth,
        frequency,
        splitMode,
        splits: {
          create: splits
        }
      },
      include: {
        splits: true
      }
    })
    res.json(recurringBill)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update recurring bill' })
  }
})

app.delete('/api/recurring-bills/:id', async (req, res) => {
  try {
    await prisma.recurringBill.delete({
      where: { id: req.params.id }
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete recurring bill' })
  }
})

// Mortgages API
app.get('/api/mortgages', async (req, res) => {
  try {
    const mortgages = await prisma.mortgage.findMany({
      include: {
        splits: true,
        payments: {
          include: {
            allocations: true,
            payerMember: true,
            breakdown: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
    res.json(mortgages)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch mortgages' })
  }
})

app.post('/api/mortgages', async (req, res) => {
  try {
    const mortgageData = req.body
    const { splits, ...mortgageFields } = mortgageData

    const mortgage = await prisma.mortgage.create({
      data: {
        ...mortgageFields,
        startDate: new Date(mortgageFields.startDate),
        splits: {
          create: splits
        }
      },
      include: {
        splits: true
      }
    })
    res.json(mortgage)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create mortgage' })
  }
})

app.put('/api/mortgages/:id', async (req, res) => {
  try {
    const mortgageData = req.body
    const { splits, ...mortgageFields } = mortgageData

    // Update mortgage and replace splits
    await prisma.mortgageSplit.deleteMany({
      where: { mortgageId: req.params.id }
    })

    const mortgage = await prisma.mortgage.update({
      where: { id: req.params.id },
      data: {
        ...mortgageFields,
        startDate: new Date(mortgageFields.startDate),
        splits: {
          create: splits
        }
      },
      include: {
        splits: true
      }
    })
    res.json(mortgage)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update mortgage' })
  }
})

app.delete('/api/mortgages/:id', async (req, res) => {
  try {
    await prisma.mortgage.delete({
      where: { id: req.params.id }
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete mortgage' })
  }
})

// Mortgage Payments API
app.post('/api/mortgage-payments', async (req, res) => {
  try {
    const { mortgageId, paidDate, amountCents, method, payerMemberId, note, receiptFilename, receiptData, allocations, breakdown } = req.body

    const payment = await prisma.mortgagePayment.create({
      data: {
        mortgageId,
        paidDate: new Date(paidDate),
        amountCents,
        method,
        payerMemberId,
        note,
        receiptFilename,
        receiptData,
        allocations: {
          create: allocations
        }
      },
      include: {
        allocations: true,
        payerMember: true
      }
    })

    // Create breakdown separately
    if (breakdown) {
      await prisma.mortgagePaymentBreakdown.create({
        data: {
          id: payment.id,
          paymentId: payment.id,
          mortgageId,
          principalCents: breakdown.principalCents,
          interestCents: breakdown.interestCents,
          escrowCents: breakdown.escrowCents
        }
      })
    }

    res.json(payment)
  } catch (error) {
    res.status(500).json({ error: 'Failed to create mortgage payment' })
  }
})

app.put('/api/mortgage-payments/:id', async (req, res) => {
  try {
    const { paidDate, amountCents, method, payerMemberId, note, allocations, breakdown } = req.body

    // Update payment and replace allocations
    await prisma.mortgagePaymentAllocation.deleteMany({
      where: { paymentId: req.params.id }
    })

    const payment = await prisma.mortgagePayment.update({
      where: { id: req.params.id },
      data: {
        paidDate: new Date(paidDate),
        amountCents,
        method,
        payerMemberId,
        note,
        allocations: {
          create: allocations
        }
      },
      include: {
        allocations: true,
        payerMember: true
      }
    })

    // Update breakdown
    if (breakdown) {
      await prisma.mortgagePaymentBreakdown.upsert({
        where: { paymentId: req.params.id },
        create: {
          id: payment.id,
          paymentId: payment.id,
          mortgageId: payment.mortgageId,
          principalCents: breakdown.principalCents,
          interestCents: breakdown.interestCents,
          escrowCents: breakdown.escrowCents
        },
        update: {
          principalCents: breakdown.principalCents,
          interestCents: breakdown.interestCents,
          escrowCents: breakdown.escrowCents
        }
      })
    }

    res.json(payment)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update mortgage payment' })
  }
})

app.delete('/api/mortgage-payments/:id', async (req, res) => {
  try {
    await prisma.mortgagePayment.delete({
      where: { id: req.params.id }
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete mortgage payment' })
  }
})

// Settings API
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await prisma.setting.findMany()
    const settingsObj = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, string>)
    res.json(settingsObj)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' })
  }
})

app.put('/api/settings/:key', async (req, res) => {
  try {
    const { value } = req.body
    const setting = await prisma.setting.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value },
      update: { value }
    })
    res.json(setting)
  } catch (error) {
    res.status(500).json({ error: 'Failed to update setting' })
  }
})

// Fallback to serve the React app (with rate limiting for static files)
app.get('/*', staticLimiter, (req, res) => {
  res.sendFile('index.html', { root: 'dist' })
})

async function startServer() {
  try {
    // Run migrations in production
    if (process.env.NODE_ENV === 'production') {
      const { execSync } = await import('child_process')
      console.log('Running database migrations...')
      execSync('npx prisma migrate deploy', { stdio: 'inherit' })
      console.log('Migrations completed.')
    }

    // Generate Prisma client
    console.log('Generating Prisma client...')
    const { execSync } = await import('child_process')
    execSync('npx prisma generate', { stdio: 'inherit' })

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  process.exit(0)
})

startServer()