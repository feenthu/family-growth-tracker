import React, { useState } from 'react';
import { FinancedExpense, Person } from '../types';
import { FinancedExpenseModal } from './FinancedExpenseModal';
import { CreditCardIcon, PlusIcon, PencilIcon, TrashIcon } from './Icons';
import { Avatar } from './Avatar';
import { calculateSplitAmounts } from '../utils/calculations';

interface FinancedExpenseManagerProps {
  financedExpenses: FinancedExpense[];
  people: Person[];
  onSaveFinancedExpense: (expense: FinancedExpense) => void;
  onDeleteFinancedExpense: (expenseId: string) => void;
  onUpdateFinancedExpense: (expense: FinancedExpense) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDate = (date: string) => {
  const dateObj = new Date(date);
  return dateObj.toLocaleDateString();
};

export const FinancedExpenseManager: React.FC<FinancedExpenseManagerProps> = ({
  financedExpenses,
  people,
  onSaveFinancedExpense,
  onDeleteFinancedExpense,
  onUpdateFinancedExpense,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<FinancedExpense | null>(null);

  const activeExpenses = financedExpenses.filter(expense => expense.isActive);

  const openModal = (expense: FinancedExpense) => {
    setSelectedExpense(expense);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedExpense(null);
    setIsModalOpen(false);
  };

  const handleSave = (expense: FinancedExpense) => {
    onUpdateFinancedExpense(expense);
    closeModal();
  };

  const handleDelete = (expenseId: string) => {
    onDeleteFinancedExpense(expenseId);
    closeModal();
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <CreditCardIcon className="w-6 h-6 text-purple-600" />
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">Financed Expenses</h2>
        </div>
      </div>

      {activeExpenses.length === 0 ? (
        <div className="text-center py-8">
          <CreditCardIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">No financed expenses found</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Create financed expenses through the Bills & Expenses section
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeExpenses.map((expense) => {
            const splitAmounts = calculateSplitAmounts(expense, people);
            const progressPercent = 0; // This would come from payment data in a real implementation

            return (
              <div
                key={expense.id}
                className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                        {expense.title}
                      </h3>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                        Financed
                      </span>
                    </div>

                    {expense.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                        {expense.description}
                      </p>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Total Amount</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatCurrency(expense.totalAmount)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Monthly Payment</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatCurrency(expense.monthlyPayment)}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Interest Rate</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {expense.interestRatePercent}%
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Term</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {expense.financingTermMonths} months
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Split among:</span>
                        <div className="flex flex-wrap items-center gap-1">
                          {splitAmounts.map((split) => {
                            const person = people.find(p => p.id === split.personId);
                            if (!person || split.amount === 0) return null;
                            return (
                              <div key={person.id} className="flex items-center gap-1">
                                <Avatar person={person} size="xs" />
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                  {formatCurrency(split.amount)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                          onClick={() => openModal(expense)}
                          className="p-2 text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg transition-colors"
                          title="View details"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this financed expense? This action cannot be undone.')) {
                              onDeleteFinancedExpense(expense.id);
                            }
                          }}
                          className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Simple progress indicator */}
                    <div className="mt-3">
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="text-slate-500 dark:text-slate-400">Payment Progress</span>
                        <span className="text-slate-500 dark:text-slate-400">0% Complete</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                        <div
                          className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: '0%' }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for viewing/editing financed expenses */}
      {isModalOpen && selectedExpense && (
        <FinancedExpenseModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={handleSave}
          onUpdate={onUpdateFinancedExpense}
          onDelete={handleDelete}
          people={people}
          expense={selectedExpense}
          isAdminMode={true}
        />
      )}
    </div>
  );
};