import React, { useMemo } from 'react';
import { RecurringBill, Person } from '../types';
import { PencilIcon, TrashIcon, RepeatIcon } from './Icons';
import { calculateSplitAmounts } from '../utils/calculations';
import { Avatar } from './Avatar';

interface RecurringBillItemProps {
  bill: RecurringBill;
  people: Person[];
  onEdit: (bill: RecurringBill) => void;
  onDelete: (billId: string) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const RecurringBillItem: React.FC<RecurringBillItemProps> = ({ bill, people, onEdit, onDelete }) => {
  const getPerson = (personId: string) => people.find(p => p.id === personId);
  const calculatedSplits = useMemo(() => calculateSplitAmounts(bill, people), [bill, people]);

  return (
    <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg transition-shadow hover:shadow-md">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{bill.name}</h3>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
            <RepeatIcon className="w-4 h-4" />
            <span>{capitalize(bill.frequency)} on day {bill.dayOfMonth}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold text-slate-900 dark:text-white">{formatCurrency(bill.amount)}</p>
          <div className="flex items-center justify-end gap-3 mt-1">
            <button onClick={() => onEdit(bill)} className="text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"><PencilIcon /></button>
            <button onClick={() => onDelete(bill.id)} className="text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"><TrashIcon /></button>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 uppercase">Split Breakdown</p>
        <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2.5 flex overflow-hidden">
          {calculatedSplits.map(split => {
            const person = getPerson(split.personId);
            if (!person || bill.amount === 0) return null;
            const percentage = (split.amount / bill.amount) * 100;
            return <div key={split.personId} className={`${person.color}`} style={{ width: `${percentage}%` }} title={`${person.name}: ${formatCurrency(split.amount)}`}></div>;
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
          {calculatedSplits.map(split => {
            const person = getPerson(split.personId);
            if (!person) return null;
            return (
              <div key={split.personId} className="flex items-center gap-2 text-sm">
                <Avatar person={person} size="xs" />
                <span className="font-medium text-slate-700 dark:text-slate-300">{person.name}:</span>
                <span className="font-semibold text-slate-600 dark:text-slate-400">{formatCurrency(split.amount)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};