import { Pool } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const createTablesSQL = `
-- Members table
CREATE TABLE IF NOT EXISTS members (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Bills table
CREATE TABLE IF NOT EXISTS bills (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  amount_cents INTEGER NOT NULL,
  due_date DATE NOT NULL,
  recurring_bill_id VARCHAR(255),
  period VARCHAR(255),
  split_mode VARCHAR(50) NOT NULL DEFAULT 'amount',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Bill splits table
CREATE TABLE IF NOT EXISTS bill_splits (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bill_id VARCHAR(255) NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  member_id VARCHAR(255) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  value INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bill_id VARCHAR(255) NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  paid_date DATE NOT NULL,
  amount_cents INTEGER NOT NULL,
  method VARCHAR(50) NOT NULL,
  payer_member_id VARCHAR(255) REFERENCES members(id),
  note TEXT,
  receipt_filename VARCHAR(255),
  receipt_data TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment allocations table
CREATE TABLE IF NOT EXISTS payment_allocations (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  payment_id VARCHAR(255) NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  member_id VARCHAR(255) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Recurring bills table
CREATE TABLE IF NOT EXISTS recurring_bills (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  amount_cents INTEGER NOT NULL,
  day_of_month INTEGER NOT NULL,
  frequency VARCHAR(50) NOT NULL,
  last_generated_period VARCHAR(50) NOT NULL,
  split_mode VARCHAR(50) NOT NULL DEFAULT 'amount',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Recurring bill splits table
CREATE TABLE IF NOT EXISTS recurring_bill_splits (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  recurring_bill_id VARCHAR(255) NOT NULL REFERENCES recurring_bills(id) ON DELETE CASCADE,
  member_id VARCHAR(255) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  value INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Mortgages table
CREATE TABLE IF NOT EXISTS mortgages (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  lender VARCHAR(255),
  is_primary BOOLEAN DEFAULT FALSE,
  original_principal_cents INTEGER NOT NULL,
  current_principal_cents INTEGER NOT NULL,
  interest_rate_apy DECIMAL(5,2) NOT NULL,
  term_months INTEGER NOT NULL,
  start_date DATE NOT NULL,
  scheduled_payment_cents INTEGER NOT NULL,
  payment_day INTEGER NOT NULL,
  escrow_enabled BOOLEAN DEFAULT FALSE,
  escrow_taxes_cents INTEGER,
  escrow_insurance_cents INTEGER,
  escrow_mip_cents INTEGER,
  escrow_hoa_cents INTEGER,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  split_mode VARCHAR(50) NOT NULL DEFAULT 'amount',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Mortgage splits table
CREATE TABLE IF NOT EXISTS mortgage_splits (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  mortgage_id VARCHAR(255) NOT NULL REFERENCES mortgages(id) ON DELETE CASCADE,
  member_id VARCHAR(255) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  value INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Mortgage payments table
CREATE TABLE IF NOT EXISTS mortgage_payments (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  mortgage_id VARCHAR(255) NOT NULL REFERENCES mortgages(id) ON DELETE CASCADE,
  paid_date DATE NOT NULL,
  amount_cents INTEGER NOT NULL,
  method VARCHAR(50) NOT NULL,
  payer_member_id VARCHAR(255) REFERENCES members(id),
  note TEXT,
  receipt_filename VARCHAR(255),
  receipt_data TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Mortgage payment allocations table
CREATE TABLE IF NOT EXISTS mortgage_payment_allocations (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  payment_id VARCHAR(255) NOT NULL REFERENCES mortgage_payments(id) ON DELETE CASCADE,
  member_id VARCHAR(255) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Mortgage payment breakdowns table
CREATE TABLE IF NOT EXISTS mortgage_payment_breakdowns (
  id VARCHAR(255) PRIMARY KEY,
  payment_id VARCHAR(255) UNIQUE NOT NULL REFERENCES mortgage_payments(id) ON DELETE CASCADE,
  mortgage_id VARCHAR(255) NOT NULL REFERENCES mortgages(id) ON DELETE CASCADE,
  principal_cents INTEGER NOT NULL,
  interest_cents INTEGER NOT NULL,
  escrow_cents INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);
CREATE INDEX IF NOT EXISTS idx_bills_recurring_bill_id ON bills(recurring_bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_bill_id ON bill_splits(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_member_id ON bill_splits(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_date ON payments(paid_date);
CREATE INDEX IF NOT EXISTS idx_mortgage_payments_mortgage_id ON mortgage_payments(mortgage_id);
CREATE INDEX IF NOT EXISTS idx_mortgage_payments_paid_date ON mortgage_payments(paid_date);
`

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect()

  try {
    console.log('🔧 Initializing database tables...')

    // Execute the SQL to create all tables
    await client.query(createTablesSQL)

    console.log('✅ Database tables created successfully!')

    // Check if we have any members (for default data)
    const memberCount = await client.query('SELECT COUNT(*) as count FROM members')
    const count = parseInt(memberCount.rows[0].count)

    if (count === 0) {
      console.log('📝 Creating default members...')
      await client.query(`
        INSERT INTO members (id, name, color) VALUES
        ('1', 'Alex', 'bg-blue-500'),
        ('2', 'Beth', 'bg-pink-500')
      `)
      console.log('✅ Default members created!')
    }

    console.log(`📊 Database ready! (${count} members found)`)

  } catch (error) {
    console.error('❌ Database initialization failed:', error)
    throw error
  } finally {
    client.release()
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase()
    .then(() => {
      console.log('🎉 Database initialization complete!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Database initialization failed:', error)
      process.exit(1)
    })
}