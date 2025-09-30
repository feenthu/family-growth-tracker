# Spending Insights - Quick Start Implementation Guide

This is a condensed reference for developers implementing the spending insights feature. For full details, see `SPENDING_INSIGHTS_SPEC.md`.

## Overview
Add a spending analytics page to the admin section with visual insights, time-range filtering, and swipe navigation.

## Key Files Created
- `SPENDING_INSIGHTS_SPEC.md` - Full technical specification
- `spending-insights-metadata.json` - Structured metadata
- `INSIGHTS_QUICK_START.md` - This quick reference

---

## Phase 1: Database Setup (Days 1-2)

### Create Migration File
**File:** `db/migrations/001_add_expense_categories.sql`

```sql
-- Create categories table
CREATE TABLE IF NOT EXISTS expense_categories (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL UNIQUE,
  icon VARCHAR(50),
  color VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_expense_categories_name ON expense_categories(name);

-- Add category to bills
ALTER TABLE bills ADD COLUMN category_id VARCHAR(255) REFERENCES expense_categories(id) ON DELETE SET NULL;
CREATE INDEX idx_bills_category_id ON bills(category_id);

-- Add category to financed expenses
ALTER TABLE financed_expenses ADD COLUMN category_id VARCHAR(255) REFERENCES expense_categories(id) ON DELETE SET NULL;
CREATE INDEX idx_financed_expenses_category_id ON financed_expenses(category_id);

-- Seed default categories
INSERT INTO expense_categories (name, icon, color) VALUES
  ('Groceries', 'shopping-cart', 'green'),
  ('Utilities', 'bolt', 'yellow'),
  ('Transportation', 'car', 'blue'),
  ('Entertainment', 'film', 'purple'),
  ('Healthcare', 'heart', 'red'),
  ('Housing', 'home', 'teal'),
  ('Dining', 'utensils', 'orange'),
  ('Shopping', 'shopping-bag', 'pink'),
  ('Uncategorized', 'tag', 'gray');
```

### Run Migration
```bash
# Development
psql $DATABASE_URL -f db/migrations/001_add_expense_categories.sql

# Or via npm script (if created)
npm run db:migrate
```

---

## Phase 2: API Endpoints (Days 3-5)

### Add to `server.ts`

#### 1. Categories Endpoints

```typescript
// GET /api/categories
app.get('/api/categories', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, icon, color, created_at as "createdAt", updated_at as "updatedAt"
      FROM expense_categories
      ORDER BY name ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories
app.post('/api/categories', async (req, res) => {
  try {
    const { name, icon, color } = req.body;
    const result = await query(`
      INSERT INTO expense_categories (name, icon, color)
      VALUES ($1, $2, $3)
      RETURNING id, name, icon, color, created_at as "createdAt", updated_at as "updatedAt"
    `, [name, icon, color]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Category creation error:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});
```

#### 2. Analytics Endpoints

**Key SQL Pattern for Spending Summary:**
```typescript
// GET /api/analytics/spending-summary
app.get('/api/analytics/spending-summary', async (req, res) => {
  const { timeRange, memberId, categoryId } = req.query;
  const { startDate, endDate } = calculateTimeRange(timeRange);

  try {
    // Use WITH clause to combine bills + financed expense payments
    const result = await query(`
      WITH expense_data AS (
        -- Bills
        SELECT
          b.id, b.name, b.amount_cents, b.due_date as date,
          b.category_id, bs.member_id,
          CASE
            WHEN b.split_mode = 'amount' THEN bs.value
            WHEN b.split_mode = 'percent' THEN (b.amount_cents * bs.value / 100)
            WHEN b.split_mode = 'shares' THEN (b.amount_cents * bs.value / total_shares.sum)
          END as member_amount_cents
        FROM bills b
        INNER JOIN bill_splits bs ON b.id = bs.bill_id
        LEFT JOIN (
          SELECT bill_id, SUM(value) as sum FROM bill_splits GROUP BY bill_id
        ) total_shares ON b.id = total_shares.bill_id
        WHERE b.due_date BETWEEN $1 AND $2
        ${memberId ? 'AND bs.member_id = $3' : ''}
        ${categoryId ? 'AND b.category_id = $4' : ''}

        UNION ALL

        -- Financed expense payments (paid only)
        SELECT
          fep.id, fe.title as name, fep.amount_cents, fep.paid_date as date,
          fe.category_id, fes.member_id,
          CASE
            WHEN fe.split_mode = 'amount' THEN fes.value
            WHEN fe.split_mode = 'percent' THEN (fep.amount_cents * fes.value / 100)
            WHEN fe.split_mode = 'shares' THEN (fep.amount_cents * fes.value / total_shares.sum)
          END as member_amount_cents
        FROM financed_expense_payments fep
        INNER JOIN financed_expenses fe ON fep.financed_expense_id = fe.id
        INNER JOIN financed_expense_splits fes ON fe.id = fes.financed_expense_id
        LEFT JOIN (
          SELECT financed_expense_id, SUM(value) as sum
          FROM financed_expense_splits GROUP BY financed_expense_id
        ) total_shares ON fe.id = total_shares.financed_expense_id
        WHERE fep.is_paid = true
          AND fep.paid_date BETWEEN $1 AND $2
        ${memberId ? 'AND fes.member_id = $3' : ''}
        ${categoryId ? 'AND fe.category_id = $4' : ''}
      )
      -- Aggregate results
      SELECT
        SUM(member_amount_cents) as total_spent_cents,
        COUNT(DISTINCT id) as bills_count
      FROM expense_data
    `, [startDate, endDate, memberId, categoryId].filter(Boolean));

    // Format and return response
    res.json({ /* formatted data */ });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});
```

