import React, { useState, useEffect, useMemo } from 'react';
import { Bill, Person, Payment, PaymentMethod, PaymentAllocation } from '../types';
import { resolveItemCycle } from '../utils/calculations';
import { PaperclipIcon } from './Icons';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payment: Payment) => void;
  people: Person[];
  bill: Bill;
  existingPayment: Payment | null;
  paymentsForBill: Payment[];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PAYMENT_METHODS: PaymentMethod[] = ['card', 'cash', 'check', 'venmo', 'zelle', 'ach', 'other'];

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onSave, people, bill, existingPayment, paymentsForBill }) => {
  
  const billStatus = useMemo(() => {
    const paymentsToConsider = existingPayment 
      ? paymentsForBill.filter(p => p.id !== existingPayment.id)
      : paymentsForBill;
    // We pass the payments manually to get remaining amount *before* this new payment.
    return resolveItemCycle(bill, paymentsToConsider, people, new Date());
  }, [bill, paymentsForBill, existingPayment, people]);

  const totalRemaining = billStatus?.totalRemaining ?? bill.amount;
  
  const [amount, setAmount] = useState<number | ''>('');
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState<PaymentMethod>('venmo');
  const [payerPersonId, setPayerPersonId] = useState<string>('');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<{fileName: string, dataUrl: string} | null>(null);
  const [useManualAllocations, setUseManualAllocations] = useState(false);
  const [allocations, setAllocations] = useState<PaymentAllocation[]>([]);
  
  useEffect(() => {
    if (existingPayment) {
      setAmount(existingPayment.amount);
      setPaidDate(existingPayment.paidDate);
      setMethod(existingPayment.method);
      setPayerPersonId(existingPayment.payerPersonId || '');
      setNote(existingPayment.note || '');
      setReceipt(existingPayment.receipt || null);
      if (existingPayment.allocations) {
        setUseManualAllocations(true);
        setAllocations(existingPayment.allocations);
      } else {
        setUseManualAllocations(false);
        setAllocations(people.map(p => ({ personId: p.id, amount: 0 })));
      }
    } else {
      setAmount(totalRemaining > 0.01 ? parseFloat(totalRemaining.toFixed(2)) : '');
      setPaidDate(new Date().toISOString().split('T')[0]);
      setMethod('venmo');
      setPayerPersonId('');
      setNote('');
      setReceipt(null);
      setUseManualAllocations(false);
      // Initialize allocations for manual entry
      setAllocations(people.map(p => ({ personId: p.id, amount: 0 })))
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
        setReceipt({
          fileName: file.name,
          dataUrl: loadEvent.target?.result as string,
        });
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

    const finalPayment: Payment = {
        id: existingPayment ? existingPayment.id : `pay-${Date.now().toString()}`,
        billId: bill.id,
        amount: Number(amount),
        paidDate,
        method,
        payerPersonId: payerPersonId || undefined,
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
        <h2 className="text-2xl font-bold mb-2">{existingPayment ? 'Edit Payment' : 'Add Payment'} for <span className="text-indigo-500">{bill.name}</span></h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Scheduled: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(bill.amount)}, Remaining: <span className="font-bold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalRemaining)}</span></p>

        <div className="space-y-4">
          <div>
            <label htmlFor="paymentAmount" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Amount</label>
            <input type="number" id="paymentAmount" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} required min="0.01" step="0.01" className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
            <div className="flex gap-2 mt-2">
                <button type="button" onClick={() => setAmount(parseFloat(totalRemaining.toFixed(2)))} className="text-xs px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500">Pay Remaining</button>
                <button type="button" onClick={() => setAmount(parseFloat((bill.amount / 2).toFixed(2)))} className="text-xs px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500">Pay 50%</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="paidDate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Paid Date</label>
              <input type="date" id="paidDate" value={paidDate} onChange={e => setPaidDate(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            <div>
              <label htmlFor="method" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Method</label>
              <select id="method" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{capitalize(m)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Payer (Optional)</label>
            <select id="payer" value={payerPersonId} onChange={e => setPayerPersonId(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500">
                <option value="">-- No specific payer --</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          
          <div className="relative flex items-start">
            <div className="flex h-6 items-center">
              <input id="manual-allocations" type="checkbox" checked={useManualAllocations} onChange={e => setUseManualAllocations(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" />
            </div>
            <div className="ml-3 text-sm leading-6">
              <label htmlFor="manual-allocations" className="font-medium text-slate-900 dark:text-slate-200">Allocate payment to specific members</label>
              <p className="text-slate-500 dark:text-slate-400">By default, payment is allocated proportionally.</p>
            </div>
          </div>

          {useManualAllocations && (
              <div className="space-y-2 max-h-32 overflow-y-auto pr-2 border-t border-b border-slate-200 dark:border-slate-700 py-3">
                {people.map(p => {
                    const alloc = allocations.find(a => a.personId === p.id);
                    return (
                        <div key={p.id} className="grid grid-cols-3 items-center gap-2">
                            <label htmlFor={`alloc-${p.id}`} className="col-span-1 text-sm font-medium">{p.name}</label>
                            <input type="number" id={`alloc-${p.id}`} value={alloc?.amount || ''} onChange={e => handleAllocationChange(p.id, e.target.value)} min="0" step="0.01" className="col-span-2 block w-full px-3 py-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm sm:text-sm focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                    );
                })}
              </div>
          )}

          <div>
            <label htmlFor="note" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Note (Optional)</label>
            <textarea id="note" value={note} onChange={e => setNote(e.target.value)} rows={2} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"></textarea>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Receipt (Optional)</label>
            <div className="mt-1 flex items-center gap-2">
                <label className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600">
                    <PaperclipIcon className="w-4 h-4" />
                    <span>{receipt ? 'Change file' : 'Attach file'}</span>
                    <input type="file" onChange={handleFileUpload} accept="image/png, image/jpeg, application/pdf" className="sr-only" />
                </label>
                {receipt && <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{receipt.fileName}</span>}
            </div>
          </div>
          
          {!validation.isValid && <p className="text-sm text-red-600 dark:text-red-400 text-center">{validation.message}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg font-semibold hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">Cancel</button>
          <button type="submit" disabled={!validation.isValid} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed">Save Payment</button>
        </div>
      </form>
    </div>
  );
};