-- Migration: Add expense categories support
-- Date: 2025-01-XX
-- Description: Adds expense_categories table and category_id columns to bills and financed_expenses

-- Create expense_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS expense_categories (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL UNIQUE,
  icon VARCHAR(100),
  color VARCHAR(50),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add category_id column to bills table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bills' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE bills ADD COLUMN category_id VARCHAR(255) REFERENCES expense_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add category_id column to financed_expenses table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'financed_expenses' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE financed_expenses ADD COLUMN category_id VARCHAR(255) REFERENCES expense_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_bills_category_id ON bills(category_id);
CREATE INDEX IF NOT EXISTS idx_financed_expenses_category_id ON financed_expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_name ON expense_categories(name);

-- Insert default categories if table is empty
INSERT INTO expense_categories (id, name, icon, color, is_default)
SELECT 'cat-uncategorized', 'Uncategorized', '📦', '#6B7280', true
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = 'cat-uncategorized')
UNION ALL
SELECT 'cat-groceries', 'Groceries', '🛒', '#10B981', true
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = 'cat-groceries')
UNION ALL
SELECT 'cat-utilities', 'Utilities', '💡', '#F59E0B', true
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = 'cat-utilities')
UNION ALL
SELECT 'cat-transportation', 'Transportation', '🚗', '#3B82F6', true
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = 'cat-transportation')
UNION ALL
SELECT 'cat-healthcare', 'Healthcare', '🏥', '#EF4444', true
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = 'cat-healthcare')
UNION ALL
SELECT 'cat-entertainment', 'Entertainment', '🎬', '#8B5CF6', true
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = 'cat-entertainment')
UNION ALL
SELECT 'cat-dining', 'Dining Out', '🍽️', '#EC4899', true
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = 'cat-dining')
UNION ALL
SELECT 'cat-shopping', 'Shopping', '🛍️', '#14B8A6', true
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = 'cat-shopping')
UNION ALL
SELECT 'cat-housing', 'Housing', '🏠', '#F97316', true
WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE id = 'cat-housing');
