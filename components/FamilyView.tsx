
import React, { useMemo, useState } from 'react';
import { Bill, Person, Payment, Mortgage, MortgagePayment, MortgagePaymentBreakdown, FinancedExpense, FinancedExpensePayment } from '../types';
import { FamilyBillRow, DueItem } from './FamilyBillRow';
import { resolveItemCycle, ItemCycle, computeMortgageStats } from '../utils/calculations';
import { MortgageSnapshot } from './MortgageSnapshot';
import { FinancedExpenseCard } from './FinancedExpenseCard';
import { FinancedExpenseModal } from './FinancedExpenseModal';
import { useFinancedExpenseCompleteQuery, useFinancedExpenseMutations } from '../hooks/useFinancedExpensesQuery';
import { startOfDay, endOfDay, getMonthEnd } from '../utils/dateUtils';

// React Query-based component for financed expense cards
const FinancedExpenseCardWrapper: React.FC<{
  expense: FinancedExpense;
  people: Person[];
  isAdminMode: boolean;
  onExpenseClick: (expense: FinancedExpense) => void;
}> = ({ expense, people, isAdminMode, onExpenseClick }) => {
  const { data: expenseData, isLoading, error, refetch } = useFinancedExpenseCompleteQuery(expense.id);
  const { markPaymentPaid } = useFinancedExpenseMutations();

  const handlePaymentClick = async (expense: FinancedExpense, payment: FinancedExpensePayment) => {
    if (!isAdminMode) return;

    try {
      await markPaymentPaid.mutateAsync({
        expenseId: expense.id,
        paymentId: payment.id,
        paidDate: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error('Failed to mark payment as paid:', error);
      // Error is already handled by the mutation's onError callback
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 dark:bg-slate-600 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded w-1/2 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded w-full"></div>
            <div className="h-3 bg-slate-200 dark:bg-slate-600 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state with retry option
  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-red-200 dark:border-red-700 p-4">
        <div className="flex items-start space-x-3">
          <div className="text-red-500 text-xl">⚠️</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
              Failed to load expense details
            </h3>
            <p className="text-xs text-red-600 dark:text-red-400 mb-3">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
            <div className="flex space-x-2">
              <button
                onClick={() => refetch()}
                className="px-3 py-1 text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={() => onExpenseClick(expense)}
                className="px-3 py-1 text-xs bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                View Details
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Use data from React Query or fallback to props
  const currentExpense = expenseData?.expense || expense;
  const payments = expenseData?.payments || [];

  return (
    <div
      onClick={() => onExpenseClick(currentExpense)}
      className="cursor-pointer"
    >
      <FinancedExpenseCard
        expense={currentExpense}
        payments={payments}
        people={people}
        onPaymentClick={isAdminMode ? handlePaymentClick : undefined}
        isAdminMode={isAdminMode}
      />
    </div>
  );
};

interface FamilyViewProps {
  bills: Bill[];
  people: Person[];
  payments: Payment[];
  mortgages: Mortgage[];
  mortgagePayments: MortgagePayment[];
  mortgagePaymentBreakdowns: MortgagePaymentBreakdown[];
  financedExpenses: FinancedExpense[];
  onUpdateFinancedExpense: (expense: FinancedExpense) => void;
  onDeleteFinancedExpense: (expenseId: string) => void;
  isManagerModeUnlocked: boolean;
}

export const FamilyView: React.FC<FamilyViewProps> = ({
  bills,
  people,
  payments,
  mortgages,
  mortgagePayments,
  mortgagePaymentBreakdowns,
  financedExpenses,
  onUpdateFinancedExpense,
  onDeleteFinancedExpense,
  isManagerModeUnlocked
}) => {
  // State for financed expense modal
  const [selectedExpense, setSelectedExpense] = useState<FinancedExpense | null>(null);
  
  const { dueThisWeek, dueLaterThisMonth } = useMemo(() => {
    const today = new Date();
    const todayStart = startOfDay(today);

    // Calculate 7 days from today for "this week" cutoff
    const sevenDaysFromToday = new Date(todayStart);
    sevenDaysFromToday.setDate(todayStart.getDate() + 7);
    const sevenDaysEnd = endOfDay(sevenDaysFromToday);

    const monthEnd = getMonthEnd(today);

    const allDueItems: DueItem[] = [];
    const allItems: (Bill | Mortgage)[] = [...bills, ...mortgages.filter(m => m.active)];

    allItems.forEach(item => {
      const itemPayments = 'scheduled_payment' in item
        ? mortgagePayments.filter(p => p.mortgageId === item.id)
        : payments.filter(p => p.billId === item.id);

      const cycleInfo = resolveItemCycle(item, itemPayments, people, today);

      if (!cycleInfo || cycleInfo.status === 'Paid') {
        return;
      }

      const amount = 'scheduled_payment' in item ? item.scheduled_payment : item.amount;

      allDueItems.push({
          id: item.id,
          name: item.name,
          dueDate: cycleInfo.dueDate,
          amount: amount,
          statusDetails: cycleInfo,
          people,
          type: 'scheduled_payment' in item ? 'mortgage' : 'bill',
          isRecurring: 'scheduled_payment' in item || !!(item as Bill).recurringBillId,
      });
    });

    const dueThisWeekItems: DueItem[] = [];
    const dueLaterThisMonthItems: DueItem[] = [];

    allDueItems.forEach(item => {
        // Overdue items are defined as due date being in the past.
        const isOverdue = item.statusDetails.status === 'Overdue';

        if (isOverdue) {
            dueThisWeekItems.push(item);
        } else {
            // Calculate days between today and due date
            const daysDifference = Math.ceil((item.dueDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDifference <= 7) {
                // Due within 7 days = "Due This Week"
                dueThisWeekItems.push(item);
            } else if (item.dueDate <= monthEnd) {
                // Due more than 7 days away but within current month = "Due Later This Month"
                dueLaterThisMonthItems.push(item);
            }
        }
    });

    const sortByDueDate = (a: DueItem, b: DueItem) => a.dueDate.getTime() - b.dueDate.getTime();
    dueThisWeekItems.sort(sortByDueDate);
    dueLaterThisMonthItems.sort(sortByDueDate);

    return { dueThisWeek: dueThisWeekItems, dueLaterThisMonth: dueLaterThisMonthItems };
  }, [bills, payments, people, mortgages, mortgagePayments]);
  
  const primaryMortgage = useMemo(() => {
    const activeMortgages = mortgages.filter(m => m.active);
    if (activeMortgages.length === 0) return null;
    const primary = activeMortgages.find(m => m.is_primary);
    return primary || activeMortgages.sort((a,b) => b.scheduled_payment - a.scheduled_payment)[0];
  }, [mortgages]);
  
  const mortgageStats = useMemo(() => {
    if (!primaryMortgage) return null;
    return computeMortgageStats(
        primaryMortgage, 
        mortgagePayments.filter(p => p.mortgageId === primaryMortgage.id), 
        mortgagePaymentBreakdowns.filter(bd => bd.mortgageId === primaryMortgage.id),
        people, 
        new Date()
    );
  }, [primaryMortgage, mortgagePayments, mortgagePaymentBreakdowns, people]);

  return (
    <div className="space-y-12">
      {mortgageStats && <MortgageSnapshot stats={mortgageStats} />}

      {/* Financed Expenses Section */}
      {financedExpenses.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 border-b-2 border-slate-200 dark:border-slate-700 pb-2 mb-6">
            Financed Expenses
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {financedExpenses.map(expense => (
              <FinancedExpenseCardWrapper
                key={expense.id}
                expense={expense}
                people={people}
                isAdminMode={isManagerModeUnlocked}
                onExpenseClick={setSelectedExpense}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 border-b-2 border-slate-200 dark:border-slate-700 pb-2 mb-6">
          Due This Week
        </h2>
        {dueThisWeek.length > 0 ? (
          <div className="space-y-4">
            {dueThisWeek.map(item => (
              <FamilyBillRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">Nothing due this week!</p>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 border-b-2 border-slate-200 dark:border-slate-700 pb-2 mb-6">
          Due Later This Month
        </h2>
        {dueLaterThisMonth.length > 0 ? (
          <div className="space-y-4">
            {dueLaterThisMonth.map(item => (
              <FamilyBillRow key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-slate-500 dark:text-slate-400 text-center py-8">No other bills due this month.</p>
        )}
      </section>

      {/* Financed Expense Modal */}
      {selectedExpense && (
        <FinancedExpenseModal
          isOpen={true}
          onClose={() => setSelectedExpense(null)}
          onSave={onUpdateFinancedExpense}
          onDelete={onDeleteFinancedExpense}
          people={people}
          expense={selectedExpense}
          isAdminMode={isManagerModeUnlocked}
        />
      )}
    </div>
  );
};
