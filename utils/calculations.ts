
import { Person, Splittable, Split, Payment, PaymentAllocation, Mortgage, MortgagePayment, MortgagePaymentBreakdown, MortgageStats, Bill } from '../types';
import { normalizeDueDate, startOfDay, endOfDay } from './dateUtils';

export interface CalculatedSplit {
  personId: string;
  amount: number;
}

/**
 * Distributes pennies fairly based on remainders to ensure the sum of splits equals the total amount.
 */
function distributePennies(
  totalAmount: number,
  splits: { personId: string; rawAmount: number }[]
): { personId: string, amount: number }[] {
  let totalRounded = 0;
  const roundedSplits = splits.map(split => {
    const rounded = Math.floor(split.rawAmount * 100) / 100;
    totalRounded += rounded;
    return {
      personId: split.personId,
      amount: rounded,
      remainder: split.rawAmount - rounded,
    };
  });

  let penniesToDistribute = Math.round((totalAmount - totalRounded) * 100);

  // Sort by remainder descending, then by personId ascending as a tie-breaker
  roundedSplits.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    return a.personId.localeCompare(b.personId);
  });

  for (let i = 0; i < penniesToDistribute; i++) {
    roundedSplits[i % roundedSplits.length].amount += 0.01;
  }
  
  return roundedSplits.map(({ personId, amount }) => ({ personId, amount: parseFloat(amount.toFixed(2)) }));
}

/**
 * Calculates the final split amounts for a bill based on its split mode.
 * Handles fair rounding and penny distribution.
 * Returns an array of { personId, amount } objects.
 */
export function calculateSplitAmounts(item: Splittable | (Mortgage & {amount: number}), people: Person[]): CalculatedSplit[] {
  if (!item || !item.splits || item.splits.length === 0 || item.amount <= 0) {
    // Return a structure with 0 amount for all people in splits if bill amount is 0
    return people.map(p => ({ personId: p.id, amount: 0 }));
  }

  const activeSplitters = item.splits.filter(s => people.some(p => p.id === s.personId) && s.value > 0);

  if (activeSplitters.length === 0) {
      return people.map(p => ({ personId: p.id, amount: 0 }));
  }

  switch (item.splitMode) {
    case 'amount':
      return activeSplitters.map(split => ({ personId: split.personId, amount: split.value }));
      
    case 'percent': {
      const totalPercent = activeSplitters.reduce((sum, s) => sum + s.value, 0);
      const scale = totalPercent === 0 ? 0 : 100 / totalPercent;

      const rawSplits = activeSplitters.map(split => ({
        personId: split.personId,
        rawAmount: item.amount * ((split.value * scale) / 100),
      }));
      return distributePennies(item.amount, rawSplits);
    }
      
    case 'shares': {
      const totalShares = activeSplitters.reduce((sum, s) => sum + s.value, 0);
      if (totalShares === 0) {
        return activeSplitters.map(s => ({ personId: s.personId, amount: 0 }));
      }
      
      const rawSplits = activeSplitters.map(split => ({
        personId: split.personId,
        rawAmount: (item.amount * split.value) / totalShares,
      }));
      return distributePennies(item.amount, rawSplits);
    }
      
    default:
      // Fallback for any unexpected splitMode
      return item.splits.map(s => ({ personId: s.personId, amount: 0 }));
  }
}

export function allocatePaymentProportionally(paymentAmount: number, bill: Splittable, people: Person[]): PaymentAllocation[] {
    const billSplits = calculateSplitAmounts(bill, people);
    const totalOwed = billSplits.reduce((sum, s) => sum + s.amount, 0);

    if (totalOwed === 0) return [];

    const rawAllocations = billSplits.map(split => ({
        personId: split.personId,
        rawAmount: (split.amount / totalOwed) * paymentAmount,
    }));
    
    return distributePennies(paymentAmount, rawAllocations);
}

// --- New Unified Cycle Engine ---

export type BillStatus = 'Paid' | 'Overdue' | 'Unpaid' | 'Partially Paid' | 'Upcoming';

export interface PerPersonStatus {
  personId: string;
  owed: number;
  paid: number;
  remaining: number;
}

