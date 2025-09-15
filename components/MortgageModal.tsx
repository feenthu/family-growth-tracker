
import React, { useState, useEffect, useMemo } from 'react';
import { Mortgage, Person, Split, SplitMode } from '../types';
import { computeFirstDueDate } from '../utils/calculations';

interface MortgageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (mortgage: Mortgage) => void;
  people: Person[];
  existingMortgage: Mortgage | null;
}

const todayISO = new Date().toISOString().split('T')[0];

export const MortgageModal: React.FC<MortgageModalProps> = ({ isOpen, onClose, onSave, people, existingMortgage }) => {
  const [name, setName] = useState('Primary Residence');
  const [original_principal, setOriginalPrincipal] = useState<number|''>('');
  const [interest_rate_apy, setInterestRate] = useState<number|''>('');
  const [term_months, setTermMonths] = useState<number|''>(360);
  const [start_date, setStartDate] = useState(todayISO);
  const [scheduled_payment, setScheduledPayment] = useState<number|''>(0);
  const [first_payment_date, setFirstPaymentDate] = useState('');
  const [escrow_enabled, setEscrowEnabled] = useState(true);
  const [escrow_taxes, setEscrowTaxes] = useState<number|''>('');
  const [escrow_insurance, setEscrowInsurance] = useState<number|''>(0);
  const [escrow_hoa, setEscrowHoa] = useState<number|''>('');
  const [splitMode, setSplitMode] = useState<SplitMode>('shares');
  const [splits, setSplits] = useState<Split[]>([]);
  
  const totalAmount = typeof scheduled_payment === 'number' ? scheduled_payment : 0;
  
  useEffect(() => {
    if (existingMortgage) {
        setName(existingMortgage.name);
        setOriginalPrincipal(existingMortgage.original_principal);
        setInterestRate(existingMortgage.interest_rate_apy);
        setTermMonths(existingMortgage.term_months);
        setStartDate(existingMortgage.start_date);
        setScheduledPayment(existingMortgage.scheduled_payment);
        
        // Calculate the first due date to populate the date picker
        const firstDueDate = computeFirstDueDate(new Date(existingMortgage.start_date + 'T00:00:00'), existingMortgage.payment_day);
        setFirstPaymentDate(firstDueDate.toISOString().split('T')[0]);

        setEscrowEnabled(existingMortgage.escrow_enabled);
        setEscrowTaxes(existingMortgage.escrow_taxes || '');
        setEscrowInsurance(existingMortgage.escrow_insurance || '');
        setEscrowHoa(existingMortgage.escrow_hoa || '');
        setSplitMode(existingMortgage.splitMode);
        setSplits(existingMortgage.splits);
    } else {
      // Reset to defaults
      const today = new Date();
      const defaultStartDate = today.toISOString().split('T')[0];
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

      setName('Primary Residence');
      setOriginalPrincipal('');
      setInterestRate('');
      setTermMonths(360);
      setStartDate(defaultStartDate);
      setScheduledPayment('');
      setFirstPaymentDate(nextMonth.toISOString().split('T')[0]);
      setEscrowEnabled(true);
      setEscrowTaxes('');
      setEscrowInsurance('');
      setEscrowHoa('');
      setSplitMode('shares');
      setSplits(people.map(p => ({ personId: p.id, value: 1 })));
    }
  }, [existingMortgage, people, isOpen]);

  // Sync splits with people list
  useEffect(() => {
    const existingSplitPersonIds = new Set(splits.map(s => s.personId));
    if (people.some(p => !existingSplitPersonIds.has(p.id)) || splits.some(s => !people.some(p => p.id === s.personId))) {
        const newSplits = people.map(p => {
            const existingSplit = splits.find(s => s.personId === p.id);
            return existingSplit || { personId: p.id, value: splitMode === 'shares' ? 1 : 0 };
        });
        setSplits(newSplits);
    }
  }, [people, splits, splitMode]);

  // Auto-correct first payment date if start date makes it invalid
  useEffect(() => {
      if (start_date && first_payment_date && new Date(first_payment_date) < new Date(start_date)) {
          setFirstPaymentDate(start_date);
      }
  // We only want this to run when start_date changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start_date]);

  const handleModeChange = (newMode: SplitMode) => {
    setSplitMode(newMode);
    setSplits(people.map(p => ({ personId: p.id, value: newMode === 'shares' ? 1 : 0 })));
  };
  
  const handleSplitChange = (personId: string, value: string) => {
    const newAmount = parseFloat(value) || 0;
    setSplits(splits.map(s => s.personId === personId ? { ...s, value: newAmount } : s));
  };
  
  const handleSplitEqually = () => {
    if (people.length === 0) return;
    if (splitMode === 'amount' && totalAmount > 0) {
        setSplits(people.map((p, i) => ({ personId: p.id, value: parseFloat((totalAmount/people.length).toFixed(2)) })));
    } else if (splitMode === 'percent') {
        setSplits(people.map(p => ({ personId: p.id, value: 100/people.length })));
    } else if (splitMode === 'shares') {
        setSplits(people.map(p => ({ personId: p.id, value: 1 })));
    }
  };

  const { isValid, message } = useMemo(() => {
    const total = splits.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
    switch(splitMode) {
      case 'amount': return { isValid: Math.abs(totalAmount - total) < 0.01, message: `Remaining: $${(totalAmount-total).toFixed(2)}` };
      case 'percent': return { isValid: Math.abs(total - 100) < 0.01, message: `Total: ${total.toFixed(2)}%` };
      case 'shares': return { isValid: total > 0, message: `Total: ${total} shares` };
      default: return { isValid: false, message: 'Invalid split mode' };
    }
  }, [splits, splitMode, totalAmount]);

  const paymentDateInvalid = useMemo(() => {
      if (!start_date || !first_payment_date) return false;
      return new Date(first_payment_date) < new Date(start_date);
  }, [start_date, first_payment_date]);
  
  const isSaveDisabled = !name || !original_principal || !interest_rate_apy || !term_months || !scheduled_payment || !first_payment_date || paymentDateInvalid || !isValid || people.length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaveDisabled) return;

    // Extract the day of the month from the selected first payment date
    const paymentDay = new Date(first_payment_date + 'T00:00:00').getDate();

    const newMortgage: Mortgage = {
      id: existingMortgage?.id || `mort-${Date.now()}`,
      name,
      original_principal: Number(original_principal),
      current_principal: existingMortgage?.current_principal || Number(original_principal),
      interest_rate_apy: Number(interest_rate_apy),
      term_months: Number(term_months),
      start_date,
      scheduled_payment: Number(scheduled_payment),
      payment_day: paymentDay,
      escrow_enabled,
      escrow_taxes: Number(escrow_taxes) || undefined,
      escrow_insurance: Number(escrow_insurance) || undefined,
      escrow_hoa: Number(escrow_hoa) || undefined,
      splitMode,
      splits: splits.filter(s => s.value > 0),
      active: true,
    };
    onSave(newMortgage);
  };

  if (!isOpen) return null;
  
  const inputClasses = "mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm";
  const splitInputClasses = "col-span-2 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start z-50 overflow-y-auto" onClick={onClose}>
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 md:p-8 w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold mb-6">{existingMortgage ? 'Edit Mortgage' : 'Add Mortgage'}</h2>
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium">Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} required className={inputClasses} />
                </div>
                <div>
                    <label className="block text-sm font-medium">Start Date</label>
                    <input type="date" value={start_date} onChange={e => setStartDate(e.target.value)} required className={inputClasses} />
                </div>
            </div>
            {/* Loan Details */}
            <fieldset className="border dark:border-slate-600 p-4 rounded-md">
                <legend className="px-2 font-semibold text-lg">Loan Details</legend>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium">Original Principal ($)</label>
                        <input type="number" value={original_principal} onChange={e => setOriginalPrincipal(Number(e.target.value))} required min="0" step="0.01" className={inputClasses} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Interest Rate (APY %)</label>
                        <input type="number" value={interest_rate_apy} onChange={e => setInterestRate(Number(e.target.value))} required min="0" step="0.001" className={inputClasses} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">Term (Months)</label>
                        <input type="number" value={term_months} onChange={e => setTermMonths(Number(e.target.value))} required min="1" step="1" className={inputClasses} />
                    </div>
                </div>
            </fieldset>
            {/* Payment Details */}
            <fieldset className="border dark:border-slate-600 p-4 rounded-md">
                <legend className="px-2 font-semibold text-lg">Payment</legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium">Scheduled Payment ($)</label>
                        <input type="number" value={scheduled_payment} onChange={e => setScheduledPayment(Number(e.target.value))} required min="0" step="0.01" className={inputClasses} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium">First Payment Date</label>
                        <input type="date" value={first_payment_date} onChange={e => setFirstPaymentDate(e.target.value)} required min={start_date} className={inputClasses} />
                         {paymentDateInvalid && (
                            <p className="mt-1 text-xs text-red-500 dark:text-red-400">Payment date cannot be before start date.</p>
                        )}
                    </div>
                </div>
            </fieldset>
            {/* Escrow */}
            <fieldset className="border dark:border-slate-600 p-4 rounded-md">
                <legend className="px-2 font-semibold text-lg flex items-center gap-2">
                    <input type="checkbox" checked={escrow_enabled} onChange={e => setEscrowEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" />
                    <span>Escrow</span>
                </legend>
                {escrow_enabled && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                        <div>
                            <label className="block text-sm font-medium">Taxes / month ($)</label>
                            <input type="number" value={escrow_taxes} onChange={e => setEscrowTaxes(Number(e.target.value))} min="0" step="0.01" className={inputClasses} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Insurance / month ($)</label>
                            <input type="number" value={escrow_insurance} onChange={e => setEscrowInsurance(Number(e.target.value))} min="0" step="0.01" className={inputClasses} />
                        </div>
                         <div>
                            <label className="block text-sm font-medium">HOA / month ($)</label>
                            <input type="number" value={escrow_hoa} onChange={e => setEscrowHoa(Number(e.target.value))} min="0" step="0.01" className={inputClasses} />
                        </div>
                    </div>
                )}
            </fieldset>
            {/* Split */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-medium">Split Payment</h3>
                <button type="button" onClick={handleSplitEqually} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">Split Equally</button>
              </div>
              <div className="flex justify-center items-center gap-2 my-3 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                {(['Shares', 'Percent', 'Amount'] as const).map(mode => (
                    <button key={mode} type="button" onClick={() => handleModeChange(mode.toLowerCase() as SplitMode)} className={`px-3 py-1 text-sm font-semibold rounded-md w-full transition-all ${splitMode === mode.toLowerCase() ? 'bg-indigo-600 text-white shadow' : ''}`}>
                      {mode}
                    </button>
                ))}
              </div>
              <div className="space-y-2">
                {people.map(person => (
                    <div key={person.id} className="grid grid-cols-3 items-center gap-2">
                        <label className="col-span-1 text-sm">{person.name}</label>
                        <input type="number" value={splits.find(s => s.personId === person.id)?.value || ''} onChange={e => handleSplitChange(person.id, e.target.value)} min="0" className={splitInputClasses} />
                    </div>
                ))}
              </div>
              <div className={`mt-2 text-sm text-right font-medium ${isValid ? 'text-emerald-600' : 'text-red-600'}`}>{message}</div>
            </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg font-semibold hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">Cancel</button>
            <button type="submit" disabled={isSaveDisabled} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 dark:disabled:bg-indigo-800 disabled:cursor-not-allowed">Save Mortgage</button>
        </div>
      </form>
    </div>
  );
};
