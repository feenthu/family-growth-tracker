
export interface Person {
  id: string;
  name: string;
  color: string;
}

export type SplitMode = 'amount' | 'percent' | 'shares';

export interface Split {
  personId: string;
  // This value can be a fixed amount, a percentage, or a number of shares
  value: number;
}

export type RecurrenceFrequency = 'monthly' | 'bi-monthly' | 'quarterly' | 'semi-annually' | 'yearly';

// Interface for any object that can have its splits calculated
export interface Splittable {
  amount: number;
  splitMode: SplitMode;
  splits: Split[];
}

export interface Bill extends Splittable {
  id: string;
  name:string;
  dueDate: string; // ISO date string "YYYY-MM-DD"
  recurringBillId?: string;
  period?: string; // e.g., '2024-07'
}

export interface RecurringBill extends Splittable {
  id: string;
  name: string;
  dayOfMonth: number;
  frequency: RecurrenceFrequency;
  lastGeneratedPeriod: string; // e.g., '2024-06'
}

// --- New Payment System Types ---

export type PaymentMethod = 'ach' | 'card' | 'cash' | 'check' | 'zelle' | 'venmo' | 'other';

export interface PaymentAllocation {
  personId: string;
  amount: number;
}

export interface Payment {
  id: string;
  billId: string; // Links to a Bill instance's ID
  paidDate: string; // ISO date string e.g. "2024-07-28"
  amount: number;
  method: PaymentMethod;
  payerPersonId?: string; // Optional: ID of the person who made the payment
  note?: string;
  receipt?: {
    fileName: string;
    dataUrl: string; // Base64 encoded file
  };
  // If null, payment is allocated proportionally based on the bill's split
  // If provided, the sum of amounts must equal the payment amount
  allocations?: PaymentAllocation[];
}

// --- New Mortgage System Types ---

export interface Mortgage extends Omit<Splittable, 'amount'> {
  id: string;
  name: string;
  lender?: string;
  is_primary?: boolean;
  
  // Loan Details
  original_principal: number;
  current_principal: number;
  interest_rate_apy: number; // e.g., 6.25 for 6.25%
  term_months: number;
  start_date: string; // ISO date string "YYYY-MM-DD"
  
  // Payment Details
  scheduled_payment: number; // Full PITI
  payment_day: number; // 1-31
  
  // Escrow Details
  escrow_enabled: boolean;
  escrow_taxes?: number;
  escrow_insurance?: number;
  escrow_mip?: number;
  escrow_hoa?: number;
  
  // Extra Config
  notes?: string;
  active: boolean;
}

export interface MortgagePayment {
  id: string;
  mortgageId: string;
  paidDate: string;
  amount: number;
  method: PaymentMethod;
  payerPersonId?: string;
  note?: string;
  receipt?: {
    fileName: string;
    dataUrl: string;
  };
  allocations?: PaymentAllocation[];
}

export interface MortgagePaymentBreakdown {
    id: string; // Same as paymentId
    paymentId: string;
    mortgageId: string;
    principal: number;
    interest: number;
    escrow: number;
}

export interface MortgageStats {
    mortgage: {
        id: string;
        name: string;
        interest_rate_apy: number;
        term_months: number;
        original_principal: number;
        current_principal: number;
        scheduled_payment: number;
        escrow_monthly: number;
        next_due_date: Date;
    };
    progress: {
        principal_paid_lifetime: number;
        percent_principal_paid: number;
        ytd_principal: number;
        ytd_interest: number;
        ytd_escrow: number;
        last_3mo_avg_extra_principal: number;
    };
    projections: {
        months_remaining_baseline: number | null;
        payoff_date_baseline: Date | null;
        months_remaining_with_extra: number | null;
        payoff_date_with_extra: Date | null;
        insufficient_payment: boolean;
    };
    contributions: {
        per_member_ytd: { personId: string; name: string; total: number }[];
        per_member_lifetime: { personId: string; name: string; total: number }[];
    };
}

// --- Financed Expense System Types ---

export interface FinancedExpense extends Splittable {
  id: string;
  title: string;
  description?: string;
  totalAmount: number; // Frontend representation (dollars)
  monthlyPayment: number; // Frontend representation (dollars)
  interestRatePercent: number; // e.g., 6.25 for 6.25%
  financingTermMonths: number;
  purchaseDate: string; // ISO date string "YYYY-MM-DD"
  firstPaymentDate: string; // ISO date string "YYYY-MM-DD"
  isActive: boolean;
}

export interface FinancedExpensePayment {
  id: string;
  financedExpenseId: string;
  paymentNumber: number;
  dueDate: string; // ISO date string "YYYY-MM-DD"
  amount: number; // Frontend representation (dollars)
  principal: number; // Frontend representation (dollars)
  interest: number; // Frontend representation (dollars)
  isPaid: boolean;
  paidDate?: string; // ISO date string "YYYY-MM-DD"
  billId?: string; // Optional link to generated bill
}

// API types that match the database schema (using cents)
export interface FinancedExpenseAPI {
  id: string;
  title: string;
  description?: string;
  total_amount_cents: number;
  monthly_payment_cents: number;
  interest_rate_percent: number;
  financing_term_months: number;
  purchase_date: string;
  first_payment_date: string;
  is_active: boolean;
  split_mode: SplitMode;
  created_at: string;
  updated_at: string;
}

export interface FinancedExpenseSplitAPI {
  id: string;
  financed_expense_id: string;
  member_id: string;
  value: number;
  created_at: string;
}

export interface FinancedExpensePaymentAPI {
  id: string;
  financed_expense_id: string;
  payment_number: number;
  due_date: string;
  amount_cents: number;
  principal_cents: number;
  interest_cents: number;
  is_paid: boolean;
  paid_date?: string;
  bill_id?: string;
  created_at: string;
}
