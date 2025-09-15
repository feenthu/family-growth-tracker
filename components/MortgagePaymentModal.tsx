import React, { useState, useEffect, useMemo } from 'react';
import { Mortgage, Person, MortgagePayment, PaymentMethod, PaymentAllocation } from '../types';
import { resolveItemCycle } from '../utils/calculations';
import { PaperclipIcon } from './Icons';

interface MortgagePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payment: MortgagePayment) => void;
  people: Person[];
  mortgage: Mortgage;
  existingPayment: MortgagePayment | null;
  paymentsForMortgage: MortgagePayment[];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PAYMENT_METHODS: PaymentMethod[] = ['card', 'cash', 'check', 'venmo', 'zelle', 'ach', 'other'];

// FIX: Added missing formatCurrency function to format monetary values.
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export const MortgagePaymentModal: React.FC<MortgagePaymentModalProps> = ({ isOpen, onClose, onSave, people, mortgage, existingPayment, paymentsForMortgage }) => {
  
  const statusDetails = useMemo(() => {
    const paymentsToConsider = existingPayment 
      ? paymentsForMortgage.filter(p => p.id !== existingPayment.id)
      : paymentsForMortgage;
    return resolveItemCycle(mortgage, paymentsToConsider, people, new Date());
  }, [mortgage, paymentsForMortgage, existingPayment, people]);

  const totalRemaining = statusDetails?.totalRemaining ?? mortgage.scheduled_payment;
  
  const [amount, setAmount] = useState<number | ''>('');
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState<PaymentMethod>('ach');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<{fileName: string, dataUrl: string} | null>(null);
  const [useManualAllocations, setUseManualAllocations] = useState(false);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  
  useEffect(() => {
    if (existingPayment) {
      setAmount(existingPayment.amount);
      setPaidDate(existingPayment.paidDate);
      setMethod(existingPayment.method);
      setNote(existingPayment.note || '');
      setReceipt(existingPayment.receipt || null);
      setUseManualAllocations(!!existingPayment.allocations);
      setAllocations(existingPayment.allocations || people.map(p => ({ personId: p.id, amount: 0 })));
    } else {
      setAmount(totalRemaining > 0.01 ? parseFloat(totalRemaining.toFixed(2)) : '');
      setPaidDate(new Date().toISOString().split('T')[0]);
      setMethod('ach');
      setNote('');
      setReceipt(null);
      setUseManualAllocations(false);
      setAllocations(people.map(p => ({ personId: p.id, amount: 0 })));
    }
  }, [existingPayment, isOpen, totalRemaining, people]);

  const handleAllocationChange = (personId: string, value: string) => {
    const newAmount = parseFloat(value) || 0;
    setAllocations(allocs => allocs.map(a => a.personId === personId ? { ...a, amount: newAmount } : a));
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        setReceipt({ fileName: file.name, dataUrl: loadEvent.target?.result as string });
      };
      reader.readAsDataURL(file);
    }
  };
  
  const validation = useMemo(() => {
    const numAmount = Number(amount) || 0;
    if (numAmount <= 0) return { isValid: false, message: "Payment amount must be positive." };
    if (numAmount > totalRemaining + 0.01) return { isValid: false, message: `Overpayment not allowed. Max is $${totalRemaining.toFixed(2)}.` };
    
    if (useManualAllocations) {
        const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
        if (Math.abs(totalAllocated - numAmount) > 0.01) {
            return { isValid: false, message: `Allocations ($${totalAllocated.toFixed(2)}) must sum to payment amount ($${numAmount.toFixed(2)}).`};
        }
    }
    return { isValid: true, message: '' };
  }, [amount, totalRemaining, useManualAllocations, allocations]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.isValid) return;

    const finalPayment: MortgagePayment = {
        id: existingPayment ? existingPayment.id : `mpay-${Date.now().toString()}`,
        mortgageId: mortgage.id,
        amount: Number(amount),
        paidDate,
        method,
        note: note || undefined,
        receipt: receipt || undefined,
        allocations: useManualAllocations ? allocations.filter(a => a.amount > 0) : undefined,
    };
    onSave(finalPayment);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={onClose}>
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 md:p-8 w-full max-w-lg m-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-2">Payment for <span className="text-cyan-500">{mortgage.name}</span></h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Scheduled: {formatCurrency(mortgage.scheduled_payment)}, Remaining: <span className="font-bold">{formatCurrency(totalRemaining)}</span></p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium">Amount</label>
            <input type="number" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} required min="0.01" step="0.01" className="mt-1 input-field" />
             <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setAmount(parseFloat(totalRemaining.toFixed(2)))} className="btn-chip">Pay Remaining</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Paid Date</label>
              <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} required className="mt-1 input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium">Method</label>
              <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="mt-1 input-field">
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{capitalize(m)}</option>)}
              </select>
            </div>
          </div>
          
          <div className="relative flex items-start">
            <div className="flex h-6 items-center"><input id="manual-allocations" type="checkbox" checked={useManualAllocations} onChange={e => setUseManualAllocations(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" /></div>
            <div className="ml-3 text-sm"><label htmlFor="manual-allocations" className="font-medium">Allocate payment to specific members</label></div>
          </div>

          {useManualAllocations && (
              <div className="space-y-2 max-h-32 overflow-y-auto pr-2 border-t border-b py-3 dark:border-slate-700">
                {people.map(p => (
                    <div key={p.id} className="grid grid-cols-3 items-center gap-2">
                        <label className="col-span-1 text-sm font-medium">{p.name}</label>
                        <input type="number" value={allocations.find(a => a.personId === p.id)?.amount || ''} onChange={e => handleAllocationChange(p.id, e.target.value)} min="0" step="0.01" className="col-span-2 input-field py-1" />
                    </div>
                ))}
              </div>
          )}

          <div>
            <label className="block text-sm font-medium">Note (Optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="mt-1 input-field"></textarea>
          </div>
          
          <div>
            <label className="block text-sm font-medium">Receipt (Optional)</label>
             <div className="mt-1 flex items-center gap-2">
                <label className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600">
                    <PaperclipIcon className="w-4 h-4" />
                    <span>{receipt ? 'Change' : 'Attach'} file</span>
                    <input type="file" onChange={handleFileUpload} accept="image/*,application/pdf" className="sr-only" />
                </label>
                {receipt && <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{receipt.fileName}</span>}
            </div>
          </div>
          
          {!validation.isValid && <p className="text-sm text-red-600 dark:text-red-400 text-center">{validation.message}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={!validation.isValid} className="btn-primary">Save Payment</button>
        </div>
        <style>{`
            .input-field { display: block; width: 100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #d1d5db; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); color: black; }
            .dark .input-field { background-color: #334155; border-color: #475569; color: #f8fafc; }
            .btn-primary { padding: 0.5rem 1rem; background-color: #4f46e5; color: white; border-radius: 0.375rem; font-weight: 600; transition: background-color 0.2s; }
            .btn-primary:hover { background-color: #4338ca; }
            .btn-primary:disabled { background-color: #a5b4fc; cursor: not-allowed; }
            .btn-secondary { padding: 0.5rem 1rem; background-color: #e5e7eb; color: #1f2937; border-radius: 0.375rem; font-weight: 600; transition: background-color 0.2s; }
            .dark .btn-secondary { background-color: #4b5563; color: #e5e7eb; }
            .btn-chip { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 0.375rem; background-color: #e5e7eb; }
            .dark .btn-chip { background-color: #4b5563; }
        `}</style>
      </form>
    </div>
  );
};