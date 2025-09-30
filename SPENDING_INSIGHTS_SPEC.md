# Spending Insights Feature - Technical Specification

## Executive Summary

This specification outlines the implementation of a comprehensive spending analytics feature for the Family Budget Tracker. The feature will provide visual insights into spending patterns, member contributions, category breakdowns, and financial trends through a swipe-enabled mobile-first interface.

**Key Implementation Notes:**
- Category intelligence (smart categorization, combining similar purchases) is OUT OF SCOPE for this PR
- For now, use the `category` field if it exists, otherwise default to "Uncategorized"
- Future category intelligence will be handled in a separate PR

---

## 1. Database Schema Changes

### 1.1 New Tables

#### `expense_categories` Table
```sql
CREATE TABLE IF NOT EXISTS expense_categories (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL UNIQUE,
  icon VARCHAR(50),
  color VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick category lookups
CREATE INDEX IF NOT EXISTS idx_expense_categories_name ON expense_categories(name);
```

**Purpose:** Store predefined and user-defined expense categories for classification.

**Default Categories to Seed:**
- Groceries (icon: shopping-cart, color: green)
- Utilities (icon: bolt, color: yellow)
- Transportation (icon: car, color: blue)
- Entertainment (icon: film, color: purple)
- Healthcare (icon: heart, color: red)
- Housing (icon: home, color: teal)
- Dining (icon: utensils, color: orange)
- Shopping (icon: shopping-bag, color: pink)
- Uncategorized (icon: tag, color: gray)

### 1.2 Schema Modifications to Existing Tables

#### Bills Table - Add Category Support
```sql
-- Add category field to bills table
ALTER TABLE bills
ADD COLUMN IF NOT EXISTS category_id VARCHAR(255)
REFERENCES expense_categories(id) ON DELETE SET NULL;

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_bills_category_id ON bills(category_id);
```

#### Financed Expenses Table - Add Category Support
```sql
-- Add category field to financed expenses table
ALTER TABLE financed_expenses
ADD COLUMN IF NOT EXISTS category_id VARCHAR(255)
REFERENCES expense_categories(id) ON DELETE SET NULL;

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_financed_expenses_category_id ON financed_expenses(category_id);
```

### 1.3 Migration Considerations

**Migration File:** `db/migrations/add_expense_categories.sql`

1. Create `expense_categories` table
2. Seed default categories
3. Add `category_id` columns to bills and financed_expenses
4. Create indexes
5. All existing expenses will have `category_id = NULL` (appears as "Uncategorized")

**Rollback Strategy:**
- Drop indexes first
- Drop foreign key constraints
- Remove category_id columns
- Drop expense_categories table

---

## 2. API Endpoints

### 2.1 Categories Management

#### GET `/api/categories`
Fetch all available expense categories.

**Response:**
```typescript
[
  {
    id: string,
    name: string,
    icon: string,
    color: string,
    createdAt: string,
    updatedAt: string
  }
]
```

**Query Optimization:** Simple SELECT with no joins, cached for 1 hour on client.

#### POST `/api/categories`
Create a new custom category (admin only).

**Request Body:**
```typescript
{
  name: string,
  icon?: string,
  color?: string
}
```

**Response:** Same as GET single category

**Validation:**
- Name must be unique (case-insensitive)
- Max 50 characters

### 2.2 Analytics Endpoints

#### GET `/api/analytics/spending-summary`
Get aggregated spending data for the specified time range.

**Query Parameters:**
- `timeRange`: `"current-month" | "last-3-months" | "last-6-months" | "year-to-date"`
- `memberId`: (optional) Filter by specific member
- `categoryId`: (optional) Filter by specific category

**Response:**
```typescript
{
  timeRange: {
    start: string, // ISO date
    end: string,   // ISO date
    label: string  // Human-readable label
  },
  totals: {
    totalSpent: number,        // Total spent in cents
    billsCount: number,        // Number of bills
    avgPerDay: number,         // Average daily spending in cents
    avgPerMonth: number        // Average monthly spending in cents
  },
  byMember: [
    {
      memberId: string,
      memberName: string,
      memberColor: string,
      totalSpent: number,      // Amount in cents
      percentOfTotal: number,  // Percentage (0-100)
      billsCount: number
    }
  ],
  byCategory: [
    {
      categoryId: string,
      categoryName: string,
      categoryIcon: string,
      categoryColor: string,
      totalSpent: number,      // Amount in cents
      percentOfTotal: number,  // Percentage (0-100)
      billsCount: number
    }
  ],
  byMonth: [
    {
      month: string,           // "2024-09"
      totalSpent: number,      // Amount in cents
      billsCount: number
    }
  ]
}
```

