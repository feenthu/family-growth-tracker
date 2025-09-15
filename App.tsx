
import React, { useState, useMemo, useEffect } from 'react';
import { Bill, Person, RecurringBill, Payment, Mortgage, MortgagePayment, MortgagePaymentBreakdown } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Header } from './components/Header';
import { Summary } from './components/Summary';
import { BillManager } from './components/BillManager';
import { PeopleManager } from './components/PeopleManager';
import { RecurringBillManager } from './components/RecurringBillManager';
import { calculateSplitAmounts, calculatePaymentBreakdown, resolveItemCycle } from './utils/calculations';
import { FamilyView } from './components/FamilyView';
import { MortgageManager } from './components/MortgageManager';
import { PasswordModal } from './components/PasswordModal';

const App: React.FC = () => {
  const [people, setPeople] = useLocalStorage<Person[]>('budget-app-people', [
    { id: '1', name: 'Alex', color: 'bg-blue-500' },
    { id: '2', name: 'Beth', color: 'bg-pink-500' },
  ]);
  const [bills, setBills] = useLocalStorage<Bill[]>('budget-app-bills', []);
  const [recurringBills, setRecurringBills] = useLocalStorage<RecurringBill[]>('budget-app-recurring-bills', []);
  const [payments, setPayments] = useLocalStorage<Payment[]>('budget-app-payments', []);
  const [mortgages, setMortgages] = useLocalStorage<Mortgage[]>('budget-app-mortgages', []);
  const [mortgagePayments, setMortgagePayments] = useLocalStorage<MortgagePayment[]>('budget-app-mortgage-payments', []);
  const [mortgagePaymentBreakdowns, setMortgagePaymentBreakdowns] = useLocalStorage<MortgagePaymentBreakdown[]>('budget-app-mortgage-payment-breakdowns', []);
  
  // Default view is 'family'. 'manage' is a protected state.
  const [view, setView] = useState<'manage' | 'family'>('family');
  const [isManagerModeUnlocked, setIsManagerModeUnlocked] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Data migration for old split format {amount} to new format {value} and add splitMode
  useEffect(() => {
    const migrateData = (items: any[]): Bill[] => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();

      return items.map(item => {
        let needsMigration = false;
        const newItem = {...item};

        // Migrate splits from {amount} to {value}
        if (item.splits && item.splits.length > 0 && typeof item.splits[0].amount !== 'undefined') {
          newItem.splitMode = 'amount';
          newItem.splits = item.splits.map((s: any) => ({ personId: s.personId, value: s.amount }));
          needsMigration = true;
        }

        // Remove old 'paid' property
        if (typeof item.paid !== 'undefined') {
            delete newItem.paid;
            needsMigration = true;
        }
        
        // Migrate numeric dueDate to string "YYYY-MM-DD"
        if (typeof newItem.dueDate === 'number') {
            let billDate: Date;
            if (newItem.period) {
                const [year, month] = newItem.period.split('-').map(Number);
                // Handles cases like day 31 in a 30-day month
                const lastDayOfMonth = new Date(year, month, 0).getDate();
                billDate = new Date(year, month - 1, Math.min(newItem.dueDate, lastDayOfMonth));
            } else {
                // Best guess for one-off bills: assume current month and year.
                const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                billDate = new Date(currentYear, currentMonth, Math.min(newItem.dueDate, lastDayOfMonth));
            }
            newItem.dueDate = billDate.toISOString().split('T')[0];
            needsMigration = true;
        }

        return needsMigration ? newItem : item;
      });
    };

    setBills(prev => migrateData(prev as any[]));

    // FIX: Cast `prev` to `any[]` to allow checking for the legacy `amount` property on splits during data migration.
    setRecurringBills(prev => (prev as any[]).map(item => {
        if (item.splits && item.splits.length > 0 && typeof item.splits[0].amount !== 'undefined') {
             return {
                ...item,
                splitMode: 'amount',
                splits: item.splits.map((s: any) => ({ personId: s.personId, value: s.amount }))
              };
        }
        return item;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time migration for mortgage breakdowns and setting a primary mortgage
  useEffect(() => {
    let needsMortgageUpdate = false;
    let needsBreakdownUpdate = false;

    // Check for primary mortgage
    const updatedMortgages = [...mortgages];
    if (mortgages.length > 0 && !mortgages.some(m => m.is_primary)) {
        updatedMortgages[0].is_primary = true;
        needsMortgageUpdate = true;
    }
    
    // Backfill breakdowns
    const updatedBreakdowns = [...mortgagePaymentBreakdowns];
    mortgagePayments.forEach(p => {
        if (!updatedBreakdowns.some(bd => bd.id === p.id)) {
            const mortgage = mortgages.find(m => m.id === p.mortgageId);
            if (mortgage) {
                const breakdown = calculatePaymentBreakdown(p, mortgage, mortgagePayments);
                updatedBreakdowns.push(breakdown);
                needsBreakdownUpdate = true;
            }
        }
    });

    if (needsMortgageUpdate) setMortgages(updatedMortgages);
    if (needsBreakdownUpdate) setMortgagePaymentBreakdowns(updatedBreakdowns);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Recurring bill generation logic
  useEffect(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed

    const newBills: Bill[] = [];
    let updatedRecurringBills = [...recurringBills];

    recurringBills.forEach(rb => {
        if (!rb.lastGeneratedPeriod) return;

        const [lastYear, lastMonth] = rb.lastGeneratedPeriod.split('-').map(Number);
        let nextGenDate = new Date(lastYear, lastMonth - 1); // 0-indexed month

        let periodMonths = 1;
        switch (rb.frequency) {
            case 'monthly': periodMonths = 1; break;
            case 'bi-monthly': periodMonths = 2; break;
            case 'quarterly': periodMonths = 3; break;
            case 'semi-annually': periodMonths = 6; break;
            case 'yearly': periodMonths = 12; break;
        }

        let latestPeriod = rb.lastGeneratedPeriod;

        // Loop to catch up on any missed generation cycles
        while (true) {
            nextGenDate.setMonth(nextGenDate.getMonth() + periodMonths);

            // Stop if the next generation date is in the future
            if (nextGenDate.getFullYear() > currentYear || (nextGenDate.getFullYear() === currentYear && nextGenDate.getMonth() > currentMonth)) {
                break;
            }

            const genYear = nextGenDate.getFullYear();
            const genMonth = nextGenDate.getMonth();
            
            const period = `${genYear}-${String(genMonth + 1).padStart(2, '0')}`;
            const instanceExists = bills.some(b => b.recurringBillId === rb.id && b.period === period) || newBills.some(b => b.recurringBillId === rb.id && b.period === period);
            
            if (!instanceExists) {
                const lastDayOfMonth = new Date(genYear, genMonth + 1, 0).getDate();
                const day = Math.min(rb.dayOfMonth, lastDayOfMonth);
                const dueDateString = new Date(genYear, genMonth, day).toISOString().split('T')[0];

                newBills.push({
                    id: `${rb.id}-${period}`,
                    name: rb.name,
                    amount: rb.amount,
                    dueDate: dueDateString,
                    splits: rb.splits,
                    splitMode: rb.splitMode,
                    recurringBillId: rb.id,
                    period: period,
                });
                latestPeriod = period;
            }
        }
        
        // Update the lastGeneratedPeriod for the recurring bill template if new bills were created
        if (latestPeriod !== rb.lastGeneratedPeriod) {
            updatedRecurringBills = updatedRecurringBills.map(item => 
                item.id === rb.id ? { ...item, lastGeneratedPeriod: latestPeriod } : item
            );
        }
    });

    if (newBills.length > 0) {
        setBills(prevBills => [...prevBills, ...newBills]);
        setRecurringBills(updatedRecurringBills);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    // Calculate the total planned monthly amount from active mortgages.
    const mortgagesTotal = mortgages
      .filter(m => m.active)
      .reduce((sum, m) => sum + m.scheduled_payment, 0);

    // Calculate the total planned monthly amount from recurring bills with a 'monthly' frequency.
    const monthlyRecurringBillsTotal = recurringBills
      .filter(rb => rb.frequency === 'monthly')
      .reduce((sum, rb) => sum + rb.amount, 0);

    // The main total is the sum of these planned amounts.
    const totalMonthly = mortgagesTotal + monthlyRecurringBillsTotal;

    // The "Split Totals" are calculated separately based on the same set of items.
    const perPersonTotals: { [key: string]: number } = {};
    people.forEach(p => (perPersonTotals[p.id] = 0));

    // Process splits for active mortgages.
    mortgages
      .filter(m => m.active)
      .forEach(mortgage => {
        // Create a splittable object for the calculation utility.
        const splittable = { ...mortgage, amount: mortgage.scheduled_payment };
        const calculatedSplits = calculateSplitAmounts(splittable, people);
        
        calculatedSplits.forEach(split => {
            if (perPersonTotals[split.personId] !== undefined) {
                perPersonTotals[split.personId] += split.amount;
            }
        });
    });

    // Process splits for 'monthly' recurring bills.
    recurringBills
      .filter(rb => rb.frequency === 'monthly')
      .forEach(bill => {
        const calculatedSplits = calculateSplitAmounts(bill, people);
        
        calculatedSplits.forEach(split => {
            if (perPersonTotals[split.personId] !== undefined) {
                perPersonTotals[split.personId] += split.amount;
            }
        });
    });

    const finalPerPersonTotals = people.map(person => ({
        ...person,
        total: perPersonTotals[person.id] || 0,
    }));

    return { totalMonthly, perPersonTotals: finalPerPersonTotals };
  }, [people, mortgages, recurringBills]);

  const handleViewChangeRequest = (newView: 'manage' | 'family') => {
    if (newView === 'family') {
      setView('family');
      setIsManagerModeUnlocked(false); // Relock the manager view
    } else if (newView === 'manage') {
      if (isManagerModeUnlocked) {
        setView('manage');
      } else {
        setIsPasswordModalOpen(true);
      }
    }
  };

  const handlePasswordSuccess = () => {
    setIsManagerModeUnlocked(true);
    setView('manage');
    setIsPasswordModalOpen(false);
  };

  const handleAddPerson = (name: string) => {
    const colors = ['bg-emerald-500', 'bg-purple-500', 'bg-yellow-500', 'bg-red-500', 'bg-indigo-500', 'bg-teal-500'];
    const newPerson: Person = {
      id: Date.now().toString(),
      name,
      color: colors[people.length % colors.length],
    };
    setPeople([...people, newPerson]);
  };
  
  const handleDeletePerson = (personId: string) => {
    const updatedBills = bills.map(bill => ({
        ...bill,
        splits: bill.splits.filter(split => split.personId !== personId)
    }));
    const updatedMortgages = mortgages.map(m => ({
        ...m,
        splits: m.splits.filter(s => s.personId !== personId)
    }));

    setBills(updatedBills.filter(bill => bill.splits.length > 0 || bill.amount === 0));
    setMortgages(updatedMortgages.filter(m => m.splits.length > 0 || m.scheduled_payment === 0));
    setPayments(payments.filter(p => p.payerPersonId !== personId));
    setMortgagePayments(mortgagePayments.filter(p => p.payerPersonId !== personId));
    setPeople(people.filter(p => p.id !== personId));
  }

  const handleSaveBill = (bill: Bill) => {
    if (editingBill) {
      setBills(bills.map(b => (b.id === bill.id ? bill : b)));
    } else {
      setBills([...bills, bill]);
    }
    closeBillModal();
  };

  const handleDeleteBill = (billId: string) => {
    setBills(bills.filter(b => b.id !== billId));
    setPayments(payments.filter(p => p.billId !== billId));
  };

  const handleSavePayment = (payment: Payment) => {
    setPayments(prev => {
        const existingIndex = prev.findIndex(p => p.id === payment.id);
        if (existingIndex > -1) {
            const updated = [...prev];
            updated[existingIndex] = payment;
            return updated;
        }
        return [...prev, payment];
    });
  };

  const handleDeletePayment = (paymentId: string) => {
    setPayments(payments.filter(p => p.id !== paymentId));
  };
  
  // --- Mortgage Handlers ---
  const handleSaveMortgage = (mortgage: Mortgage) => {
      setMortgages(prev => {
          let updated = [...prev];
          const existingIndex = prev.findIndex(m => m.id === mortgage.id);

          // Ensure only one mortgage is primary
          if (mortgage.is_primary) {
              updated = updated.map(m => ({ ...m, is_primary: false }));
          }

          if (existingIndex > -1) {
              updated[existingIndex] = mortgage;
          } else {
              // If this is the first mortgage, make it primary
              if (updated.length === 0) {
                  mortgage.is_primary = true;
              }
              updated.push(mortgage);
          }
          return updated;
      });
  };

  const handleDeleteMortgage = (mortgageId: string) => {
      setMortgages(mortgages.filter(m => m.id !== mortgageId));
      setMortgagePayments(mortgagePayments.filter(p => p.mortgageId !== mortgageId));
      setMortgagePaymentBreakdowns(mortgagePaymentBreakdowns.filter(bd => bd.mortgageId !== mortgageId));
  };
  
  const handleSaveMortgagePayment = (payment: MortgagePayment) => {
      const mortgage = mortgages.find(m => m.id === payment.id);
      if (!mortgage) return;

      const existingPayment = mortgagePayments.find(p => p.id === payment.id);
      const existingBreakdown = mortgagePaymentBreakdowns.find(bd => bd.id === payment.id);
      
      let principalChange = 0;
      if (existingBreakdown) {
          principalChange += existingBreakdown.principal;
      }
      
      // Add new payment and breakdown
      const newBreakdown = calculatePaymentBreakdown(payment, mortgage, mortgagePayments);
      principalChange -= newBreakdown.principal;

      setMortgages(mortgages.map(m => m.id === mortgage.id ? { ...m, current_principal: m.current_principal + principalChange } : m));

      setMortgagePayments(prev => {
          const existingIndex = prev.findIndex(p => p.id === payment.id);
          if (existingIndex > -1) {
              return prev.map(p => p.id === payment.id ? payment : p);
          }
          return [...prev, payment];
      });
      
      setMortgagePaymentBreakdowns(prev => {
          const existingIndex = prev.findIndex(bd => bd.id === newBreakdown.id);
          if (existingIndex > -1) {
              return prev.map(bd => bd.id === newBreakdown.id ? newBreakdown : bd);
          }
          return [...prev, newBreakdown];
      });
  };
  
  const handleDeleteMortgagePayment = (payment: MortgagePayment) => {
      const mortgage = mortgages.find(m => m.id === payment.mortgageId);
      const breakdown = mortgagePaymentBreakdowns.find(bd => bd.id === payment.id);

      if (mortgage && breakdown) {
          setMortgages(mortgages.map(m => m.id === mortgage.id ? { ...m, current_principal: m.current_principal + breakdown.principal } : m));
      }
      setMortgagePayments(mortgagePayments.filter(p => p.id !== payment.id));
      setMortgagePaymentBreakdowns(mortgagePaymentBreakdowns.filter(bd => bd.id !== payment.id));
  };

  // --- Modal States ---
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);

  const openBillModal = (bill: Bill | null = null) => {
    setEditingBill(bill);
    setIsBillModalOpen(true);
  };

  const closeBillModal = () => {
    setEditingBill(null);
    setIsBillModalOpen(false);
  };

  const handleSaveRecurringBill = (recurringBill: RecurringBill) => {
    if (editingRecurringBill) {
        setRecurringBills(recurringBills.map(rb => rb.id === recurringBill.id ? recurringBill : rb));
    } else {
        setRecurringBills([...recurringBills, recurringBill]);
    }
    closeRecurringBillModal();
  };

  const handleDeleteRecurringBill = (recurringBillId: string) => {
    setRecurringBills(recurringBills.filter(rb => rb.id !== recurringBillId));
    setBills(bills.filter(b => b.recurringBillId !== recurringBillId));
  };
  
  const [isRecurringBillModalOpen, setIsRecurringBillModalOpen] = useState(false);
  const [editingRecurringBill, setEditingRecurringBill] = useState<RecurringBill | null>(null);
  
  const openRecurringBillModal = (recurringBill: RecurringBill | null = null) => {
    setEditingRecurringBill(recurringBill);
    setIsRecurringBillModalOpen(true);
  };
  
  const closeRecurringBillModal = () => {
    setEditingRecurringBill(null);
    setIsRecurringBillModalOpen(false);
  };


  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans">
      <Header 
        currentView={view} 
        isManagerModeUnlocked={isManagerModeUnlocked}
        onViewChange={handleViewChangeRequest} 
      />
      <main className="container mx-auto p-4 md:p-8">
        {view === 'manage' ? (
          <>
            <Summary totalMonthly={totals.totalMonthly} perPersonTotals={totals.perPersonTotals} />
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <BillManager
                  bills={bills}
                  people={people}
                  payments={payments}
                  onAddBill={() => openBillModal()}
                  onEditBill={openBillModal}
                  onDeleteBill={handleDeleteBill}
                  onSaveBill={handleSaveBill}
                  onSavePayment={handleSavePayment}
                  onDeletePayment={handleDeletePayment}
                  isModalOpen={isBillModalOpen}
                  closeModal={closeBillModal}
                  editingBill={editingBill}
                />
                <MortgageManager 
                  mortgages={mortgages}
                  people={people}
                  payments={mortgagePayments}
                  onSaveMortgage={handleSaveMortgage}
                  onDeleteMortgage={handleDeleteMortgage}
                  onSavePayment={handleSaveMortgagePayment}
                  onDeletePayment={handleDeleteMortgagePayment}
                />
                <RecurringBillManager 
                    recurringBills={recurringBills}
                    people={people}
                    onAddRecurring={() => openRecurringBillModal()}
                    onEditRecurring={openRecurringBillModal}
                    onDeleteRecurring={handleDeleteRecurringBill}
                    onSaveRecurring={handleSaveRecurringBill}
                    isModalOpen={isRecurringBillModalOpen}
                    // FIX: Pass `closeRecurringBillModal` to the `closeModal` prop instead of the undefined `closeModal`.
                    closeModal={closeRecurringBillModal}
                    editingRecurringBill={editingRecurringBill}
                />
              </div>
              <div className="lg:col-span-1">
                <PeopleManager people={people} onAddPerson={handleAddPerson} onDeletePerson={handleDeletePerson}/>
              </div>
            </div>
          </>
        ) : (
          <FamilyView 
              bills={bills} 
              people={people} 
              payments={payments} 
              mortgages={mortgages} 
              mortgagePayments={mortgagePayments}
              mortgagePaymentBreakdowns={mortgagePaymentBreakdowns}
          />
        )}
      </main>
      <PasswordModal 
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSuccess={handlePasswordSuccess}
      />
    </div>
  );
};

export default App;
