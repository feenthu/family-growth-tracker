
import React, { useMemo, useState } from 'react';
import { Bill, Person, Payment, Mortgage, MortgagePayment, MortgagePaymentBreakdown, FinancedExpense, FinancedExpensePayment } from '../types';
import { FamilyBillRow, DueItem } from './FamilyBillRow';
import { resolveItemCycle, ItemCycle, computeMortgageStats } from '../utils/calculations';
import { MortgageSnapshot } from './MortgageSnapshot';
import { FinancedExpenseCard } from './FinancedExpenseCard';
import { FinancedExpenseModal } from './FinancedExpenseModal';
import { useFinancedExpensePayments, financedExpenseOperations } from '../hooks/useFinancedExpenses';
import { startOfDay, endOfDay, getMonthEnd } from '../utils/dateUtils';

// Helper component to fetch payments for each financed expense
const FinancedExpenseCardWrapper: React.FC<{
  expense: FinancedExpense;
  people: Person[];
  isAdminMode: boolean;
  onExpenseClick: (expense: FinancedExpense) => void;
}> = ({ expense, people, isAdminMode, onExpenseClick }) => {
  const [payments] = useFinancedExpensePayments(expense.id);

  const handlePaymentClick = async (expense: FinancedExpense, payment: FinancedExpensePayment) => {
    try {
      await financedExpenseOperations.markPaymentPaid(
        expense.id,
        payment.id,
        new Date().toISOString().split('T')[0]
      );
      // Note: In a real app, this would trigger a refresh of the payments data
    } catch (error) {
      console.error('Failed to mark payment as paid:', error);
    }
  };

  return (
    <div
      onClick={() => onExpenseClick(expense)}
      className="cursor-pointer"
    >
      <FinancedExpenseCard
        expense={expense}
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