**Helper Function:**
```typescript
function calculateTimeRange(timeRange: string) {
  const now = new Date();
  let startDate: Date;
  let endDate = now;

  switch (timeRange) {
    case 'current-month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last-3-months':
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      break;
    case 'last-6-months':
      startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      break;
    case 'year-to-date':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}
```

---

## Phase 3: Frontend Components (Days 6-9)

### Install Dependencies
```bash
npm install recharts framer-motion
```

### Directory Structure
```
components/insights/
├── InsightsPage.tsx
├── InsightsNavigation.tsx
├── SpendingSummaryCard.tsx
├── MemberSpendingChart.tsx
├── CategorySpendingChart.tsx
├── SpendingTrendChart.tsx
├── PaymentStatusCard.tsx
├── MortgageComparisonCard.tsx
├── TimeRangeSelector.tsx
├── FilterPanel.tsx
└── EmptyStateInsights.tsx
```

### Custom Hook: `hooks/useInsightsData.ts`
```typescript
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../utils/api';

export type TimeRangeType = 'current-month' | 'last-3-months' | 'last-6-months' | 'year-to-date';

export function useInsightsData(
  timeRange: TimeRangeType,
  memberId?: string,
  categoryId?: string
) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [summary, trends, payments, mortgage] = await Promise.all([
        apiClient.getSpendingSummary(timeRange, memberId, categoryId),
        apiClient.getSpendingTrends(timeRange, memberId, categoryId),
        apiClient.getPaymentStatus(timeRange),
        apiClient.getMortgageComparison(timeRange)
      ]);

      setData({ summary, trends, payments, mortgage });
    } catch (err) {
      setError(err);
      console.error('Failed to fetch insights:', err);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange, memberId, categoryId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    spendingSummary: data?.summary || null,
    spendingTrends: data?.trends || null,
    paymentStatus: data?.payments || null,
    mortgageComparison: data?.mortgage || null,
    isLoading,
    error,
    refetch: fetchData
  };
}
```

### Example Chart Component: `MemberSpendingChart.tsx`
```typescript
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface MemberSpendingChartProps {
  data: Array<{
    memberName: string;
    memberColor: string;
    totalSpentCents: number;
    percentOfTotal: number;
  }>;
  isLoading: boolean;
  height?: number;
}

export const MemberSpendingChart: React.FC<MemberSpendingChartProps> = ({
  data,
  isLoading,
  height = 300
}) => {
  if (isLoading) {
    return <div className="animate-pulse bg-gray-200 rounded-lg" style={{ height }} />;
  }

  const chartData = data.map(item => ({
    name: item.memberName,
    amount: item.totalSpentCents / 100, // Convert to dollars
    color: item.memberColor,
    percent: item.percentOfTotal
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
      <h3 className="text-lg font-semibold mb-4">Spending by Member</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={chartData} layout="vertical">
          <XAxis type="number" />
          <YAxis type="category" dataKey="name" width={100} />
          <Tooltip
            formatter={(value: number) => `$${value.toFixed(2)}`}
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
          />
          <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
```

---

## Phase 4: Integration with App.tsx (Days 10-11)

### Update `App.tsx`

```typescript
import { motion, PanInfo } from 'framer-motion';
import { InsightsPage } from './components/insights/InsightsPage';
import { InsightsNavigation } from './components/insights/InsightsNavigation';

const AppContent: React.FC = () => {
  // ... existing state ...

  const [currentAdminPage, setCurrentAdminPage] = useState<'main' | 'insights'>('main');

  const handleSwipe = (direction: 'left' | 'right') => {
    if (view === 'manage') {
      if (direction === 'left' && currentAdminPage === 'main') {
        setCurrentAdminPage('insights');
      } else if (direction === 'right' && currentAdminPage === 'insights') {
        setCurrentAdminPage('main');
      }
    }
  };

  const handleDragEnd = (event: any, info: PanInfo) => {
    const threshold = 50;
    if (info.offset.x < -threshold) {
      handleSwipe('left');
    } else if (info.offset.x > threshold) {
      handleSwipe('right');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Header {...headerProps} />
      <main className="container mx-auto p-4 md:p-8">
        {view === 'manage' ? (
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            {currentAdminPage === 'main' ? (
              <MainAdminView />
            ) : (
              <InsightsPage
                members={people}
                isManagerModeUnlocked={isManagerModeUnlocked}
              />
            )}
            <InsightsNavigation
              currentPage={currentAdminPage}
              onPageChange={setCurrentAdminPage}
            />
          </motion.div>
        ) : (
          <FamilyView {...familyViewProps} />
        )}
      </main>
    </div>
  );
};
```

