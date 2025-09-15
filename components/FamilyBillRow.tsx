import React from 'react';
import { Person } from '../types';
import { BillStatusDetails, PerPersonStatus, BillStatus } from '../utils/calculations';
import { Avatar } from './Avatar';
import { RepeatIcon, CheckCircleIcon, HomeIcon } from './Icons';

export interface DueItem {
  id: string;
  name: string;
  dueDate: Date;
  amount: number;
  statusDetails: BillStatusDetails;
  people: Person[];
  type: 'bill' | 'mortgage';
  isRecurring: boolean;
}

interface FamilyBillRowProps {
  item: DueItem;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};


export const FamilyBillRow: React.FC<FamilyBillRowProps> = ({ item }) => {
  const { name, dueDate, amount, statusDetails, people, type, isRecurring } = item;

  const statusStyles: Record<BillStatus | 'Upcoming', string> = {
    Paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    Overdue: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    Upcoming: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    'Partially Paid': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
    Unpaid: 'bg-slate-100 text-slate-800 dark:bg-slate-900/50 dark:text-slate-300'
  };
  
  const displayStatus = statusDetails.status === 'Unpaid' ? 'Upcoming' : statusDetails.status;

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Left Section: Bill Name, Due Date, Status */}
        <div className="md:col-span-1 flex flex-col justify-center">
            <div className="flex items-center gap-2">
                {isRecurring && type === 'bill' && <RepeatIcon className="w-4 h-4 text-slate-400" />}
                {type === 'mortgage' && <HomeIcon className="w-4 h-4 text-slate-400" />}
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 truncate" title={name}>{name}</h3>
                {type === 'mortgage' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-300">Mortgage</span>}
            </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Due {formatDate(dueDate)}
          </p>
        </div>

        {/* Middle Section: Total Amount & Status Pill */}
        <div className="md:col-span-1 flex flex-row md:flex-col items-center justify-between md:justify-center gap-2">
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{formatCurrency(amount)}</p>
            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${statusStyles[displayStatus]}`}>
                {displayStatus}
            </span>
        </div>

        {/* Right Section: Split Breakdown */}
        <div className="md:col-span-1">
          <div className="flex flex-wrap justify-start md:justify-end gap-x-4 gap-y-2">
            {statusDetails.perPerson.map((personStatus: PerPersonStatus) => {
              const person = people.find(p => p.id === personStatus.personId);
              if (!person || personStatus.owed === 0) return null;

              const isPaid = personStatus.remaining <= 0.01;

              return (
                <div key={person.id} className="flex items-center gap-2 text-sm bg-slate-100 dark:bg-slate-700/50 pr-3 rounded-full" title={`${person.name} owes ${formatCurrency(personStatus.owed)}, has paid ${formatCurrency(personStatus.paid)}`}>
                  <Avatar person={person} size="sm" />
                  {isPaid ? (
                      <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {formatCurrency(personStatus.remaining)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};