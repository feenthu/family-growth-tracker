import React, { useState, useEffect, useMemo } from 'react';
import { FinancedExpense, FinancedExpensePayment, Person, Split, SplitMode } from '../types';
import { useFinancedExpensePayments, financedExpenseOperations } from '../hooks/useFinancedExpenses';
import { calculateSplitAmounts } from '../utils/calculations';
import { Avatar } from './Avatar';
import { CheckCircleIcon, ClockIcon } from './Icons';
import { LoadingSpinner } from './LoadingSpinner';

interface FinancedExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: FinancedExpense) => void;
  onUpdate?: (expense: FinancedExpense) => void;
  onDelete?: (expenseId: string) => void;
  people: Person[];
  expense: FinancedExpense;
  isAdminMode?: boolean;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDate = (date: string) => {
  const dateObj = new Date(date);
  return dateObj.toLocaleDateString();
};

export const FinancedExpenseModal: React.FC<FinancedExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  people,
  expense,
  isAdminMode = false
}) => {
  const [payments, paymentsLoading] = useFinancedExpensePayments(expense.id);
  const [isEditing, setIsEditing] = useState(false);
  const [markingPaymentId, setMarkingPaymentId] = useState<string | null>(null);

  // Editing state
  const [editingExpense, setEditingExpense] = useState<FinancedExpense>(expense);

  useEffect(() => {
    setEditingExpense(expense);
  }, [expense]);

  // Calculate payment progress
  const totalPayments = expense.financingTermMonths;
  const paidPayments = payments.filter(p => p.isPaid).length;
  const progressPercent = (paidPayments / totalPayments) * 100;

  // Calculate financial summary
  const totalPaid = payments.filter(p => p.isPaid).reduce((sum, p) => sum + p.amount, 0);
  const totalInterestPaid = payments.filter(p => p.isPaid).reduce((sum, p) => sum + p.interest, 0);
  const totalPrincipalPaid = payments.filter(p => p.isPaid).reduce((sum, p) => sum + p.principal, 0);
  const remainingPrincipal = expense.totalAmount - totalPrincipalPaid;

  // Split calculations
  const splitAmounts = calculateSplitAmounts(expense, people);

  const handleMarkPaymentPaid = async (payment: FinancedExpensePayment) => {
    if (!isAdminMode) return;

    try {
      setMarkingPaymentId(payment.id);
      await financedExpenseOperations.markPaymentPaid(
        expense.id,
        payment.id,
        new Date().toISOString().split('T')[0]
      );

      // Update local state for immediate feedback
      if (onUpdate) {
        const updatedExpense = {
          ...expense,
          payments: expense.payments.map(p =>
            p.id === payment.id
              ? { ...p, isPaid: true, paidDate: new Date().toISOString().split('T')[0] }
              : p
          )
        };
        onUpdate(updatedExpense);
      }
    } catch (error) {
      console.error('Failed to mark payment as paid:', error);
    } finally {
      setMarkingPaymentId(null);
    }
  };

  const handleUnmarkPaymentPaid = async (payment: FinancedExpensePayment) => {
    if (!isAdminMode) return;

    try {
      setMarkingPaymentId(payment.id);
      // For now, we'll need to add an API endpoint for unmarking payments
      // But we can at least update the local state
      if (onUpdate) {
        const updatedExpense = {
          ...expense,
          payments: expense.payments.map(p =>
            p.id === payment.id
              ? { ...p, isPaid: false, paidDate: undefined }
              : p
          )
        };
        onUpdate(updatedExpense);
      }
    } catch (error) {
      console.error('Failed to unmark payment:', error);
    } finally {
      setMarkingPaymentId(null);
    }
  };

  const handleSaveChanges = async () => {
    try {
      await onSave(editingExpense);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save changes:', error);
    }
  };

  const handleSplitChange = (personId: string, value: string) => {
    const newAmount = parseFloat(value) || 0;
    const newSplits = editingExpense.splits.map(s =>
      s.personId === personId ? { ...s, value: newAmount } : s
    );
    setEditingExpense({ ...editingExpense, splits: newSplits });
  };

  const handleSplitModeChange = (newMode: SplitMode) => {
    const newSplits = people.map(p => ({
      personId: p.id,
      value: newMode === 'shares' ? 1 : 0
    }));
    setEditingExpense({
      ...editingExpense,
      splitMode: newMode,
      splits: newSplits
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl m-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-purple-500"></div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
                {expense.title}
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                Financed Expense
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isAdminMode && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1 text-sm bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:hover:bg-indigo-800/50 text-indigo-700 dark:text-indigo-300 rounded font-medium transition-colors"
                >
                  Edit
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg font-semibold hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Progress</h3>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {paidPayments} / {totalPayments}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {progressPercent.toFixed(1)}% Complete
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total Paid</h3>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {formatCurrency(totalPaid)}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                of {formatCurrency(expense.totalAmount)}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Interest Paid</h3>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {formatCurrency(totalInterestPaid)}
              </p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Remaining</h3>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {formatCurrency(remainingPrincipal)}
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between items-center text-sm mb-2">
              <span className="text-slate-600 dark:text-slate-300">Payment Progress</span>
              <span className="text-slate-600 dark:text-slate-300">{progressPercent.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
              <div
                className="bg-purple-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          {/* Split Management */}
          {isEditing ? (
            <div className="mb-6 p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
              <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-4">
                Edit Monthly Payment Split
              </h3>

              {/* Split Mode Selector */}
              <div className="flex justify-center items-center gap-2 mb-4 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg max-w-md">
                {(['Amount', 'Percent', 'Shares'] as const).map(mode => {
                  const value = mode.toLowerCase() as SplitMode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleSplitModeChange(value)}
                      className={`px-3 py-1 text-sm font-semibold rounded-md transition-all w-full ${
                        editingExpense.splitMode === value
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>

              {/* Split Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {people.map(person => {
                  const split = editingExpense.splits.find(s => s.personId === person.id);
                  return (
                    <div key={person.id} className="flex items-center gap-3">
                      <Avatar person={person} size="sm" />
                      <span className="flex-1 font-medium">{person.name}</span>
                      <input
                        type="number"
                        value={split?.value || ''}
                        onChange={e => handleSplitChange(person.id, e.target.value)}
                        min="0"
                        step={editingExpense.splitMode === 'shares' ? '1' : '0.01'}
                        className="w-24 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                      />
                      <span className="text-sm text-slate-500 dark:text-slate-400 w-6">
                        {editingExpense.splitMode === 'percent' ? '%' : editingExpense.splitMode === 'amount' ? '$' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleSaveChanges}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditingExpense(expense);
                  }}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg font-semibold hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Current Split Display */
            <div className="mb-6">
              <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-3">
                Monthly Payment Split ({formatCurrency(expense.monthlyPayment)})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {splitAmounts.map(split => {
                  const person = people.find(p => p.id === split.personId);
                  if (!person || split.amount === 0) return null;

                  return (
                    <div key={person.id} className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <Avatar person={person} size="sm" />
                      <div>
                        <p className="font-medium text-sm">{person.name}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">
                          {formatCurrency(split.amount)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment Schedule */}
          <div>
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-4">
              Payment Schedule
            </h3>

            {paymentsLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {payments.map((payment, index) => (
                  <div
                    key={payment.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      payment.isPaid
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {payment.isPaid ? (
                        <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <ClockIcon className="w-5 h-5 text-slate-400" />
                      )}
                      <div>
                        <p className="font-medium">
                          Payment {payment.paymentNumber} of {totalPayments}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          Due: {formatDate(payment.dueDate)}
                          {payment.isPaid && payment.paidDate && (
                            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                              (Paid: {formatDate(payment.paidDate)})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(payment.amount)}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          Principal: {formatCurrency(payment.principal)} |
                          Interest: {formatCurrency(payment.interest)}
                        </p>
                      </div>

                      {isAdminMode && (
                        <div className="flex gap-2">
                          {!payment.isPaid ? (
                            <button
                              onClick={() => handleMarkPaymentPaid(payment)}
                              disabled={markingPaymentId === payment.id}
                              className="px-3 py-1 text-sm bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:hover:bg-indigo-800/50 text-indigo-700 dark:text-indigo-300 rounded font-medium transition-colors disabled:opacity-50"
                            >
                              {markingPaymentId === payment.id ? 'Marking...' : 'Mark Paid'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnmarkPaymentPaid(payment)}
                              disabled={markingPaymentId === payment.id}
                              className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-800/50 text-red-700 dark:text-red-300 rounded font-medium transition-colors disabled:opacity-50"
                            >
                              {markingPaymentId === payment.id ? 'Removing...' : 'Unmark Paid'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Financing Details */}
          <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-3">
              Financing Details
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Purchase Date:</span>
                <p className="font-medium">{formatDate(expense.purchaseDate)}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">First Payment:</span>
                <p className="font-medium">{formatDate(expense.firstPaymentDate)}</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Interest Rate:</span>
                <p className="font-medium">{expense.interestRatePercent}%</p>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Term:</span>
                <p className="font-medium">{expense.financingTermMonths} months</p>
              </div>
            </div>
            {expense.description && (
              <div className="mt-3">
                <span className="text-slate-500 dark:text-slate-400">Description:</span>
                <p className="font-medium mt-1">{expense.description}</p>
              </div>
            )}
          </div>

          {/* Delete Button (Admin Only) */}
          {isAdminMode && onDelete && !isEditing && (
            <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this financed expense? This action cannot be undone.')) {
                    onDelete(expense.id);
                    onClose();
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Delete Financed Expense
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};