import React from 'react';
import { RecurringBill, Person } from '../types';
import { PlusIcon } from './Icons';
import { RecurringBillList } from './RecurringBillList';
import { RecurringBillModal } from './RecurringBillModal';

interface RecurringBillManagerProps {
  recurringBills: RecurringBill[];
  people: Person[];
  onAddRecurring: () => void;
  onEditRecurring: (bill: RecurringBill) => void;
  onDeleteRecurring: (billId: string) => void;
  onSaveRecurring: (bill: RecurringBill) => void;
  isModalOpen: boolean;
  closeModal: () => void;
  editingRecurringBill: RecurringBill | null;
}

export const RecurringBillManager: React.FC<RecurringBillManagerProps> = ({
  recurringBills,
  people,
  onAddRecurring,
  onEditRecurring,
  onDeleteRecurring,
  onSaveRecurring,
  isModalOpen,
  closeModal,
  editingRecurringBill,
}) => {
  const sortedBills = [...recurringBills].sort((a, b) => a.dayOfMonth - b.dayOfMonth);

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">Recurring Bills</h2>
        <button
          onClick={onAddRecurring}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-semibold hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 dark:focus:ring-offset-slate-800"
        >
          <PlusIcon className="w-5 h-5" />
          Add Recurring
        </button>
      </div>
      <RecurringBillList 
        recurringBills={sortedBills} 
        people={people} 
        onEdit={onEditRecurring} 
        onDelete={onDeleteRecurring} 
      />
       {isModalOpen && (
        <RecurringBillModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={onSaveRecurring}
          people={people}
          existingBill={editingRecurringBill}
        />
      )}
    </div>
  );
};