**SQL Implementation Strategy:**
```sql
-- Base query for time-filtered expenses
WITH expense_data AS (
  -- Regular bills
  SELECT
    b.id,
    b.name,
    b.amount_cents,
    b.due_date,
    b.category_id,
    bs.member_id,
    CASE
      WHEN b.split_mode = 'amount' THEN bs.value
      WHEN b.split_mode = 'percent' THEN (b.amount_cents * bs.value / 100)
      WHEN b.split_mode = 'shares' THEN (b.amount_cents / total_shares.sum * bs.value)
    END as member_amount_cents
  FROM bills b
  JOIN bill_splits bs ON b.id = bs.bill_id
  LEFT JOIN (
    SELECT bill_id, SUM(value) as sum
    FROM bill_splits
    GROUP BY bill_id
  ) total_shares ON b.id = total_shares.bill_id
  WHERE b.due_date BETWEEN $1 AND $2

  UNION ALL

  -- Financed expense payments (paid only)
  SELECT
    fep.id,
    fe.title as name,
    fep.amount_cents,
    fep.due_date,
    fe.category_id,
    fes.member_id,
    CASE
      WHEN fe.split_mode = 'amount' THEN fes.value
      WHEN fe.split_mode = 'percent' THEN (fep.amount_cents * fes.value / 100)
      WHEN fe.split_mode = 'shares' THEN (fep.amount_cents / total_shares.sum * fes.value)
    END as member_amount_cents
  FROM financed_expense_payments fep
  JOIN financed_expenses fe ON fep.financed_expense_id = fe.id
  JOIN financed_expense_splits fes ON fe.id = fes.financed_expense_id
  LEFT JOIN (
    SELECT financed_expense_id, SUM(value) as sum
    FROM financed_expense_splits
    GROUP BY financed_expense_id
  ) total_shares ON fe.id = total_shares.financed_expense_id
  WHERE fep.is_paid = true
    AND fep.paid_date BETWEEN $1 AND $2
)
-- Aggregate by member
SELECT
  m.id as member_id,
  m.name as member_name,
  m.color as member_color,
  SUM(ed.member_amount_cents) as total_spent,
  COUNT(DISTINCT ed.id) as bills_count
FROM expense_data ed
JOIN members m ON ed.member_id = m.id
GROUP BY m.id, m.name, m.color
ORDER BY total_spent DESC;
```

**Query Optimization:**
- Use indexes on due_date, paid_date, category_id
- Cache results for 5 minutes (adjustable)
- Use connection pooling
- Consider materialized views for large datasets (future optimization)

**Rate Limiting:** 100 requests per 15 minutes per IP

#### GET `/api/analytics/spending-trends`
Get time-series data for trend visualization.

**Query Parameters:**
- `timeRange`: Same as spending-summary
- `granularity`: `"daily" | "weekly" | "monthly"` (defaults to appropriate based on time range)
- `memberId`: (optional)
- `categoryId`: (optional)

**Response:**
```typescript
{
  timeRange: {
    start: string,
    end: string,
    granularity: string
  },
  dataPoints: [
    {
      date: string,           // ISO date or "2024-09" for monthly
      totalSpent: number,     // Amount in cents
      billsCount: number,
      byCategory?: {          // Optional breakdown
        [categoryId: string]: number
      }
    }
  ]
}
```

**Implementation Notes:**
- For "current-month": Use daily granularity
- For "last-3-months": Use weekly granularity
- For "last-6-months" or "year-to-date": Use monthly granularity
- Fill gaps with zero values for visual continuity

#### GET `/api/analytics/payment-status`
Get bill payment tracking statistics.

**Query Parameters:**
- `timeRange`: Same as above

**Response:**
```typescript
{
  overview: {
    totalBills: number,
    paidBills: number,
    unpaidBills: number,
    overdueBills: number,
    totalDue: number,       // Amount in cents
    totalPaid: number       // Amount in cents
  },
  upcomingPayments: [
    {
      billId: string,
      billName: string,
      dueDate: string,
      amount: number,        // Amount in cents
      daysUntilDue: number
    }
  ],
  overduePayments: [
    {
      billId: string,
      billName: string,
      dueDate: string,
      amount: number,        // Amount in cents
      daysPastDue: number
    }
  ]
}
```

#### GET `/api/analytics/mortgage-vs-expenses`
Compare mortgage payments to other expenses.

**Query Parameters:**
- `timeRange`: Same as above

**Response:**
```typescript
{
  mortgage: {
    totalPaid: number,          // Amount in cents
    paymentsCount: number,
    avgPayment: number,
    breakdown: {
      principal: number,
      interest: number,
      escrow: number
    }
  },
  otherExpenses: {
    totalSpent: number,         // Amount in cents
    billsCount: number,
    avgPerBill: number,
    byCategory: [
      {
        categoryId: string,
        categoryName: string,
        totalSpent: number,
        percentOfNonMortgage: number
      }
    ]
  },
  comparison: {
    mortgagePercent: number,    // % of total spending
    otherPercent: number,       // % of total spending
    totalSpending: number       // Combined in cents
  }
}
```

