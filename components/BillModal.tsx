
import React, { useState, useEffect, useMemo } from 'react';
import { Bill, Person, Split, SplitMode, FinancedExpense } from '../types';

interface BillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (bill: Bill) => void;
  onSaveFinanced?: (expense: FinancedExpense) => void;
  people: Person[];
  existingBill: Bill | null;
}

export const BillModal: React.FC<BillModalProps> = ({ isOpen, onClose, onSave, onSaveFinanced, people, existingBill }) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('shares');
  const [splits, setSplits] = useState<Split[]>([]);

  // Financing fields
  const [isFinanced, setIsFinanced] = useState(false);
  const [description, setDescription] = useState('');
  const [interestRate, setInterestRate] = useState<number | ''>('');
  const [financingTerm, setFinancingTerm] = useState<number | ''>('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');
  
  const totalAmount = typeof amount === 'number' ? amount : 0;
  
  useEffect(() => {
    if (existingBill) {
      setName(existingBill.name);
      setAmount(existingBill.amount);
      setDueDate(existingBill.dueDate);
      setSplitMode(existingBill.splitMode);
      setSplits(existingBill.splits);
      // Reset financing fields for existing bills
      setIsFinanced(false);
      setDescription('');
      setInterestRate('');
      setFinancingTerm('');
      setPurchaseDate('');
      setFirstPaymentDate('');
    } else {
      setName('');
      setAmount('');
      setDueDate(new Date().toISOString().split('T')[0]);
      setSplitMode('shares');
      setSplits(people.map(p => ({ personId: p.id, value: 1 })));
      // Reset financing fields for new items
      setIsFinanced(false);
      setDescription('');
      setInterestRate('');
      setFinancingTerm('');
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setFirstPaymentDate('');
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

    const amountToSplit = isFinanced ? monthlyPayment : totalAmount;

    if (splitMode === 'amount' && amountToSplit > 0) {
      const splitAmount = parseFloat((amountToSplit / people.length).toFixed(2));
      const newSplits = people.map((p, index) => ({
        personId: p.id,
        value: index === people.length - 1 ? amountToSplit - (splitAmount * (people.length - 1)) : splitAmount
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
    const amountToValidate = isFinanced ? monthlyPayment : totalAmount;

    switch(splitMode) {
      case 'amount':
        const remaining = amountToValidate - total;
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
  }, [splits, splitMode, totalAmount, isFinanced]);

  // Calculate monthly payment for financing
  const monthlyPayment = useMemo(() => {
    if (!isFinanced || !totalAmount || !interestRate || !financingTerm) return 0;

    const principal = totalAmount;
    const monthlyRate = (typeof interestRate === 'number' ? interestRate : 0) / 100 / 12;
    const months = typeof financingTerm === 'number' ? financingTerm : 0;

    if (monthlyRate === 0) return principal / months;

    return principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
  }, [isFinanced, totalAmount, interestRate, financingTerm]);

  const isSaveDisabled = useMemo(() => {
    const basicValidation = name === '' || totalAmount <= 0 || !isValid || people.length === 0;

    if (!isFinanced) {
      return basicValidation || dueDate === '';
    }

    // Additional validation for financed expenses
    const financingValidation =
      !interestRate ||
      !financingTerm ||
      purchaseDate === '' ||
      firstPaymentDate === '';

    return basicValidation || financingValidation;
  }, [name, totalAmount, isValid, people.length, isFinanced, dueDate, interestRate, financingTerm, purchaseDate, firstPaymentDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaveDisabled) return;

    if (isFinanced) {
      // Create financed expense
      if (!onSaveFinanced) {
        console.error('onSaveFinanced handler is required for financed expenses');
        return;
      }

      const financedExpense: FinancedExpense = {
        id: Date.now().toString(),
        title: name,
        description,
        totalAmount: totalAmount,
        monthlyPayment: monthlyPayment,
        interestRatePercent: typeof interestRate === 'number' ? interestRate : 0,
        financingTermMonths: typeof financingTerm === 'number' ? financingTerm : 0,
        purchaseDate,
        firstPaymentDate,
        isActive: true,
        amount: monthlyPayment, // For Splittable interface
        splitMode,
        splits: splits.filter(s => s.value > 0),
      };
      onSaveFinanced(financedExpense);
    } else {
      // Create regular bill
      const finalBill: Bill = {
        id: existingBill ? existingBill.id : Date.now().toString(),
        name,
        amount: totalAmount,
        dueDate: dueDate,
        splitMode,
        splits: splits.filter(s => s.value > 0),
      };
      onSave(finalBill);
    }
  };

  if (!isOpen) return null;

  const inputProps = {
    amount: { step: 0.01, symbol: '$' },
    percent: { step: 0.01, symbol: '%' },
    shares: { step: 1, symbol: '' },
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 md:p-8 w-full max-w-2xl m-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-6">{existingBill ? 'Edit Bill' : isFinanced ? 'Add Financed Expense' : 'Add New Bill'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{isFinanced ? 'Expense Name' : 'Bill Name'}</label>
              <input type="text" id="name" value={name} onChange={e => setName(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>

            {!existingBill && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isFinanced"
                  checked={isFinanced}
                  onChange={e => setIsFinanced(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded"
                />
                <label htmlFor="isFinanced" className="ml-2 block text-sm text-slate-700 dark:text-slate-300">
                  This is a financed expense
                </label>
              </div>
            )}

            {isFinanced && (
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description (Optional)</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
            )}
            {isFinanced ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Total Purchase Amount ($)</label>
                    <input type="number" id="amount" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} required min="0.01" step="0.01" className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                  </div>
                  <div>
                    <label htmlFor="interestRate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Interest Rate (%)</label>
                    <input type="number" id="interestRate" value={interestRate} onChange={e => setInterestRate(parseFloat(e.target.value) || '')} required min="0" step="0.01" className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="financingTerm" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Financing Term (months)</label>
                    <input type="number" id="financingTerm" value={financingTerm} onChange={e => setFinancingTerm(parseInt(e.target.value) || '')} required min="1" step="1" className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Monthly Payment</label>
                    <div className="mt-1 block w-full px-3 py-2 bg-slate-100 dark:bg-slate-600 border border-slate-300 dark:border-slate-600 rounded-md sm:text-sm text-slate-700 dark:text-slate-300">
                      ${monthlyPayment.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="purchaseDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Purchase Date</label>
                    <input type="date" id="purchaseDate" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                  </div>
                  <div>
                    <label htmlFor="firstPaymentDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">First Payment Date</label>
                    <input type="date" id="firstPaymentDate" value={firstPaymentDate} onChange={e => setFirstPaymentDate(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                  </div>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="amount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Total Amount ($)</label>
                  <input type="number" id="amount" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} required min="0.01" step="0.01" className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                </div>
                <div>
                  <label htmlFor="dueDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Due Date</label>
                  <input type="date" id="dueDate" value={dueDate} onChange={e => setDueDate(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                </div>
              </div>
            )}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">Split {isFinanced ? 'Monthly Payment' : 'Bill'}</h3>
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
                            <label htmlFor={`split-${person.id}`} className="col-span-1 text-sm font-medium">{person.name}</label>
                            <div className="col-span-2 relative">
                                <input type="number" id={`split-${person.id}`} value={split?.value || ''} onChange={e => handleSplitChange(person.id, e.target.value)} min="0" step={inputProps[splitMode].step} className="pl-7 pr-2 block w-full mt-1 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
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
            <button type="submit" disabled={isSaveDisabled} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed">
              {isFinanced ? 'Create Financed Expense' : existingBill ? 'Save Bill' : 'Create Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