export interface BillStatusDetails {
  status: BillStatus;
  totalPaid: number;
  totalRemaining: number;
  perPerson: PerPersonStatus[];
}

export interface ItemCycle extends BillStatusDetails {
  cycleStart: Date;
  cycleEnd: Date;
  dueDate: Date;
  firstDueDate?: Date;
  isUpcoming: boolean; // True if today < firstDueDate (for mortgages)
}

/**
 * Computes the first valid due date for a recurring item based on its start date.
 */
export function computeFirstDueDate(startDate: Date, paymentDay: number): Date {
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1; // 1-based month

    const startMonthDueDate = normalizeDueDate(startYear, startMonth, paymentDay);
    
    // Use startOfDay to compare dates without time component
    if (startOfDay(startDate) <= startOfDay(startMonthDueDate)) {
        return startMonthDueDate;
    } else {
        const nextMonthDate = new Date(startDate);
        nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
        return normalizeDueDate(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, paymentDay);
    }
}

/**
 * A unified engine to resolve the current payment cycle and status for any monthly bill or mortgage.
 */
export function resolveItemCycle(
    item: Bill | Mortgage,
    allPayments: (Payment | MortgagePayment)[],
    people: Person[],
    today: Date
): ItemCycle | null {

    const isMortgage = 'scheduled_payment' in item;

    if (isMortgage) {
        const mortgage = item as Mortgage;
        // Handle both date-only strings (YYYY-MM-DD) and full ISO strings
        let startDate: Date;
        if (mortgage.start_date.includes('T')) {
            // Already has time component
            startDate = new Date(mortgage.start_date);
        } else {
            // Date-only string, append time component for local timezone
            startDate = new Date(mortgage.start_date + 'T00:00:00');
        }
        const firstDueDate = computeFirstDueDate(startDate, mortgage.payment_day);

        // DEBUG: Log mortgage calculations with safe date handling
        console.log(`🏠 Mortgage Debug: "${mortgage.name}"`);
        console.log('  Start date:', mortgage.start_date);
        console.log('  Payment day:', mortgage.payment_day);
        console.log('  Parsed start date:', startDate.getTime() ? startDate.toISOString() : 'Invalid Date');
        console.log('  First due date:', firstDueDate.getTime() ? firstDueDate.toISOString() : 'Invalid Date');
        console.log('  Today:', today.toISOString());
        console.log('  Today start of day:', startOfDay(today).toISOString());
        console.log('  First due start of day:', firstDueDate.getTime() ? startOfDay(firstDueDate).toISOString() : 'Invalid Date');
        console.log('  Is today < firstDue?', startOfDay(today) < startOfDay(firstDueDate));

        if (startOfDay(today) < startOfDay(firstDueDate)) {
            console.log('  → Returning UPCOMING status');
            // Item hasn't started yet. Show as upcoming.
            const splittable = { ...mortgage, amount: mortgage.scheduled_payment };
            const splits = calculateSplitAmounts(splittable, people);
            return {
                status: 'Upcoming',
                totalPaid: 0,
                totalRemaining: mortgage.scheduled_payment,
                perPerson: splits.map(s => ({ personId: s.personId, owed: s.amount, paid: 0, remaining: s.amount })),
                cycleStart: startDate,
                cycleEnd: endOfDay(firstDueDate),
                dueDate: firstDueDate,
                firstDueDate: firstDueDate,
                isUpcoming: true,
            };
        }

        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        let currentCycleDueDate = normalizeDueDate(year, month, mortgage.payment_day);

        console.log('  Current cycle calculation:');
        console.log('    Year:', year);
        console.log('    Month:', month);
        console.log('    Current cycle due date:', currentCycleDueDate.getTime() ? currentCycleDueDate.toISOString() : 'Invalid Date');
        console.log('    Current cycle start of day:', currentCycleDueDate.getTime() ? startOfDay(currentCycleDueDate).toISOString() : 'Invalid Date');
        console.log('    Is currentCycle < firstDue?', startOfDay(currentCycleDueDate) < startOfDay(firstDueDate));

        if (startOfDay(currentCycleDueDate) < startOfDay(firstDueDate)) {
            console.log('  → Returning NULL (current cycle before first due)');
            return null;
        }

        const cycleEnd = endOfDay(currentCycleDueDate);
        
        const prevMonthDate = new Date(currentCycleDueDate);
        prevMonthDate.setDate(0); 
        const prevCycleDueDate = normalizeDueDate(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, mortgage.payment_day);

        const cycleStart = startOfDay(currentCycleDueDate.getTime() === firstDueDate.getTime() ? startDate : new Date(prevCycleDueDate.getTime() + 86400000));
        
        const paymentsThisCycle = allPayments.filter(p => {
          const paidDate = new Date((p as MortgagePayment).paidDate + 'T00:00:00');
          return paidDate >= cycleStart && paidDate <= cycleEnd;
        });

        const totalPaid = paymentsThisCycle.reduce((sum, p) => sum + p.amount, 0);
        const totalRemaining = Math.max(0, mortgage.scheduled_payment - totalPaid);

        const splittable = { ...mortgage, amount: mortgage.scheduled_payment };
        const billSplits = calculateSplitAmounts(splittable, people);
        
        const perPersonDetails: { [personId: string]: { owed: number, paid: number } } = {};
        billSplits.forEach(split => perPersonDetails[split.personId] = { owed: split.amount, paid: 0 });

        paymentsThisCycle.forEach(payment => {
            const allocations = payment.allocations ?? allocatePaymentProportionally(payment.amount, splittable, people);
            allocations.forEach(alloc => {
                if (perPersonDetails[alloc.personId]) perPersonDetails[alloc.personId].paid += alloc.amount;
            });
        });

        const perPerson: PerPersonStatus[] = Object.entries(perPersonDetails).map(([personId, details]) => ({
            personId, owed: details.owed, paid: details.paid, remaining: Math.max(0, details.owed - details.paid)
        }));
        
        let status: BillStatus;
        console.log('  Status calculation:');
        console.log('    Total remaining:', totalRemaining);
        console.log('    Total paid:', totalPaid);
        console.log('    Cycle end:', cycleEnd.getTime() ? cycleEnd.toISOString() : 'Invalid Date');
        console.log('    Today start of day:', startOfDay(today).toISOString());
        console.log('    Is today > cycleEnd?', startOfDay(today) > cycleEnd);

        if (totalRemaining <= 0.01) {
            status = 'Paid';
            console.log('  → Status: PAID');
        } else if (startOfDay(today) > cycleEnd) {
            status = 'Overdue';
            console.log('  → Status: OVERDUE');
        } else if (totalPaid > 0) {
            status = 'Partially Paid';
            console.log('  → Status: PARTIALLY PAID');
        } else {
            status = 'Unpaid';
            console.log('  → Status: UNPAID');
        }

        console.log('  Final result: dueDate =', currentCycleDueDate.getTime() ? currentCycleDueDate.toISOString() : 'Invalid Date');
        return { status, totalPaid, totalRemaining, perPerson, cycleStart, cycleEnd, dueDate: currentCycleDueDate, firstDueDate, isUpcoming: false };

    } else {
        // Handle Bill (which now has a specific date)
        const bill = item as Bill;
        if (!bill.dueDate) return null;

        // Handle both date-only strings (YYYY-MM-DD) and full ISO strings
        let dueDate: Date;
        if (bill.dueDate.includes('T')) {
            // Already has time component
            dueDate = new Date(bill.dueDate);
        } else {
            // Date-only string, append time component for local timezone
            dueDate = new Date(bill.dueDate + 'T00:00:00');
        }
        const paymentsForBill = (allPayments as Payment[]).filter(p => p.billId === bill.id);
        
        const totalPaid = paymentsForBill.reduce((sum, p) => sum + p.amount, 0);
        const totalRemaining = Math.max(0, bill.amount - totalPaid);

        const billSplits = calculateSplitAmounts(bill, people);
        const perPersonDetails: { [personId: string]: { owed: number, paid: number } } = {};
        billSplits.forEach(split => perPersonDetails[split.personId] = { owed: split.amount, paid: 0 });

        paymentsForBill.forEach(payment => {
            const allocations = payment.allocations ?? allocatePaymentProportionally(payment.amount, bill, people);
            allocations.forEach(alloc => {
                if (perPersonDetails[alloc.personId]) perPersonDetails[alloc.personId].paid += alloc.amount;
            });
        });

        const perPerson: PerPersonStatus[] = Object.entries(perPersonDetails).map(([personId, details]) => ({
            personId, owed: details.owed, paid: details.paid, remaining: Math.max(0, details.owed - details.paid)
        }));
        
        let status: BillStatus;
        if (totalRemaining <= 0.01) {
            status = 'Paid';
        } else if (startOfDay(today) > endOfDay(dueDate)) {
            status = 'Overdue';
        } else if (totalPaid > 0) {
            status = 'Partially Paid';
        } else {
            status = 'Unpaid';
        }
        
        return {
            status,
            totalPaid,
            totalRemaining,
            perPerson,
            cycleStart: startOfDay(new Date(dueDate.getFullYear(), dueDate.getMonth(), 1)),
            cycleEnd: endOfDay(dueDate),
            dueDate,
            isUpcoming: false,
        };
    }
}


