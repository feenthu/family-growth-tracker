
import React from 'react';
import { Person } from '../types';
import { Avatar } from './Avatar';

interface SummaryProps {
  totalMonthly: number;
  perPersonTotals: (Person & { total: number })[];
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export const Summary: React.FC<SummaryProps> = ({ totalMonthly, perPersonTotals }) => {
  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
      <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-4">Monthly Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-100 dark:bg-slate-700 p-6 rounded-lg text-center">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Monthly Bills & Mortgages</p>
          <p className="text-4xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-2">{formatCurrency(totalMonthly)}</p>
        </div>
        <div className="bg-slate-100 dark:bg-slate-700 p-6 rounded-lg">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center md:text-left">Split Totals</p>
          <div className="space-y-3">
            {perPersonTotals.map(person => (
              <div key={person.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                   <Avatar person={person} size="sm" />
                   <span className="font-semibold text-slate-700 dark:text-slate-200">{person.name}</span>
                </div>
                <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(person.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
