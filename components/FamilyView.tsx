
import React, { useMemo } from 'react';
import { Bill, Person, Payment, Mortgage, MortgagePayment, MortgagePaymentBreakdown } from '../types';
import { FamilyBillRow, DueItem } from './FamilyBillRow';
import { resolveItemCycle, ItemCycle, computeMortgageStats } from '../utils/calculations';
import { MortgageSnapshot } from './MortgageSnapshot';
import { startOfDay, endOfDay, getMonthEnd } from '../utils/dateUtils';

interface FamilyViewProps {
  bills: Bill[];
  people: Person[];
  payments: Payment[];
  mortgages: Mortgage[];
  mortgagePayments: MortgagePayment[];
  mortgagePaymentBreakdowns: MortgagePaymentBreakdown[];
}

export const FamilyView: React.FC<FamilyViewProps> = ({ bills, people, payments, mortgages, mortgagePayments, mortgagePaymentBreakdowns }) => {
  
  const { dueThisWeek, dueLaterThisMonth } = useMemo(() => {
    const today = new Date();
    const weekStart = startOfDay(today);
    
    const endOfWeek = new Date(weekStart);
    endOfWeek.setDate(weekStart.getDate() + 6);
    const weekEnd = endOfDay(endOfWeek);
    
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
        } else if (item.dueDate >= weekStart && item.dueDate <= weekEnd) {
            dueThisWeekItems.push(item);
        } else if (item.dueDate > weekEnd && item.dueDate <= monthEnd) {
            dueLaterThisMonthItems.push(item);
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
    </div>
  );
};