// --- Mortgage Snapshot Calculation Functions ---

const monthsRemainingFormula = (principal: number, monthlyPayment: number, monthlyRate: number): number | null => {
    if (monthlyRate <= 0) return principal / monthlyPayment;
    if (monthlyPayment <= principal * monthlyRate) return null; // Payment doesn't cover interest
    
    const n = Math.log(monthlyPayment / (monthlyPayment - principal * monthlyRate)) / Math.log(1 + monthlyRate);
    return Math.ceil(n);
};

export function computeMortgageStats(mortgage: Mortgage, payments: MortgagePayment[], breakdowns: MortgagePaymentBreakdown[], people: Person[], today: Date): MortgageStats {
    const todayYear = today.getFullYear();
    const startOfYear = new Date(todayYear, 0, 1);

    const ytdPayments = payments.filter(p => new Date(p.paidDate) >= startOfYear);
    const ytdBreakdowns = breakdowns.filter(bd => ytdPayments.some(p => p.id === bd.id));
    
    const ytd_principal = ytdBreakdowns.reduce((sum, bd) => sum + bd.principal, 0);
    const ytd_interest = ytdBreakdowns.reduce((sum, bd) => sum + bd.interest, 0);
    const ytd_escrow = ytdBreakdowns.reduce((sum, bd) => sum + bd.escrow, 0);
    
    const principal_paid_lifetime = breakdowns.reduce((sum, bd) => sum + bd.principal, 0);

    // Last 3 months average extra principal
    const last3Months: { [key: string]: number } = {};
    const monthlyRate = (mortgage.interest_rate_apy / 100) / 12;
    const escrowMonthly = mortgage.escrow_enabled ? (mortgage.escrow_taxes || 0) + (mortgage.escrow_insurance || 0) + (mortgage.escrow_hoa || 0) + (mortgage.escrow_mip || 0) : 0;
    const scheduledPI = mortgage.scheduled_payment - escrowMonthly;

    breakdowns.forEach(bd => {
        const p = payments.find(p => p.id === bd.id);
        if(!p) return;
        const period = new Date(p.paidDate).toISOString().slice(0, 7); // YYYY-MM
        last3Months[period] = (last3Months[period] || 0) + bd.principal;
    });
    
    const recentExtra = Object.values(last3Months)
        .sort((a,b) => b-a).slice(0, 3) // simplistic approach: take 3 largest recent monthly principal payments
        .map(p => Math.max(0, p - scheduledPI))
        .reduce((sum, extra, _, arr) => sum + extra / arr.length, 0);
    
    // Projections
    const months_remaining_baseline = monthsRemainingFormula(mortgage.current_principal, scheduledPI, monthlyRate);
    const months_remaining_with_extra = monthsRemainingFormula(mortgage.current_principal, scheduledPI + recentExtra, monthlyRate);
    
    const payoff_date_baseline = months_remaining_baseline ? new Date(today.getFullYear(), today.getMonth() + months_remaining_baseline, 1) : null;
    const payoff_date_with_extra = months_remaining_with_extra ? new Date(today.getFullYear(), today.getMonth() + months_remaining_with_extra, 1) : null;
    
    // Contributions
    const per_member_ytd = people.map(p => ({ personId: p.id, name: p.name, total: 0 }));
    const per_member_lifetime = people.map(p => ({ personId: p.id, name: p.name, total: 0 }));

    const processContributions = (payment: MortgagePayment, list: typeof per_member_ytd) => {
        const allocations = payment.allocations ?? allocatePaymentProportionally(payment.amount, {...mortgage, amount: mortgage.scheduled_payment}, people);
        allocations.forEach(alloc => {
            const member = list.find(m => m.personId === alloc.personId);
            if (member) member.total += alloc.amount;
        });
    };
    
    ytdPayments.forEach(p => processContributions(p, per_member_ytd));
    payments.forEach(p => processContributions(p, per_member_lifetime));

    let nextDueDate = normalizeDueDate(today.getFullYear(), today.getMonth() + 1, mortgage.payment_day);
    if (nextDueDate < today) {
        const nextMonth = new Date(today);
        nextMonth.setMonth(today.getMonth() + 1);
        nextDueDate = normalizeDueDate(nextMonth.getFullYear(), nextMonth.getMonth() + 1, mortgage.payment_day);
    }

    return {
        mortgage: {
            id: mortgage.id,
            name: mortgage.name,
            interest_rate_apy: mortgage.interest_rate_apy,
            term_months: mortgage.term_months,
            original_principal: mortgage.original_principal,
            current_principal: mortgage.current_principal,
            scheduled_payment: mortgage.scheduled_payment,
            escrow_monthly: escrowMonthly,
            next_due_date: nextDueDate,
        },
        progress: {
            principal_paid_lifetime,
            percent_principal_paid: mortgage.original_principal > 0 ? (principal_paid_lifetime / mortgage.original_principal) * 100 : 0,
            ytd_principal,
            ytd_interest,
            ytd_escrow,
            last_3mo_avg_extra_principal: recentExtra
        },
        projections: {
            months_remaining_baseline,
            payoff_date_baseline,
            months_remaining_with_extra,
            payoff_date_with_extra,
            insufficient_payment: scheduledPI <= mortgage.current_principal * monthlyRate
        },
        contributions: {
            per_member_ytd: per_member_ytd.sort((a, b) => b.total - a.total),
            per_member_lifetime: per_member_lifetime.sort((a,b) => b.total - a.total),
        }
    };
}