---

## Phase 5: Testing & Polish (Days 12-14)

### Test Checklist

**Unit Tests:**
- [ ] Chart components render with data
- [ ] useInsightsData hook fetches correctly
- [ ] Time range calculations are accurate
- [ ] Data transformations work correctly

**Integration Tests:**
- [ ] All API endpoints return correct data
- [ ] Filters work in combination
- [ ] Categories display correctly including "Uncategorized"

**E2E Tests:**
- [ ] Navigate to insights page
- [ ] Swipe between pages works
- [ ] Time range selection updates data
- [ ] Filters apply correctly
- [ ] Error states display properly

**Performance:**
- [ ] Query times < 2 seconds
- [ ] Page load < 3 seconds on 4G
- [ ] No memory leaks during navigation

**Accessibility:**
- [ ] Keyboard navigation works
- [ ] Screen reader labels present
- [ ] Color contrast meets WCAG AA
- [ ] Touch targets >= 44x44px

---

## API Client Updates

### Add to `utils/api.ts`

```typescript
export interface ApiCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpendingSummaryResponse {
  timeRange: {
    start: string;
    end: string;
    label: string;
  };
  totals: {
    totalSpentCents: number;
    billsCount: number;
    avgPerDayCents: number;
    avgPerMonthCents: number;
  };
  byMember: MemberSpendingData[];
  byCategory: CategorySpendingData[];
  byMonth: MonthlySpendingData[];
}

class ApiClient {
  // ... existing methods ...

  async getCategories(): Promise<ApiCategory[]> {
    return this.request('/categories');
  }

  async getSpendingSummary(
    timeRange: string,
    memberId?: string,
    categoryId?: string
  ): Promise<SpendingSummaryResponse> {
    const params = new URLSearchParams({ timeRange });
    if (memberId) params.append('memberId', memberId);
    if (categoryId) params.append('categoryId', categoryId);

    return this.request(`/analytics/spending-summary?${params}`);
  }

  async getSpendingTrends(
    timeRange: string,
    memberId?: string,
    categoryId?: string
  ): Promise<SpendingTrendsResponse> {
    const params = new URLSearchParams({ timeRange });
    if (memberId) params.append('memberId', memberId);
    if (categoryId) params.append('categoryId', categoryId);

    return this.request(`/analytics/spending-trends?${params}`);
  }

  async getPaymentStatus(timeRange: string): Promise<PaymentStatusResponse> {
    return this.request(`/analytics/payment-status?timeRange=${timeRange}`);
  }

  async getMortgageComparison(timeRange: string): Promise<MortgageVsExpensesResponse> {
    return this.request(`/analytics/mortgage-vs-expenses?timeRange=${timeRange}`);
  }
}
```

---

## Common Issues & Solutions

### Issue: Missing Categories Show as NULL
**Solution:** Always use `COALESCE` in SQL queries:
```sql
SELECT COALESCE(ec.name, 'Uncategorized') as category_name
FROM bills b
LEFT JOIN expense_categories ec ON b.category_id = ec.id
```

### Issue: Split Calculations Return Wrong Amounts
**Solution:** Handle divide-by-zero and ensure proper CAST:
```sql
CASE
  WHEN split_mode = 'shares' THEN
    CAST((amount_cents * value / NULLIF(total_shares, 0)) AS INTEGER)
```

### Issue: Swipe Conflicts with Scroll
**Solution:** Only prevent default for horizontal swipes:
```typescript
const handleDragStart = (event: any, info: PanInfo) => {
  if (Math.abs(info.velocity.x) > Math.abs(info.velocity.y)) {
    event.preventDefault();
  }
};
```

### Issue: Charts Don't Resize Properly
**Solution:** Use ResponsiveContainer:
```typescript
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    {/* ... */}
  </BarChart>
</ResponsiveContainer>
```

---

## Deployment Steps

1. **Staging:**
   ```bash
   # Run migration
   npm run db:migrate:staging

   # Deploy code
   git push staging feature/spending-insights

   # Verify endpoints
   curl https://staging.app.com/api/categories
   ```

2. **Production:**
   ```bash
   # Backup database
   pg_dump $DATABASE_URL > backup.sql

   # Run migration during low-traffic window
   npm run db:migrate:production

   # Deploy backend
   git push production feature/spending-insights

   # Monitor logs
   npm run logs:production
   ```

---

## Success Metrics

After deployment, track:
- API response times (target < 2s)
- User adoption (target 70% in first week)
- Error rates (target < 1%)
- Page load times (target < 3s on 4G)

---

## Next Steps (Future PRs)

1. **Category Intelligence** - Smart auto-categorization
2. **Bulk Editing** - UI for categorizing historical expenses
3. **Advanced Analytics** - Predictive forecasts, budget comparisons

---

**For complete details, refer to `SPENDING_INSIGHTS_SPEC.md`**