

import React, { useState, useEffect, useMemo } from 'react';
import { RecurringBill, Person, Split, RecurrenceFrequency, SplitMode } from '../types';

interface RecurringBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bill: RecurringBill) => void;
  people: Person[];
  existingBill: RecurringBill | null;
}

export const RecurringBillModal: React.FC<RecurringBillModalProps> = ({ isOpen, onClose, onSave, people, existingBill }) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('monthly');
  const [splitMode, setSplitMode] = useState<SplitMode>('shares');
  const [splits, setSplits] = useState<Split[]>([]);
  
  const totalAmount = typeof amount === 'number' ? amount : 0;
  
  useEffect(() => {
    if (existingBill) {
      setName(existingBill.name);
      setAmount(existingBill.amount);
      const today = new Date();
      const dateForPicker = new Date(today.getFullYear(), today.getMonth(), existingBill.dayOfMonth);
      setStartDate(dateForPicker.toISOString().split('T')[0]);
      setFrequency(existingBill.frequency);
      setSplitMode(existingBill.splitMode);
      setSplits(existingBill.splits);
    } else {
      setName('');
      setAmount('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setFrequency('monthly');
      setSplitMode('shares');
      setSplits(people.map(p => ({ personId: p.id, value: 1 })));
    }
  }, [existingBill, people, isOpen]);

  useEffect(() => {
    const existingSplitPersonIds = new Set(splits.map(s => s.personId));
    const peopleToAdd = people.filter(p => !existingSplitPersonIds.has(p.id));
    const splitsToRemove = splits.filter(s => !people.some(p => p.id === s.personId));

    if (peopleToAdd.length > 0 || splitsToRemove.length > 0) {
        const newSplits = people.map(p => {
            const existingSplit = splits.find(s => s.personId === p.id);
            if (existingSplit) return existingSplit;
            return { personId: p.id, value: splitMode === 'shares' ? 1 : 0 };
        });
        setSplits(newSplits);
    }
  }, [people, splits, splitMode]);

  const handleModeChange = (newMode: SplitMode) => {
    setSplitMode(newMode);
    if (newMode === 'shares') {
      setSplits(people.map(p => ({ personId: p.id, value: 1 })));
    } else {
      setSplits(people.map(p => ({ personId: p.id, value: 0 })));
    }
  };

  const handleSplitChange = (personId: string, value: string) => {
    const newAmount = parseFloat(value) || 0;
    setSplits(splits.map(s => s.personId === personId ? { ...s, value: newAmount } : s));
  };
  
  const handleSplitEqually = () => {
    if (people.length === 0) return;
    
    if (splitMode === 'amount' && totalAmount > 0) {
      const splitAmount = parseFloat((totalAmount / people.length).toFixed(2));
      const newSplits = people.map((p, index) => ({
        personId: p.id,
        value: index === people.length - 1 ? totalAmount - (splitAmount * (people.length - 1)) : splitAmount
      }));
      setSplits(newSplits);
    } else if (splitMode === 'percent') {
      const splitPercent = parseFloat((100 / people.length).toFixed(2));
      const newSplits = people.map((p, index) => ({
          personId: p.id,
          value: index === people.length - 1 ? 100 - (splitPercent * (people.length - 1)) : splitPercent
      }));
      setSplits(newSplits);
    } else if (splitMode === 'shares') {
      setSplits(people.map(p => ({ personId: p.id, value: 1 })));
    }
  };

  const { isValid, message } = useMemo(() => {
    const total = splits.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
    
    switch(splitMode) {
      case 'amount':
        const remaining = totalAmount - total;
        const isValid = Math.abs(remaining) < 0.01;
        let msg = '';
        if (!isValid) {
            msg = remaining > 0 ? `$${remaining.toFixed(2)} remaining` : `$${Math.abs(remaining).toFixed(2)} over`;
        } else {
            msg = 'All balanced';
        }
        return { isValid, message: msg };
      case 'percent': {
        const isValid = Math.abs(total - 100) < 0.01;
        return { isValid, message: `Total: ${total.toFixed(2)}% / 100%` };
      }
      case 'shares': {
        const isValid = total > 0;
        return { isValid, message: `Total: ${total} share(s)` };
      }
      default:
        return { isValid: false, message: 'Invalid split mode' };
    }
  }, [splits, splitMode, totalAmount]);

  const isSaveDisabled = name === '' || totalAmount <= 0 || startDate === '' || !isValid || people.length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaveDisabled) return;

    const startDateObj = new Date(startDate + 'T00:00:00');
    const dayOfMonth = startDateObj.getDate();
    
    // Set generation period to the month before the start date so the first bill is generated
    const lastMonth = new Date(startDateObj.getFullYear(), startDateObj.getMonth() - 1, 1);
    const lastGeneratedPeriod = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

    const finalBill: RecurringBill = {
      id: existingBill ? existingBill.id : `rec-${Date.now().toString()}`,
      name,
      amount: totalAmount,
      dayOfMonth: dayOfMonth,
      frequency,
      splitMode,
      splits: splits.filter(s => s.value > 0),
      lastGeneratedPeriod: existingBill ? existingBill.lastGeneratedPeriod : lastGeneratedPeriod,
    };
    onSave(finalBill);
  };

  if (!isOpen) return null;

  const inputProps = {
    amount: { step: 0.01, symbol: '$' },
    percent: { step: 0.01, symbol: '%' },
    shares: { step: 1, symbol: '' },
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 md:p-8 w-full max-w-lg m-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-6">{existingBill ? 'Edit Recurring Bill' : 'Add Recurring Bill'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="rec-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bill Name</label>
              <input type="text" id="rec-name" value={name} onChange={e => setName(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="rec-amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Total Amount ($)</label>
                <input type="number" id="rec-amount" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} required min="0.01" step="0.01" className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              </div>
              <div>
                <label htmlFor="rec-startDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">First Due Date</label>
                <input type="date" id="rec-startDate" value={startDate} onChange={e => setStartDate(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              </div>
            </div>
             <div>
                <label htmlFor="rec-frequency" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Frequency</label>
                <select id="rec-frequency" value={frequency} onChange={e => setFrequency(e.target.value as RecurrenceFrequency)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                    <option value="monthly">Monthly</option>
                    <option value="bi-monthly">Bi-monthly (every 2 months)</option>
                    <option value="quarterly">Quarterly (every 3 months)</option>
                    <option value="semi-annually">Semi-annually (every 6 months)</option>
                    <option value="yearly">Yearly</option>
                </select>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">Split Bill</h3>
                <button type="button" onClick={handleSplitEqually} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed">Split Equally</button>
              </div>
               <div className="flex justify-center items-center gap-2 my-3 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                {(['Amount', 'Percent', 'Shares'] as const).map(mode => {
                  const value = mode.toLowerCase() as SplitMode;
                  return (
                    <button key={mode} type="button" onClick={() => handleModeChange(value)} className={`px-3 py-1 text-sm font-semibold rounded-md transition-all w-full ${splitMode === value ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
                      {mode}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {people.map(person => {
                    const split = splits.find(s => s.personId === person.id);
                    return (
                        <div key={person.id} className="grid grid-cols-3 items-center gap-2">
                            <label htmlFor={`rec-split-${person.id}`} className="col-span-1 text-sm font-medium">{person.name}</label>
                             <div className="col-span-2 relative">
                                <input type="number" id={`rec-split-${person.id}`} value={split?.value || ''} onChange={e => handleSplitChange(person.id, e.target.value)} min="0" step={inputProps[splitMode].step} className="pl-7 pr-2 block w-full mt-1 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 dark:text-slate-400 sm:text-sm">{inputProps[splitMode].symbol}</span>
                            </div>
                        </div>
                    );
                })}
              </div>
              <div className={`mt-2 text-sm text-right font-medium ${isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {message}
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg font-semibold hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">Cancel</button>
            <button type="submit" disabled={isSaveDisabled} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed">Save Bill</button>
          </div>
        </form>
      </div>
    </div>
  );
};