---

## 3. Component Hierarchy

### 3.1 New Components Structure

```
components/
├── insights/
│   ├── InsightsPage.tsx              # Main container for insights view
│   ├── InsightsNavigation.tsx        # Swipe indicator dots
│   ├── SpendingSummaryCard.tsx       # Overview card with totals
│   ├── MemberSpendingChart.tsx       # Bar chart for member comparison
│   ├── CategorySpendingChart.tsx     # Pie chart for category breakdown
│   ├── SpendingTrendChart.tsx        # Line chart for trends over time
│   ├── PaymentStatusCard.tsx         # Payment tracking summary
│   ├── MortgageComparisonCard.tsx    # Mortgage vs other expenses
│   ├── TimeRangeSelector.tsx         # Time range filter component
│   ├── FilterPanel.tsx               # Member/category filters
│   └── EmptyStateInsights.tsx        # Empty state for no data
```

### 3.2 Component Props and Interfaces

#### InsightsPage.tsx
```typescript
interface InsightsPageProps {
  members: Person[];
  bills: Bill[];
  payments: Payment[];
  mortgages: Mortgage[];
  mortgagePayments: MortgagePayment[];
  financedExpenses: FinancedExpense[];
  isManagerModeUnlocked: boolean;
}
```

**State Management:**
- `timeRange`: Current selected time range
- `selectedMemberId`: Active member filter (null = all)
- `selectedCategoryId`: Active category filter (null = all)
- `analyticsData`: Fetched analytics data
- `isLoading`: Loading state for API calls
- `error`: Error state

**Key Features:**
- Swipe gesture support using `react-swipeable` or `framer-motion`
- Responsive layout with mobile-first design
- Error boundaries for graceful degradation
- Loading skeletons while fetching data

#### Chart Components

All chart components will use **Recharts** library for consistency and simplicity.

**Common Props:**
```typescript
interface BaseChartProps {
  data: any[];
  isLoading: boolean;
  height?: number;
}
```

**MemberSpendingChart:**
- Type: Horizontal Bar Chart
- Data: Member spending breakdown
- Features: Color-coded bars matching member colors, percentage labels

**CategorySpendingChart:**
- Type: Pie Chart with legend
- Data: Category spending breakdown
- Features: Category icons, percentage labels, "Uncategorized" fallback

**SpendingTrendChart:**
- Type: Line Chart with area fill
- Data: Time-series spending data
- Features: Tooltips, gradient fill, responsive axis labels

### 3.3 Integration with Existing Admin Page

#### App.tsx Modifications
```typescript
// Add insights page state
const [currentAdminPage, setCurrentAdminPage] = useState<'main' | 'insights'>('main');

// Swipe gesture handler
const handleSwipe = (direction: 'left' | 'right') => {
  if (view === 'manage') {
    if (direction === 'left' && currentAdminPage === 'main') {
      setCurrentAdminPage('insights');
    } else if (direction === 'right' && currentAdminPage === 'insights') {
      setCurrentAdminPage('main');
    }
  }
};

// Render logic
{view === 'manage' && (
  <SwipeableContainer onSwipe={handleSwipe}>
    {currentAdminPage === 'main' ? (
      <MainAdminView />
    ) : (
      <InsightsPage {...props} />
    )}
    <InsightsNavigation currentPage={currentAdminPage} />
  </SwipeableContainer>
)}
```

### 3.4 Swipe Gesture Implementation

**Library:** Use `react-swipeable` or implement with `framer-motion`

**Approach with framer-motion:**
```typescript
import { motion, PanInfo } from 'framer-motion';

const SWIPE_THRESHOLD = 50; // pixels
const SWIPE_CONFIDENCE_THRESHOLD = 10000;

const swipeConfidencePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

const handleDragEnd = (
  event: MouseEvent | TouchEvent | PointerEvent,
  { offset, velocity }: PanInfo
) => {
  const swipe = swipeConfidencePower(offset.x, velocity.x);

  if (swipe < -SWIPE_CONFIDENCE_THRESHOLD) {
    onSwipeLeft();
  } else if (swipe > SWIPE_CONFIDENCE_THRESHOLD) {
    onSwipeRight();
  }
};
```

**Visual Feedback:**
- Page indicator dots at bottom (similar to iOS home screen)
- Smooth animated transitions between pages
- Drag indicator while swiping
- Haptic feedback on mobile (if supported)

---

## 4. Data Flow Architecture

### 4.1 Data Flow Diagram

