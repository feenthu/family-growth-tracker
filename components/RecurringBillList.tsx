import React from 'react';
import { RecurringBill, Person } from '../types';
import { RecurringBillItem } from './RecurringBillItem';

interface RecurringBillListProps {
  recurringBills: RecurringBill[];
  people: Person[];
  onEdit: (bill: RecurringBill) => void;
  onDelete: (billId: string) => void;
}

export const RecurringBillList: React.FC<RecurringBillListProps> = ({ recurringBills, people, onEdit, onDelete }) => {
  if (recurringBills.length === 0) {
    return (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
            <p className="text-slate-500 dark:text-slate-400">No recurring bills added yet.</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">Click "Add Recurring" to create a template!</p>
        </div>
    );
  }
  return (
    <div className="space-y-4">
      {recurringBills.map(bill => (
        <RecurringBillItem key={bill.id} bill={bill} people={people} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
};