
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
    const todayStart = startOfDay(today);

    // Calculate 7 days from today for "this week" cutoff
    const sevenDaysFromToday = new Date(todayStart);
    sevenDaysFromToday.setDate(todayStart.getDate() + 7);
    const sevenDaysEnd = endOfDay(sevenDaysFromToday);

    const monthEnd = getMonthEnd(today);

    // DEBUG: Log date calculations
    console.log('🗓️ FamilyView Date Debug:');
    console.log('  Today:', today.toISOString());
    console.log('  TodayStart:', todayStart.toISOString());
    console.log('  MonthEnd:', monthEnd.toISOString());
    console.log('  7 days cutoff:', sevenDaysFromToday.toISOString());

    const allDueItems: DueItem[] = [];
    const allItems: (Bill | Mortgage)[] = [...bills, ...mortgages.filter(m => m.active)];

    console.log('📋 Processing items:', allItems.length, 'total items');

    allItems.forEach(item => {
      const itemPayments = 'scheduled_payment' in item
        ? mortgagePayments.filter(p => p.mortgageId === item.id)
        : payments.filter(p => p.billId === item.id);

      const cycleInfo = resolveItemCycle(item, itemPayments, people, today);

      console.log(`📝 Item: "${item.name}"`);
      console.log('  Raw due date:', 'scheduled_payment' in item ? `Payment day ${item.payment_day}` : (item as Bill).dueDate);
      console.log('  Cycle info:', cycleInfo ? {
        status: cycleInfo.status,
        dueDate: cycleInfo.dueDate?.toISOString(),
        totalRemaining: cycleInfo.totalRemaining
      } : 'null');

      if (!cycleInfo || cycleInfo.status === 'Paid') {
        console.log('  ❌ Filtered out (no cycle info or status=Paid)');
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
      console.log('  ✅ Added to due items');
    });

    const dueThisWeekItems: DueItem[] = [];
    const dueLaterThisMonthItems: DueItem[] = [];

    console.log('🏷️ Categorizing', allDueItems.length, 'due items');

    allDueItems.forEach(item => {
        // Overdue items are defined as due date being in the past.
        const isOverdue = item.statusDetails.status === 'Overdue';

        console.log(`\n🎯 Categorizing: "${item.name}"`);
        console.log('  Due date:', item.dueDate.toISOString());
        console.log('  Status:', item.statusDetails.status);
        console.log('  Is overdue:', isOverdue);

        if (isOverdue) {
            console.log('  → Added to "Due This Week" (overdue)');
            dueThisWeekItems.push(item);
        } else {
            // Calculate days between today and due date
            const daysDifference = Math.ceil((item.dueDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
            const isWithinMonth = item.dueDate <= monthEnd;

            console.log('  Days difference:', daysDifference);
            console.log('  Within current month:', isWithinMonth);
            console.log('  Month end:', monthEnd.toISOString());

            if (daysDifference <= 7) {
                console.log('  → Added to "Due This Week" (≤7 days)');
                dueThisWeekItems.push(item);
            } else if (isWithinMonth) {
                console.log('  → Added to "Due Later This Month" (>7 days, within month)');
                dueLaterThisMonthItems.push(item);
            } else {
                console.log('  → Not categorized (outside current month)');
            }
        }
    });

    const sortByDueDate = (a: DueItem, b: DueItem) => a.dueDate.getTime() - b.dueDate.getTime();
    dueThisWeekItems.sort(sortByDueDate);
    dueLaterThisMonthItems.sort(sortByDueDate);

    // DEBUG: Final summary
    console.log('\n📊 Final Results:');
    console.log('  Due This Week:', dueThisWeekItems.length, 'items');
    dueThisWeekItems.forEach(item => console.log(`    - ${item.name} (${item.dueDate.toDateString()})`));
    console.log('  Due Later This Month:', dueLaterThisMonthItems.length, 'items');
    dueLaterThisMonthItems.forEach(item => console.log(`    - ${item.name} (${item.dueDate.toDateString()})`));

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