```
User Action (Select Time Range/Filter)
    ↓
Frontend: InsightsPage Component
    ↓
Custom Hook: useInsightsData(timeRange, filters)
    ↓
API Client: GET /api/analytics/spending-summary
    ↓
Express Server: Analytics Endpoint Handler
    ↓
PostgreSQL: Complex aggregation queries
    ↓
Express Server: Format and return JSON response
    ↓
Custom Hook: Transform API data to component format
    ↓
React State: Update analyticsData
    ↓
Chart Components: Render visualizations
```

### 4.2 Custom Hooks for Data Management

#### useInsightsData.ts
```typescript
export interface UseInsightsDataReturn {
  spendingSummary: SpendingSummaryData | null;
  spendingTrends: TrendData | null;
  paymentStatus: PaymentStatusData | null;
  mortgageComparison: MortgageComparisonData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useInsightsData(
  timeRange: TimeRange,
  memberId?: string,
  categoryId?: string
): UseInsightsDataReturn {
  const [data, setData] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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
      setError(err as Error);
      console.error('Failed to fetch insights data:', err);
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

### 4.3 Caching Strategy

**Client-Side Caching:**
- Use React Query for automatic caching and refetching
- Cache duration: 5 minutes for analytics data
- Stale-while-revalidate pattern for better UX
- Manual refetch on user action (pull-to-refresh on mobile)

**Server-Side Considerations:**
- Consider Redis caching for frequently accessed time ranges (future)
- Database query result caching for 1 minute
- Invalidate cache when new bills/payments are added

### 4.4 Error Handling

**Error Scenarios:**
1. Network failure - Show offline message with retry button
2. API error (500) - Show generic error with support contact
3. No data for time range - Show empty state with explanation
4. Partial data failure - Show available data with warning banner

**Error Boundary:**
- Wrap InsightsPage in ErrorBoundary component
- Graceful degradation if chart library fails
- Fallback to table view if visualizations fail

---

## 5. Implementation Phases

### Phase 1: Database and API Foundation (2-3 days)
**Tasks:**
1. Create and run database migration for expense_categories
2. Seed default categories
3. Add category_id columns to bills and financed_expenses
4. Implement GET /api/categories endpoint
5. Implement POST /api/categories endpoint
6. Write API tests for category management

**Deliverables:**
- Migration file: `db/migrations/001_add_expense_categories.sql`
- Updated `server.ts` with category endpoints
- Seed script for default categories

**Dependencies:** None

### Phase 2: Analytics API Endpoints (3-4 days)
**Tasks:**
1. Implement GET /api/analytics/spending-summary
2. Optimize SQL queries with proper indexes
3. Implement GET /api/analytics/spending-trends
4. Implement GET /api/analytics/payment-status
5. Implement GET /api/analytics/mortgage-vs-expenses
6. Add comprehensive error handling
7. Write API integration tests
8. Performance testing and optimization

**Deliverables:**
- Analytics endpoints in `server.ts`
- Query optimization documentation
- API test suite

**Dependencies:** Phase 1 complete

### Phase 3: Frontend Components - Part 1 (Charts & Data Display) (3-4 days)
**Tasks:**
1. Install and configure Recharts library
2. Create chart components (MemberSpendingChart, CategorySpendingChart, SpendingTrendChart)
3. Create card components (SpendingSummaryCard, PaymentStatusCard, MortgageComparisonCard)
4. Create TimeRangeSelector component
5. Create FilterPanel component
6. Create EmptyStateInsights component
7. Implement useInsightsData custom hook
8. Add loading skeletons for all components

**Deliverables:**
- Chart components in `components/insights/`
- Custom hook in `hooks/useInsightsData.ts`
- Storybook stories for components (optional)

**Dependencies:** Phase 2 complete

### Phase 4: Frontend Components - Part 2 (Page & Navigation) (2-3 days)
**Tasks:**
1. Create InsightsPage main container
2. Implement swipe gesture support with framer-motion
3. Create InsightsNavigation (page dots indicator)
4. Integrate with App.tsx and admin view
5. Add responsive layout and mobile optimizations
6. Implement error boundaries
7. Add accessibility features (ARIA labels, keyboard navigation)

**Deliverables:**
- InsightsPage component
- Swipe gesture implementation
- Updated App.tsx with insights integration

**Dependencies:** Phase 3 complete

### Phase 5: Polish and Testing (2-3 days)
**Tasks:**
1. UI/UX refinements based on feedback
2. Performance optimization (lazy loading, code splitting)
3. Cross-browser testing (Chrome, Firefox, Safari)
4. Mobile device testing (iOS, Android)
5. Accessibility audit (WCAG 2.1 AA)
6. End-to-end testing with Playwright/Cypress
7. Documentation updates (user guide, developer docs)
8. Bug fixes and edge case handling

**Deliverables:**
- Polished, production-ready feature
- Test coverage reports
- User documentation
- Developer documentation

**Dependencies:** Phase 4 complete

---

## 6. Future Considerations

### 6.1 Category Intelligence (Separate PR)

**Out of scope for this PR, but plan for:**
- Machine learning-based expense categorization
- Pattern recognition for recurring expenses
- Automatic category suggestions based on merchant/description
- Category merging and aliasing (e.g., "Grocery" → "Groceries")
- User-defined categorization rules

**Database Changes Needed (Future):**
```sql
-- Category aliases table (future)
CREATE TABLE expense_category_aliases (
  id VARCHAR(255) PRIMARY KEY,
  category_id VARCHAR(255) REFERENCES expense_categories(id),
  alias VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Categorization rules table (future)
CREATE TABLE expense_categorization_rules (
  id VARCHAR(255) PRIMARY KEY,
  pattern VARCHAR(255) NOT NULL,
  category_id VARCHAR(255) REFERENCES expense_categories(id),
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 6.2 Expense Editing View (Separate Feature)

**Future enhancement:**
- Dedicated page for editing expense categories
- Bulk categorization of historical expenses
- Category reassignment with preview
- Undo/redo functionality

### 6.3 Advanced Analytics (Future Enhancements)

**Potential features:**
- Predictive spending forecasts
- Budget vs. actual comparisons
- Savings goal tracking
- Spending anomaly detection
- Export to CSV/PDF reports
- Email/notification digests

### 6.4 Performance Optimizations (Future)

**If dataset grows large:**
- Implement database materialized views for common queries
- Add Redis caching layer
- Implement pagination for large result sets
- Use database partitioning for time-series data
- Consider time-series database (TimescaleDB) for analytics

---

## 7. Technical Challenges & Solutions

### 7.1 Challenge: Handling Missing Category Data

**Problem:** Existing expenses don't have categories assigned.

**Solution:**
- Default to "Uncategorized" category for all NULL category_id values
- Show "Uncategorized" prominently in charts with neutral color
- Provide easy way to bulk assign categories in future PR
- Don't block insights display due to missing categories

**Implementation:**
```sql
-- Query with category fallback
SELECT
  COALESCE(ec.name, 'Uncategorized') as category_name,
  COALESCE(ec.color, 'gray') as category_color,
  COALESCE(ec.icon, 'tag') as category_icon,
  SUM(amount_cents) as total
FROM bills b
LEFT JOIN expense_categories ec ON b.category_id = ec.id
WHERE due_date BETWEEN $1 AND $2
GROUP BY ec.id, ec.name, ec.color, ec.icon;
```

### 7.2 Challenge: Performance of Date Range Queries

**Problem:** Aggregating expenses across large date ranges with complex split calculations.

**Solution:**
- Add composite indexes on (due_date, category_id)
- Pre-calculate split amounts in subquery
- Use CTEs for better query readability and optimization
- Limit initial query to essential data only
- Consider materialized views if dataset exceeds 10k expenses

**Index Strategy:**
```sql
-- Composite indexes for range queries
CREATE INDEX idx_bills_date_category ON bills(due_date, category_id);
CREATE INDEX idx_financed_payments_date ON financed_expense_payments(paid_date, is_paid);
```

### 7.3 Challenge: Smooth Swipe Gesture Implementation

**Problem:** Native-feeling swipe gestures across different devices and browsers.

**Solution:**
- Use framer-motion for consistent animation library
- Implement velocity-based swipe detection
- Add visual feedback during drag
- Ensure gestures don't conflict with browser scroll
- Disable swipe on non-touch devices (use buttons instead)
- Test extensively on real devices

**Best Practices:**
```typescript
// Prevent conflicts with vertical scrolling
const handleDragStart = (event: MouseEvent | TouchEvent) => {
  if (Math.abs(velocity.x) > Math.abs(velocity.y)) {
    event.preventDefault(); // Prevent scroll
  }
};

// Provide desktop navigation alternative
{!isTouchDevice && (
  <NavigationButtons
    onPrevious={() => setPage('main')}
    onNext={() => setPage('insights')}
  />
)}
```

### 7.4 Challenge: Chart Library Responsiveness

**Problem:** Charts need to look good on all screen sizes without re-rendering issues.

**Solution:**
- Use Recharts ResponsiveContainer wrapper
- Set aspect ratios instead of fixed heights
- Implement adaptive font sizes
- Hide detailed labels on mobile, show on hover/tap
- Use horizontal bar charts on mobile for better readability

**Example:**
```typescript
<ResponsiveContainer width="100%" aspect={isMobile ? 1.5 : 2}>
  <PieChart>
    <Pie
      data={data}
      dataKey="value"
      label={!isMobile} // Hide labels on mobile
      labelLine={!isMobile}
    />
  </PieChart>
</ResponsiveContainer>
```

---

## 8. Testing Strategy

### 8.1 Unit Tests
- Chart component rendering with various data shapes
- useInsightsData hook with mocked API responses
- Time range calculation utilities
- Data transformation functions

### 8.2 Integration Tests
- API endpoint responses for all time ranges
- Filter combinations (member + category)
- SQL query correctness and performance
- Category assignment and retrieval

### 8.3 End-to-End Tests
- Complete user flow: Navigate to insights → Select time range → View charts
- Swipe gesture navigation on touch devices
- Filter interactions
- Error state handling
- Empty state display

### 8.4 Performance Tests
- Query performance with large datasets (10k+ expenses)
- Chart rendering performance with 100+ data points
- API response times under load
- Memory leak detection during navigation

---

## 9. Acceptance Criteria

### Must Have (P0)
- [ ] User can view spending summary for 4 time ranges (current month, 3 months, 6 months, YTD)
- [ ] Member spending breakdown displayed as bar chart
- [ ] Category spending breakdown displayed as pie chart
- [ ] Spending trends over time displayed as line chart
- [ ] Payment status/history summary visible
- [ ] Mortgage vs other expenses comparison available
- [ ] Swipe gesture navigation works on mobile devices
- [ ] Page indicator dots show current view
- [ ] All expenses without categories show as "Uncategorized"
- [ ] API endpoints return data within 2 seconds for typical datasets
- [ ] Responsive design works on mobile, tablet, and desktop
- [ ] Error states handled gracefully with user-friendly messages

### Should Have (P1)
- [ ] Filter by member
- [ ] Filter by category
- [ ] Loading skeletons while fetching data
- [ ] Pull-to-refresh on mobile
- [ ] Empty state with helpful messaging when no data
- [ ] Desktop navigation buttons as alternative to swipe
- [ ] Accessibility features (keyboard navigation, screen reader support)

### Nice to Have (P2)
- [ ] Chart animations on initial load
- [ ] Tooltip interactions on charts
- [ ] Export chart as image
- [ ] Share insights via link

---

## 10. Deployment Checklist

### Pre-Deployment
- [ ] Run database migrations on staging
- [ ] Verify seed data for categories
- [ ] Run full test suite (unit + integration + e2e)
- [ ] Performance testing with production-like data volume
- [ ] Security audit of new API endpoints
- [ ] Code review by at least 2 team members
- [ ] Update API documentation

### Deployment
- [ ] Run migrations on production during maintenance window
- [ ] Deploy backend changes first
- [ ] Verify API endpoints are responding correctly
- [ ] Deploy frontend changes
- [ ] Monitor error logs for first hour
- [ ] Monitor API response times

### Post-Deployment
- [ ] Smoke test all features in production
- [ ] Verify insights page loads on various devices
- [ ] Check analytics data accuracy against known values
- [ ] Update user documentation
- [ ] Announce new feature to users
- [ ] Monitor user adoption and feedback

---

## 11. Dependencies and Prerequisites

### Technical Dependencies
- **Backend:**
  - PostgreSQL 12+ (already in use)
  - Node.js 18+ (already in use)
  - Express 4.x (already in use)

- **Frontend:**
  - React 18+ (already in use)
  - TypeScript 5+ (already in use)
  - Recharts 2.x (NEW - needs installation)
  - framer-motion 10+ (NEW - needs installation)
  - React Query (already in use)

### Required Team Skills
- SQL query optimization
- React hooks and state management
- Chart library integration (Recharts)
- Gesture handling and animations
- Mobile-first responsive design

### Environment Requirements
- Development: Local PostgreSQL instance
- Staging: Railway staging environment
- Production: Railway production environment
- CI/CD: GitHub Actions (already configured)

---

## 12. Risk Assessment

### High Risk
- **Database migration on production**
  - Mitigation: Test thoroughly on staging, schedule during low-traffic window, have rollback plan

- **Performance degradation with complex queries**
  - Mitigation: Query optimization, indexes, caching, load testing before deploy

### Medium Risk
- **Chart library rendering issues on older devices**
  - Mitigation: Progressive enhancement, fallback to table views, extensive device testing

- **Swipe gesture conflicts with browser navigation**
  - Mitigation: Proper event handling, velocity detection, alternative navigation methods

### Low Risk
- **User confusion with new navigation pattern**
  - Mitigation: Clear visual indicators, optional tutorial, user feedback loop

---

## 13. Success Metrics

### Technical Metrics
- API response time < 2 seconds for 95th percentile
- Page load time < 3 seconds on 4G mobile
- Zero critical bugs in first week
- Test coverage > 80%

### User Metrics
- 70% of admin users access insights within first week
- Average time spent on insights page > 2 minutes
- Less than 5% bounce rate on insights page
- Positive user feedback in surveys

### Business Metrics
- Increased engagement with budget tracking
- Better understanding of spending patterns (qualitative feedback)
- Feature request completion milestone

---

## Appendix A: API Type Definitions

### TypeScript Interfaces for API

```typescript
// Time range types
export type TimeRangeType = 'current-month' | 'last-3-months' | 'last-6-months' | 'year-to-date';

export interface TimeRangeInfo {
  start: string;
  end: string;
  label: string;
  type: TimeRangeType;
}

// Spending summary types
export interface MemberSpendingData {
  memberId: string;
  memberName: string;
  memberColor: string;
  totalSpentCents: number;
  percentOfTotal: number;
  billsCount: number;
}

export interface CategorySpendingData {
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  totalSpentCents: number;
  percentOfTotal: number;
  billsCount: number;
}

export interface MonthlySpendingData {
  month: string;
  totalSpentCents: number;
  billsCount: number;
}

export interface SpendingSummaryResponse {
  timeRange: TimeRangeInfo;
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

// Trend data types
export interface TrendDataPoint {
  date: string;
  totalSpentCents: number;
  billsCount: number;
  byCategory?: Record<string, number>;
}

export interface SpendingTrendsResponse {
  timeRange: TimeRangeInfo & { granularity: 'daily' | 'weekly' | 'monthly' };
  dataPoints: TrendDataPoint[];
}

// Payment status types
export interface UpcomingPayment {
  billId: string;
  billName: string;
  dueDate: string;
  amountCents: number;
  daysUntilDue: number;
}

export interface OverduePayment {
  billId: string;
  billName: string;
  dueDate: string;
  amountCents: number;
  daysPastDue: number;
}

export interface PaymentStatusResponse {
  overview: {
    totalBills: number;
    paidBills: number;
    unpaidBills: number;
    overdueBills: number;
    totalDueCents: number;
    totalPaidCents: number;
  };
  upcomingPayments: UpcomingPayment[];
  overduePayments: OverduePayment[];
}

// Mortgage comparison types
export interface MortgageVsExpensesResponse {
  mortgage: {
    totalPaidCents: number;
    paymentsCount: number;
    avgPaymentCents: number;
    breakdown: {
      principalCents: number;
      interestCents: number;
      escrowCents: number;
    };
  };
  otherExpenses: {
    totalSpentCents: number;
    billsCount: number;
    avgPerBillCents: number;
    byCategory: {
      categoryId: string | null;
      categoryName: string;
      totalSpentCents: number;
      percentOfNonMortgage: number;
    }[];
  };
  comparison: {
    mortgagePercent: number;
    otherPercent: number;
    totalSpendingCents: number;
  };
}
```

---

## Appendix B: Sample SQL Queries

### Query 1: Member Spending Breakdown
```sql
WITH expense_data AS (
  -- Regular bills with split calculations
  SELECT
    b.id,
    b.name,
    b.amount_cents,
    b.due_date,
    b.category_id,
    bs.member_id,
    CASE
      WHEN b.split_mode = 'amount' THEN bs.value
      WHEN b.split_mode = 'percent' THEN CAST((b.amount_cents * bs.value / 100.0) AS INTEGER)
      WHEN b.split_mode = 'shares' THEN CAST((b.amount_cents * bs.value / NULLIF(total_shares.sum, 0)) AS INTEGER)
    END as member_amount_cents
  FROM bills b
  INNER JOIN bill_splits bs ON b.id = bs.bill_id
  LEFT JOIN (
    SELECT bill_id, SUM(value) as sum
    FROM bill_splits
    GROUP BY bill_id
  ) total_shares ON b.id = total_shares.bill_id
  WHERE b.due_date BETWEEN $1 AND $2

  UNION ALL

  -- Financed expense payments (only paid ones)
  SELECT
    fep.id,
    fe.title as name,
    fep.amount_cents,
    fep.paid_date as due_date,
    fe.category_id,
    fes.member_id,
    CASE
      WHEN fe.split_mode = 'amount' THEN fes.value
      WHEN fe.split_mode = 'percent' THEN CAST((fep.amount_cents * fes.value / 100.0) AS INTEGER)
      WHEN fe.split_mode = 'shares' THEN CAST((fep.amount_cents * fes.value / NULLIF(total_shares.sum, 0)) AS INTEGER)
    END as member_amount_cents
  FROM financed_expense_payments fep
  INNER JOIN financed_expenses fe ON fep.financed_expense_id = fe.id
  INNER JOIN financed_expense_splits fes ON fe.id = fes.financed_expense_id
  LEFT JOIN (
    SELECT financed_expense_id, SUM(value) as sum
    FROM financed_expense_splits
    GROUP BY financed_expense_id
  ) total_shares ON fe.id = total_shares.financed_expense_id
  WHERE fep.is_paid = true
    AND fep.paid_date BETWEEN $1 AND $2
)
SELECT
  m.id as member_id,
  m.name as member_name,
  m.color as member_color,
  COALESCE(SUM(ed.member_amount_cents), 0) as total_spent_cents,
  COUNT(DISTINCT ed.id) as bills_count
FROM members m
LEFT JOIN expense_data ed ON m.id = ed.member_id
GROUP BY m.id, m.name, m.color
ORDER BY total_spent_cents DESC;
```

### Query 2: Category Spending Breakdown
```sql
WITH expense_data AS (
  -- Regular bills
  SELECT
    b.id,
    COALESCE(b.category_id, 'uncategorized') as category_id,
    b.amount_cents
  FROM bills b
  WHERE b.due_date BETWEEN $1 AND $2

  UNION ALL

  -- Financed expense payments (paid only)
  SELECT
    fep.id,
    COALESCE(fe.category_id, 'uncategorized') as category_id,
    fep.amount_cents
  FROM financed_expense_payments fep
  INNER JOIN financed_expenses fe ON fep.financed_expense_id = fe.id
  WHERE fep.is_paid = true
    AND fep.paid_date BETWEEN $1 AND $2
)
SELECT
  ed.category_id,
  COALESCE(ec.name, 'Uncategorized') as category_name,
  COALESCE(ec.icon, 'tag') as category_icon,
  COALESCE(ec.color, 'gray') as category_color,
  SUM(ed.amount_cents) as total_spent_cents,
  COUNT(ed.id) as bills_count,
  ROUND((SUM(ed.amount_cents)::NUMERIC / NULLIF(totals.sum, 0) * 100), 2) as percent_of_total
FROM expense_data ed
LEFT JOIN expense_categories ec ON ed.category_id = ec.id
CROSS JOIN (
  SELECT SUM(amount_cents) as sum FROM expense_data
) totals
GROUP BY ed.category_id, ec.name, ec.icon, ec.color, totals.sum
ORDER BY total_spent_cents DESC;
```

---

## Appendix C: Component Examples

### Example: InsightsPage.tsx (Skeleton)
```typescript
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInsightsData } from '../../hooks/useInsightsData';
import { TimeRangeSelector } from './TimeRangeSelector';
import { FilterPanel } from './FilterPanel';
import { SpendingSummaryCard } from './SpendingSummaryCard';
import { MemberSpendingChart } from './MemberSpendingChart';
import { CategorySpendingChart } from './CategorySpendingChart';
import { SpendingTrendChart } from './SpendingTrendChart';
import { PaymentStatusCard } from './PaymentStatusCard';
import { MortgageComparisonCard } from './MortgageComparisonCard';
import { LoadingSpinner } from '../LoadingSpinner';
import { ErrorMessage } from '../ErrorMessage';
import { EmptyStateInsights } from './EmptyStateInsights';

interface InsightsPageProps {
  members: Person[];
  isManagerModeUnlocked: boolean;
}

export const InsightsPage: React.FC<InsightsPageProps> = ({
  members,
  isManagerModeUnlocked
}) => {
  const [timeRange, setTimeRange] = useState<TimeRangeType>('current-month');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const {
    spendingSummary,
    spendingTrends,
    paymentStatus,
    mortgageComparison,
    isLoading,
    error,
    refetch
  } = useInsightsData(timeRange, selectedMemberId, selectedCategoryId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorMessage
        message="Failed to load insights data"
        onRetry={refetch}
      />
    );
  }

  const hasData = spendingSummary?.totals.billsCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Spending Insights
        </h1>

        <TimeRangeSelector
          value={timeRange}
          onChange={setTimeRange}
        />
      </div>

      {/* Filters */}
      <FilterPanel
        members={members}
        selectedMemberId={selectedMemberId}
        selectedCategoryId={selectedCategoryId}
        onMemberChange={setSelectedMemberId}
        onCategoryChange={setSelectedCategoryId}
        onReset={() => {
          setSelectedMemberId(null);
          setSelectedCategoryId(null);
        }}
      />

      {/* Content */}
      {!hasData ? (
        <EmptyStateInsights timeRange={timeRange} />
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SpendingSummaryCard data={spendingSummary} />
            <PaymentStatusCard data={paymentStatus} />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MemberSpendingChart
              data={spendingSummary?.byMember || []}
              isLoading={isLoading}
            />

            <CategorySpendingChart
              data={spendingSummary?.byCategory || []}
              isLoading={isLoading}
            />
          </div>

          {/* Trend Chart - Full Width */}
          <SpendingTrendChart
            data={spendingTrends?.dataPoints || []}
            granularity={spendingTrends?.timeRange.granularity || 'monthly'}
            isLoading={isLoading}
          />

          {/* Mortgage Comparison */}
          {mortgageComparison && (
            <MortgageComparisonCard data={mortgageComparison} />
          )}
        </div>
      )}
    </motion.div>
  );
};
```

---

**End of Technical Specification**

This specification provides a comprehensive blueprint for implementing the spending insights feature. All subsequent development work should reference this document for consistency and completeness.