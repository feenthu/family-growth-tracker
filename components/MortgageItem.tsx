import React, { useMemo, useState } from 'react';
import { Mortgage, Person, MortgagePayment } from '../types';
import { PencilIcon, TrashIcon, CreditCardIcon, PaperclipIcon, HomeIcon } from './Icons';
import { Avatar } from './Avatar';
import { calculateSplitAmounts, resolveItemCycle, ItemCycle, BillStatus } from '../utils/calculations';

interface MortgageItemProps {
  mortgage: Mortgage;
  people: Person[];
  payments: MortgagePayment[];
  onEdit: (mortgage: Mortgage) => void;
  onDelete: (mortgageId: string) => void;
  onAddPayment: (mortgage: Mortgage) => void;
  onEditPayment: (mortgage: Mortgage, payment: MortgagePayment) => void;
  onDeletePayment: (payment: MortgagePayment) => void;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PaymentRow: React.FC<{payment: MortgagePayment, onEdit: () => void, onDelete: () => void}> = ({ payment, onEdit, onDelete }) => (
    <div className="grid grid-cols-12 gap-2 items-center text-sm py-2 border-t border-slate-200 dark:border-slate-600">
        <div className="col-span-3 font-semibold">{formatDate(payment.paidDate)}</div>
        <div className="col-span-3 text-slate-600 dark:text-slate-400">{capitalize(payment.method)}</div>
        <div className="col-span-3 font-bold">{formatCurrency(payment.amount)}</div>
        <div className="col-span-3 flex items-center justify-end gap-2">
            {payment.receipt && <a href={payment.receipt.dataUrl} download={payment.receipt.fileName} aria-label="Download receipt"><PaperclipIcon className="w-4 h-4" /></a>}
            <button onClick={onEdit} className="text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400"><PencilIcon className="w-4 h-4" /></button>
            <button onClick={onDelete} className="text-slate-500 hover:text-red-500 dark:hover:text-red-400"><TrashIcon className="w-4 h-4" /></button>
        </div>
        {payment.note && <div className="col-span-12 text-xs text-slate-500 dark:text-slate-400 italic mt-1">Note: {payment.note}</div>}
    </div>
);


export const MortgageItem: React.FC<MortgageItemProps> = ({ mortgage, people, payments, onEdit, onDelete, onAddPayment, onEditPayment, onDeletePayment }) => {
  const getPerson = (personId: string) => people.find(p => p.id === personId);
  const [showPayments, setShowPayments] = useState(false);
  
  const statusDetails: ItemCycle | null = useMemo(() => resolveItemCycle(mortgage, payments, people, new Date()), [mortgage, payments, people]);
  const calculatedSplits = useMemo(() => calculateSplitAmounts({...mortgage, amount: mortgage.scheduled_payment}, people), [mortgage, people]);
  
  const statusStyles: Record<BillStatus, { text: string, bg: string }> = {
    Paid: { text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/50' },
    'Partially Paid': { text: 'text-yellow-700 dark:text-yellow-300', bg: 'bg-yellow-100 dark:bg-yellow-900/50' },
    Unpaid: { text: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-600/50' },
    Upcoming: { text: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/50' },
    Overdue: { text: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/50' },
  };

  if (!statusDetails) {
      return null; // Should not happen for active mortgages, but a safeguard.
  }

  const isCyclePaid = statusDetails.status === 'Paid';

  return (
    <div className={`bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg transition-all`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <HomeIcon className="w-5 h-5 text-slate-500" />
            <h3 className={`font-bold text-lg text-slate-800 dark:text-slate-100`}>{mortgage.name}</h3>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Due on day {mortgage.payment_day} of the month</p>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Remaining Principal: {formatCurrency(mortgage.current_principal)}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold text-slate-900 dark:text-white">{formatCurrency(mortgage.scheduled_payment)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">/ month</p>
          <div className="flex items-center justify-end gap-3 mt-1">
            <button onClick={() => onEdit(mortgage)} className="text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"><PencilIcon /></button>
            <button onClick={() => onDelete(mortgage.id)} className="text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"><TrashIcon /></button>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-600/50 p-3 rounded-md">
            {statusDetails.isUpcoming ? (
                <div>
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${statusStyles.Upcoming.bg} ${statusStyles.Upcoming.text}`}>
                        Upcoming
                    </span>
                    <p className="text-sm mt-1 font-semibold">Next due: {formatDate(statusDetails.firstDueDate)}</p>
                </div>
            ) : (
                <div>
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${statusStyles[statusDetails.status].bg} ${statusStyles[statusDetails.status].text}`}>
                        {statusDetails.status}
                    </span>
                    {statusDetails.totalRemaining > 0.01 && <p className="text-sm mt-1 font-semibold">{formatCurrency(statusDetails.totalRemaining)} remaining this cycle</p>}
                </div>
            )}
            <button 
                onClick={() => onAddPayment(mortgage)} 
                disabled={isCyclePaid}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 dark:focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CreditCardIcon className="w-5 h-5" />
              Add Payment
            </button>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 uppercase">Split Breakdown</p>
        <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-2.5 flex overflow-hidden">
          {calculatedSplits.map(split => {
            const person = getPerson(split.personId);
            if (!person || mortgage.scheduled_payment === 0) return null;
            const percentage = (split.amount / mortgage.scheduled_payment) * 100;
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
      {payments.length > 0 && (
          <div className="mt-4">
              <button onClick={() => setShowPayments(!showPayments)} className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 w-full text-left">
                  {showPayments ? 'Hide' : 'Show'} {payments.length} Payment(s)
              </button>
              {showPayments && (
                  <div className="mt-2 bg-slate-100 dark:bg-slate-900/40 p-3 rounded-md">
                      {payments.map(p => <PaymentRow key={p.id} payment={p} onEdit={() => onEditPayment(mortgage, p)} onDelete={() => onDeletePayment(p)} />)}
                  </div>
              )}
          </div>
      )}
    </div>
  );
};