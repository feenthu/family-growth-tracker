import React from 'react';
import { FinancedExpense, FinancedExpensePayment, Person } from '../types';
import { Avatar } from './Avatar';
import { CheckCircleIcon } from './Icons';
import { calculateSplitAmounts } from '../utils/calculations';

interface FinancedExpenseCardProps {
  expense: FinancedExpense;
  payments: FinancedExpensePayment[];
  people: Person[];
  onPaymentClick?: (expense: FinancedExpense, payment: FinancedExpensePayment) => void;
  isAdminMode?: boolean;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDate = (date: string) => {
  const dateObj = new Date(date);
  return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const FinancedExpenseCard: React.FC<FinancedExpenseCardProps> = ({
  expense,
  payments,
  people,
  onPaymentClick,
  isAdminMode = false
}) => {
  // Calculate payment progress
  const totalPayments = expense.financingTermMonths;
  const paidPayments = payments.filter(p => p.isPaid).length;
  const progressPercent = (paidPayments / totalPayments) * 100;

  // Find next due payment
  const nextPayment = payments
    .filter(p => !p.isPaid)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  // Calculate total paid and remaining
  const totalPaid = payments.filter(p => p.isPaid).reduce((sum, p) => sum + p.amount, 0);
  const totalRemaining = expense.totalAmount - totalPaid;

  // Calculate split amounts for monthly payment
  const splitAmounts = calculateSplitAmounts(expense, people);

  // Payment status
  const isOverdue = nextPayment && new Date(nextPayment.dueDate) < new Date();
  const isUpcoming = nextPayment && new Date(nextPayment.dueDate) >= new Date();

  const getStatusInfo = () => {
    if (!nextPayment) {
      return { text: 'Paid Off', style: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' };
    }
    if (isOverdue) {
      return { text: 'Overdue', style: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' };
    }
    return { text: 'Current', style: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' };
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
      <div className="space-y-4">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 truncate" title={expense.title}>
              {expense.title}
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
              Financed
            </span>
          </div>
          <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${statusInfo.style}`}>
            {statusInfo.text}
          </span>
        </div>

        {/* Progress Section */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 dark:text-slate-300">
              Payment {paidPayments} of {totalPayments}
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              {progressPercent.toFixed(1)}% Complete
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>

        {/* Payment Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Next Payment */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
              {nextPayment ? 'Next Payment' : 'Status'}
            </p>
            {nextPayment ? (
              <>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {formatCurrency(nextPayment.amount)}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Due {formatDate(nextPayment.dueDate)}
                </p>
                {isAdminMode && onPaymentClick && (
                  <button
                    onClick={() => onPaymentClick(expense, nextPayment)}
                    className="text-xs px-2 py-1 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:hover:bg-indigo-800/50 text-indigo-700 dark:text-indigo-300 rounded font-medium transition-colors"
                  >
                    Mark Paid
                  </button>
                )}
              </>
            ) : (
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                Completed!
              </p>
            )}
          </div>

          {/* Financial Summary */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
              Total Progress
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {formatCurrency(totalPaid)}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              of {formatCurrency(expense.totalAmount)}
            </p>
          </div>

          {/* Split Information */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
              Monthly Split
            </p>
            <div className="flex flex-wrap gap-2">
              {splitAmounts.map((split) => {
                const person = people.find(p => p.id === split.personId);
                if (!person || split.amount === 0) return null;

                return (
                  <div
                    key={person.id}
                    className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-700/50 px-2 py-1 rounded-full"
                    title={`${person.name}: ${formatCurrency(split.amount)} per month`}
                  >
                    <Avatar person={person} size="xs" />
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {formatCurrency(split.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Description (if available) */}
        {expense.description && (
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {expense.description}
            </p>
          </div>
        )}

        {/* Financing Details (collapsed by default, expandable) */}
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-slate-500 dark:text-slate-400 uppercase hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            Financing Details
            <span className="ml-1 transition-transform group-open:rotate-90">▶</span>
          </summary>
          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Interest Rate:</span>
              <span className="ml-2 font-medium">{expense.interestRatePercent}%</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Term:</span>
              <span className="ml-2 font-medium">{expense.financingTermMonths} months</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Monthly Payment:</span>
              <span className="ml-2 font-medium">{formatCurrency(expense.monthlyPayment)}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Purchase Date:</span>
              <span className="ml-2 font-medium">{formatDate(expense.purchaseDate)}</span>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};