export function calculatePaymentBreakdown(payment: MortgagePayment, mortgage: Mortgage, allPayments: MortgagePayment[]): MortgagePaymentBreakdown {
    // This is a simplified calculation. A real app would track running interest and principal at the time of payment.
    // For this app, we assume principal is constant for the cycle for interest calculation.
    const principalAtTimeOfPayment = mortgage.current_principal + allPayments
        .filter(p => new Date(p.paidDate) > new Date(payment.paidDate) && p.mortgageId === mortgage.id)
        .reduce((sum, p) => sum + p.amount, 0); // Crude approximation

    const monthlyRate = (mortgage.interest_rate_apy / 100) / 12;
    const interestForCycle = Math.floor(principalAtTimeOfPayment * monthlyRate);
    
    const escrowTotal = mortgage.escrow_enabled 
        ? (mortgage.escrow_taxes || 0) + (mortgage.escrow_insurance || 0) + (mortgage.escrow_mip || 0) + (mortgage.escrow_hoa || 0)
        : 0;

    let remainingAmount = payment.amount;
    
    const interestPortion = Math.min(remainingAmount, interestForCycle);
    remainingAmount -= interestPortion;
    
    const escrowPortion = Math.min(remainingAmount, escrowTotal);
    remainingAmount -= escrowPortion;

    const principalPortion = remainingAmount;

    return {
        id: payment.id,
        paymentId: payment.id,
        mortgageId: mortgage.id,
        interest: interestPortion,
        escrow: escrowPortion,
        principal: principalPortion,
    };
}
