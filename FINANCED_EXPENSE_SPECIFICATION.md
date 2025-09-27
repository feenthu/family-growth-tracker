# Financed Expense Feature - Technical Specification

## Overview

This specification defines the implementation requirements for a "Financed Expense" feature that allows users to track expenses paid through financing (e.g., Best Buy credit card purchases with interest-free financing). When creating an expense on the admin page, users can check a "Financed Expense" checkbox to reveal financing-specific fields and automatically generate recurring payment entries.

## Current Architecture Context

**Backend**: Express + Direct SQL + PostgreSQL
- Money stored as `amountCents` (integers) to avoid floating-point precision issues
- All API routes prefixed with `/api/` and include rate limiting
- Database schema in `db/init.ts` with comprehensive table definitions

**Frontend**: React + TypeScript + Vite
- Component-based architecture in `components/` directory
- Type definitions in `types.ts` and `utils/api.ts`
- Currently migrating from localStorage to API integration

**Key Integration Points**:
- Bills system: One-time expenses with split allocations
- RecurringBills system: Auto-generating monthly bills
- Family View: Display of recurring expenses alongside regular bills

## 1. Database Schema Changes

### New Table: `financed_expenses`

```sql
CREATE TABLE IF NOT EXISTS financed_expenses (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,
  total_amount_cents INTEGER NOT NULL,
  purchase_date DATE NOT NULL,
  financing_terms_months INTEGER NOT NULL,
  interest_rate_apy DECIMAL(5,2) DEFAULT 0.00,
  monthly_payment_cents INTEGER NOT NULL,
  vendor VARCHAR(255),
  description TEXT,
  split_mode VARCHAR(50) NOT NULL DEFAULT 'amount',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### New Table: `financed_expense_splits`

```sql
CREATE TABLE IF NOT EXISTS financed_expense_splits (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  financed_expense_id VARCHAR(255) NOT NULL REFERENCES financed_expenses(id) ON DELETE CASCADE,
  member_id VARCHAR(255) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  value INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### New Table: `financed_expense_payments`

```sql
CREATE TABLE IF NOT EXISTS financed_expense_payments (
  id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  financed_expense_id VARCHAR(255) NOT NULL REFERENCES financed_expenses(id) ON DELETE CASCADE,
  bill_id VARCHAR(255) REFERENCES bills(id) ON DELETE SET NULL,
  payment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount_cents INTEGER NOT NULL,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Indexes for Performance

```sql
CREATE INDEX IF NOT EXISTS idx_financed_expenses_active ON financed_expenses(is_active);
CREATE INDEX IF NOT EXISTS idx_financed_expense_splits_expense_id ON financed_expense_splits(financed_expense_id);
CREATE INDEX IF NOT EXISTS idx_financed_expense_payments_expense_id ON financed_expense_payments(financed_expense_id);
CREATE INDEX IF NOT EXISTS idx_financed_expense_payments_due_date ON financed_expense_payments(due_date);
```

## 2. API Endpoints

### Base Endpoint: `/api/financed-expenses`

#### GET `/api/financed-expenses`
- **Description**: Retrieve all financed expenses with splits and payment schedules
- **Response**: Array of FinancedExpense objects with embedded splits and payments
- **Query Parameters**:
  - `active` (boolean): Filter by active status
  - `include_payments` (boolean): Include payment schedule data

#### POST `/api/financed-expenses`
- **Description**: Create new financed expense and auto-generate payment schedule
- **Request Body**:
```typescript
{
  name: string;
  totalAmountCents: number;
  purchaseDate: string; // ISO date
  financingTermsMonths: number;
  interestRateApy?: number; // Default 0.00
  vendor?: string;
  description?: string;
  splitMode: 'amount' | 'percent' | 'shares';
  splits: Array<{memberId: string, value: number}>;
  generateBills?: boolean; // Auto-generate bills for each payment
}
```
- **Business Logic**:
  - Calculate monthly payment: `totalAmountCents / financingTermsMonths`
  - Generate payment schedule entries for each month
  - Optionally create Bill entries for each payment
- **Response**: Created FinancedExpense with embedded data

#### PUT `/api/financed-expenses/:id`
- **Description**: Update financed expense (affects future unpaid payments only)
- **Request Body**: Same as POST
- **Business Logic**: Update only unpaid future payments, preserve paid payment history

#### DELETE `/api/financed-expenses/:id`
- **Description**: Soft delete (set is_active = false) to preserve payment history
- **Response**: `{success: boolean}`

### Payment Management Endpoints

#### PUT `/api/financed-expenses/:id/payments/:paymentId/mark-paid`
- **Description**: Mark a specific payment as paid
- **Request Body**: `{paidDate: string, billId?: string}`
- **Response**: Updated payment record

#### GET `/api/financed-expenses/:id/payment-schedule`
- **Description**: Get upcoming payment schedule for specific financed expense
- **Response**: Array of payment schedule items with due dates and amounts

## 3. Frontend Component Hierarchy

### Modified Components

#### `BillModal.tsx` - Enhanced Expense Creation
**New Features**:
- Add "Financed Expense" checkbox below the due date field
- When checked, reveal financing fields section:
  - Financing Terms (months) - number input
  - Interest Rate (APY) - number input with % symbol, default 0
  - Vendor - text input (optional)
  - Description - textarea (optional)
- Validation: Ensure financing terms > 0 and <= 60 months
- Auto-calculate monthly payment display: `Total Amount ÷ Terms = $X.XX/month`

**Modified State**:
```typescript
const [isFinanced, setIsFinanced] = useState(false);
const [financingTerms, setFinancingTerms] = useState<number | ''>('');
const [interestRate, setInterestRate] = useState<number | ''>('');
const [vendor, setVendor] = useState('');
const [description, setDescription] = useState('');
```

#### `BillManager.tsx` - Integration Point
**Changes**:
- Update `onSaveBill` to detect financed expenses and route to new API
- Add import for financed expense API functions
- Handle success/error states for financed expense creation

### New Components

#### `FinancedExpenseManager.tsx`
**Purpose**: Dedicated management interface for financed expenses in admin view
**Features**:
- List of active financed expenses with key details
- Progress indicators showing payments completed vs remaining
- Edit/deactivate actions
- Quick payment marking capabilities

#### `FinancedExpenseItem.tsx`
**Purpose**: Individual financed expense display component
**Features**:
- Summary card showing total amount, terms, monthly payment
- Progress bar: payments made vs total payments
- Next payment due date and amount
- Quick actions: mark next payment paid, edit, deactivate

#### `FinancedExpenseModal.tsx`
**Purpose**: Dedicated modal for creating/editing financed expenses
**Features**:
- All financing-specific fields from BillModal enhancement
- Payment schedule preview table
- Option to generate bills immediately or manually

### Family View Integration

#### `FamilyView.tsx` - Display Financed Payments
**Changes**:
- Include upcoming financed expense payments in due items calculation
- Show financed payments alongside regular bills and recurring bills
- Add visual indicator for financing payments (e.g., "💳 Financing" badge)

#### `FamilyBillRow.tsx` - Financed Payment Display
**Changes**:
- Support new `type: 'financing'` for due items
- Display financing context: "Payment 3 of 12 - Best Buy TV"
- Show remaining balance and payments

## 4. TypeScript Type Definitions

### Core Types (add to `types.ts`)

```typescript
export interface FinancedExpense extends Splittable {
  id: string;
  name: string;
  totalAmount: number; // Frontend uses dollars
  purchaseDate: string; // ISO date string
  financingTermsMonths: number;
  interestRateApy: number; // 0-100 (e.g., 6.25 for 6.25%)
  monthlyPayment: number; // Calculated field
  vendor?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  payments?: FinancedExpensePayment[];
}

export interface FinancedExpensePayment {
  id: string;
  financedExpenseId: string;
  billId?: string; // Link to generated Bill if created
  paymentNumber: number; // 1, 2, 3, etc.
  dueDate: string; // ISO date string
  amount: number; // Frontend uses dollars
  isPaid: boolean;
  paidDate?: string; // ISO date string
  createdAt: string;
}
```

### API Types (add to `utils/api.ts`)

```typescript
export interface ApiFinancedExpense {
  id: string;
  name: string;
  totalAmountCents: number;
  purchaseDate: string;
  financingTermsMonths: number;
  interestRateApy: number;
  monthlyPaymentCents: number;
  vendor?: string;
  description?: string;
  splitMode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  splits: ApiFinancedExpenseSplit[];
  payments?: ApiFinancedExpensePayment[];
}

export interface ApiFinancedExpenseSplit {
  id: string;
  financedExpenseId: string;
  memberId: string;
  value: number;
  createdAt: string;
}

export interface ApiFinancedExpensePayment {
  id: string;
  financedExpenseId: string;
  billId?: string;
  paymentNumber: number;
  dueDate: string;
  amountCents: number;
  isPaid: boolean;
  paidDate?: string;
  createdAt: string;
}
```

## 5. Data Flow and Business Logic

### Financed Expense Creation Flow

1. **User Input Validation**:
   - Total amount > 0
   - Financing terms between 1-60 months
   - Interest rate between 0-100%
   - Valid splits that balance to 100%

2. **Payment Schedule Generation**:
   ```typescript
   const monthlyPaymentCents = Math.round(totalAmountCents / financingTermsMonths);
   const lastPaymentAdjustment = totalAmountCents - (monthlyPaymentCents * (financingTermsMonths - 1));

   // Generate payment schedule
   for (let i = 1; i <= financingTermsMonths; i++) {
     const dueDate = new Date(purchaseDate);
     dueDate.setMonth(dueDate.getMonth() + i);

     const paymentAmount = i === financingTermsMonths
       ? lastPaymentAdjustment
       : monthlyPaymentCents;
   }
   ```

3. **Optional Bill Generation**:
   - For each payment, create a Bill entry with `financedExpensePaymentId` reference
   - Set due dates according to payment schedule
   - Copy split allocations from parent financed expense

### Family View Integration Logic

1. **Due Items Calculation**:
   - Query upcoming financed expense payments where `isPaid = false`
   - Include in `DueItem[]` array with `type: 'financing'`
   - Sort by due date alongside regular bills and mortgages

2. **Status Resolution**:
   - "Overdue": Due date in past and not paid
   - "Due This Week": Due within 7 days
   - "Due Later This Month": Due this month but > 7 days away

### Payment Completion Flow

1. **Manual Payment Marking**:
   - Update `isPaid = true` and `paidDate`
   - If linked Bill exists, create Payment record
   - Update payment allocations based on splits

2. **Bill Payment Integration**:
   - When a linked Bill is paid through normal payment flow
   - Automatically mark corresponding financed expense payment as paid
   - Maintain data consistency between systems

## 6. User Experience Flow

### Admin View - Creating Financed Expense

1. User clicks "Add Bill" in Bills & Expenses section
2. BillModal opens with standard expense fields
3. User fills in name, amount, due date (purchase date)
4. User checks "Financed Expense" checkbox
5. Financing section expands showing:
   - Financing Terms (months) - required
   - Interest Rate (APY) - optional, defaults to 0
   - Vendor - optional
   - Description - optional
6. System displays calculated monthly payment: "$X.XX/month"
7. User configures splits as normal
8. User clicks Save
9. System creates financed expense and payment schedule
10. Success message: "Financed expense created with X monthly payments"

### Family View - Viewing Financed Payments

1. Upcoming financed payments appear in due items sections
2. Display format: "💳 [Expense Name] - Payment X of Y"
3. Shows due date, amount, and assigned family members
4. Visual distinction from regular bills (financing badge)
5. Click to view full financing details and payment history

### Admin View - Managing Financed Expenses

1. New "Financed Expenses" section in admin view
2. List shows active financed expenses with:
   - Name, vendor, total amount
   - Progress: "5 of 12 payments completed"
   - Next payment due date and amount
   - Quick actions: Mark Paid, Edit, Deactivate
3. Click expense name to view full payment schedule
4. Mark payments as paid updates both financing and bill systems

## 7. Implementation Roadmap

### Phase 1: Database Foundation (2-3 hours)
1. Add financed expense tables to `db/init.ts`
2. Create database migration script
3. Test table creation and relationships

### Phase 2: API Implementation (4-6 hours)
1. Create financed expense CRUD endpoints in `server.ts`
2. Implement payment schedule generation logic
3. Add payment status update endpoints
4. Test API with Postman/client tools

### Phase 3: Frontend Components (6-8 hours)
1. Enhance BillModal with financing fields
2. Create FinancedExpenseManager and related components
3. Update Family View to include financed payments
4. Add TypeScript types and API client methods

### Phase 4: Integration & Testing (2-4 hours)
1. Integrate financed expense creation into existing bill flow
2. Test multi-device synchronization
3. Validate payment completion workflows
4. User acceptance testing

### Phase 5: Polish & Documentation (1-2 hours)
1. Add loading states and error handling
2. Update user documentation
3. Performance optimization if needed

**Total Estimated Development Time**: 15-23 hours

## 8. Risk Considerations

### Data Integrity
- Ensure payment schedules remain consistent after edits
- Handle edge cases with leap years and month-end dates
- Prevent orphaned payment records

### User Experience
- Clear indication of financing vs regular expenses
- Intuitive payment tracking and progress display
- Graceful handling of deactivated financed expenses

### Performance
- Efficient queries for upcoming payments across all financed expenses
- Proper indexing for date-based filtering
- Reasonable pagination for large payment histories

### Migration Path
- Existing users should see no disruption
- Clear migration path if financing structure changes
- Backward compatibility with existing bill system

This specification provides a comprehensive foundation for implementing the Financed Expense feature while maintaining consistency with the existing Family Budget Tracker architecture and user experience patterns.