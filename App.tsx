
import React, { useState, useMemo, useEffect } from 'react';
import { Bill, Person, RecurringBill, Payment, Mortgage, MortgagePayment, MortgagePaymentBreakdown, FinancedExpense } from './types';
import { useMembers, useBills, useRecurringBills, usePayments, useMortgages, useMortgagePayments, useMortgagePaymentBreakdowns, apiOperations } from './hooks/useApiData';
import { useFinancedExpenses, financedExpenseOperations } from './hooks/useFinancedExpenses';
import { Header } from './components/Header';
import { Summary } from './components/Summary';
import { BillManager } from './components/BillManager';
import { PeopleManager } from './components/PeopleManager';
import { RecurringBillManager } from './components/RecurringBillManager';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { WarningBanner } from './components/WarningBanner';
import { calculateSplitAmounts, calculatePaymentBreakdown, resolveItemCycle } from './utils/calculations';
import { FamilyView } from './components/FamilyView';
import { MortgageManager } from './components/MortgageManager';
import { PasswordModal } from './components/PasswordModal';
import { ErrorBoundary } from './components/ErrorBoundary';

const App: React.FC = () => {
  const [people, setPeople, peopleLoading, peopleWarning] = useMembers();
  const [bills, setBills, billsLoading, billsWarning] = useBills();
  const [recurringBills, setRecurringBills, recurringBillsLoading, recurringBillsWarning] = useRecurringBills();
  const [payments, setPayments, paymentsLoading, paymentsWarning] = usePayments();
  const [mortgages, setMortgages, mortgagesLoading, mortgagesWarning] = useMortgages();
  const [mortgagePayments, setMortgagePayments, mortgagePaymentsLoading, mortgagePaymentsWarning] = useMortgagePayments();
  const [mortgagePaymentBreakdowns, setMortgagePaymentBreakdowns, breakdownsLoading, breakdownsWarning] = useMortgagePaymentBreakdowns();
  const [financedExpenses, setFinancedExpenses, financedExpensesLoading, financedExpensesWarning] = useFinancedExpenses();

  // Compute loading state (no blocking errors anymore)
  const isLoading = peopleLoading || billsLoading || recurringBillsLoading || paymentsLoading || mortgagesLoading || mortgagePaymentsLoading || breakdownsLoading || financedExpensesLoading;

  // Collect warnings for non-blocking notification
  const warnings = [peopleWarning, billsWarning, recurringBillsWarning, paymentsWarning, mortgagesWarning, mortgagePaymentsWarning, breakdownsWarning, financedExpensesWarning].filter(Boolean);
  
  // Default view is 'family'. 'manage' is a protected state.
  const [view, setView] = useState<'manage' | 'family'>('family');
  const [isManagerModeUnlocked, setIsManagerModeUnlocked] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Note: Data migration effects removed since we're now using API persistence


  // Note: Recurring bill generation logic should be handled server-side or moved to API hooks

  const totals = useMemo(() => {
    // Helper function to safely get numeric values
    const safeNumber = (value: any): number => {
      if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
        return value
      }
      console.warn('Invalid numeric value in calculation:', value)
      return 0
    }

    // Calculate the total planned monthly amount from active mortgages.
    const mortgagesTotal = mortgages
      .filter(m => m.active)
      .reduce((sum, m) => sum + safeNumber(m.scheduled_payment), 0);

    // Calculate the total planned monthly amount from recurring bills with a 'monthly' frequency.
    const monthlyRecurringBillsTotal = recurringBills
      .filter(rb => rb.frequency === 'monthly')
      .reduce((sum, rb) => sum + safeNumber(rb.amount), 0);

    // Calculate the total from regular bills (one-time bills)
    const regularBillsTotal = bills.reduce((sum, bill) => sum + safeNumber(bill.amount), 0);

    // Calculate the total planned monthly amount from active financed expenses.
    const financedExpensesTotal = financedExpenses
      .filter(fe => fe.isActive)
      .reduce((sum, fe) => sum + safeNumber(fe.monthlyPayment), 0);

    // The main total is the sum of these planned amounts.
    const totalMonthly = mortgagesTotal + monthlyRecurringBillsTotal + regularBillsTotal + financedExpensesTotal;

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

    // Process splits for regular bills (one-time bills).
    bills.forEach(bill => {
        const calculatedSplits = calculateSplitAmounts(bill, people);

        calculatedSplits.forEach(split => {
            if (perPersonTotals[split.personId] !== undefined) {
                perPersonTotals[split.personId] += split.amount;
            }
        });
    });

    // Process splits for active financed expenses.
    financedExpenses
      .filter(fe => fe.isActive)
      .forEach(expense => {
        const calculatedSplits = calculateSplitAmounts(expense, people);

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
  }, [people, mortgages, recurringBills, bills, financedExpenses]);

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

  const handleAddPerson = async (name: string) => {
    const colors = ['bg-emerald-500', 'bg-purple-500', 'bg-yellow-500', 'bg-red-500', 'bg-indigo-500', 'bg-teal-500'];
    const newPerson: Person = {
      id: Date.now().toString(),
      name,
      color: colors[people.length % colors.length],
    };
    try {
      const createdPerson = await apiOperations.createMember(newPerson);
      setPeople([...people, createdPerson]);
    } catch (error) {
      console.error('Failed to add person:', error);
    }
  };
  
  const handleDeletePerson = async (personId: string) => {
    try {
      await apiOperations.deleteMember(personId);
      // The API should handle cascading deletes, but we'll update local state
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
    } catch (error) {
      console.error('Failed to delete person:', error);
    }
  }

  const handleSaveBill = async (bill: Bill) => {
    try {
      if (editingBill) {
        const updatedBill = await apiOperations.updateBill(bill);
        setBills(bills.map(b => (b.id === bill.id ? updatedBill : b)));
      } else {
        const createdBill = await apiOperations.createBill(bill);
        setBills([...bills, createdBill]);
      }
      closeBillModal();
    } catch (error) {
      console.error('Failed to save bill:', error);
    }
  };

  const handleSaveFinancedExpense = async (expense: FinancedExpense) => {
    try {
      const createdExpense = await financedExpenseOperations.createFinancedExpense(expense);
      setFinancedExpenses([...financedExpenses, createdExpense]);
      closeBillModal();
    } catch (error) {
      console.error('Failed to save financed expense:', error);
    }
  };

  const handleDeleteBill = async (billId: string) => {
    try {
      await apiOperations.deleteBill(billId);
      setBills(bills.filter(b => b.id !== billId));
      setPayments(payments.filter(p => p.billId !== billId));
    } catch (error) {
      console.error('Failed to delete bill:', error);
    }
  };

  const handleUpdateFinancedExpense = async (expense: FinancedExpense) => {
    try {
      const updatedExpense = await financedExpenseOperations.updateFinancedExpense(expense);
      setFinancedExpenses(financedExpenses.map(e => e.id === expense.id ? updatedExpense : e));
    } catch (error) {
      console.error('Failed to update financed expense:', error);
    }
  };

  const handleDeleteFinancedExpense = async (expenseId: string) => {
    try {
      await financedExpenseOperations.deleteFinancedExpense(expenseId);
      setFinancedExpenses(financedExpenses.filter(e => e.id !== expenseId));
    } catch (error) {
      console.error('Failed to delete financed expense:', error);
    }
  };

  const handleSavePayment = async (payment: Payment) => {
    try {
      const existingIndex = payments.findIndex(p => p.id === payment.id);
      if (existingIndex > -1) {
        const updatedPayment = await apiOperations.updatePayment(payment);
        const updated = [...payments];
        updated[existingIndex] = updatedPayment;
        setPayments(updated);
      } else {
        const createdPayment = await apiOperations.createPayment(payment);
        setPayments([...payments, createdPayment]);
      }
    } catch (error) {
      console.error('Failed to save payment:', error);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    try {
      await apiOperations.deletePayment(paymentId);
      setPayments(payments.filter(p => p.id !== paymentId));
    } catch (error) {
      console.error('Failed to delete payment:', error);
    }
  };
  
  // --- Mortgage Handlers ---
  const handleSaveMortgage = async (mortgage: Mortgage) => {
      try {
        let updated = [...mortgages];
        const existingIndex = mortgages.findIndex(m => m.id === mortgage.id);

        // Ensure only one mortgage is primary
        if (mortgage.is_primary) {
            updated = updated.map(m => ({ ...m, is_primary: false }));
        }

        if (existingIndex > -1) {
            const updatedMortgage = await apiOperations.updateMortgage(mortgage);
            updated[existingIndex] = updatedMortgage;
        } else {
            // If this is the first mortgage, make it primary
            if (updated.length === 0) {
                mortgage.is_primary = true;
            }
            const createdMortgage = await apiOperations.createMortgage(mortgage);
            updated.push(createdMortgage);
        }
        setMortgages(updated);
      } catch (error) {
        console.error('Failed to save mortgage:', error);
      }
  };

  const handleDeleteMortgage = async (mortgageId: string) => {
      try {
        await apiOperations.deleteMortgage(mortgageId);
        setMortgages(mortgages.filter(m => m.id !== mortgageId));
        setMortgagePayments(mortgagePayments.filter(p => p.mortgageId !== mortgageId));
        setMortgagePaymentBreakdowns(mortgagePaymentBreakdowns.filter(bd => bd.mortgageId !== mortgageId));
      } catch (error) {
        console.error('Failed to delete mortgage:', error);
      }
  };
  
  const handleSaveMortgagePayment = async (payment: MortgagePayment) => {
      try {
        const mortgage = mortgages.find(m => m.id === payment.mortgageId);
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

        if (existingPayment) {
          const updatedPayment = await apiOperations.updateMortgagePayment(payment);
          setMortgagePayments(mortgagePayments.map(p => p.id === payment.id ? updatedPayment : p));
        } else {
          const createdPayment = await apiOperations.createMortgagePayment(payment);
          setMortgagePayments([...mortgagePayments, createdPayment]);
        }

        // Update mortgage principal (this should ideally be handled by the API)
        setMortgages(mortgages.map(m => m.id === mortgage.id ? { ...m, current_principal: m.current_principal + principalChange } : m));

        const existingBreakdownIndex = mortgagePaymentBreakdowns.findIndex(bd => bd.id === newBreakdown.id);
        if (existingBreakdownIndex > -1) {
            setMortgagePaymentBreakdowns(mortgagePaymentBreakdowns.map(bd => bd.id === newBreakdown.id ? newBreakdown : bd));
        } else {
            setMortgagePaymentBreakdowns([...mortgagePaymentBreakdowns, newBreakdown]);
        }
      } catch (error) {
        console.error('Failed to save mortgage payment:', error);
      }
  };
  
  const handleDeleteMortgagePayment = async (payment: MortgagePayment) => {
      try {
        const mortgage = mortgages.find(m => m.id === payment.mortgageId);
        const breakdown = mortgagePaymentBreakdowns.find(bd => bd.id === payment.id);

        await apiOperations.deleteMortgagePayment(payment.id);

        if (mortgage && breakdown) {
            setMortgages(mortgages.map(m => m.id === mortgage.id ? { ...m, current_principal: m.current_principal + breakdown.principal } : m));
        }
        setMortgagePayments(mortgagePayments.filter(p => p.id !== payment.id));
        setMortgagePaymentBreakdowns(mortgagePaymentBreakdowns.filter(bd => bd.id !== payment.id));
      } catch (error) {
        console.error('Failed to delete mortgage payment:', error);
      }
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

  const handleSaveRecurringBill = async (recurringBill: RecurringBill) => {
    try {
      if (editingRecurringBill) {
          const updatedRB = await apiOperations.updateRecurringBill(recurringBill);
          setRecurringBills(recurringBills.map(rb => rb.id === recurringBill.id ? updatedRB : rb));
      } else {
          const createdRB = await apiOperations.createRecurringBill(recurringBill);
          setRecurringBills([...recurringBills, createdRB]);
      }
      closeRecurringBillModal();
    } catch (error) {
      console.error('Failed to save recurring bill:', error);
    }
  };

  const handleDeleteRecurringBill = async (recurringBillId: string) => {
    try {
      await apiOperations.deleteRecurringBill(recurringBillId);
      setRecurringBills(recurringBills.filter(rb => rb.id !== recurringBillId));
      setBills(bills.filter(b => b.recurringBillId !== recurringBillId));
    } catch (error) {
      console.error('Failed to delete recurring bill:', error);
    }
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
        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
            <LoadingSpinner size="lg" />
            <p className="text-lg text-gray-600 dark:text-gray-400">Loading your budget data...</p>
          </div>
        )}

        {/* Non-blocking Warnings */}
        {!isLoading && warnings.length > 0 && (
          <WarningBanner warnings={warnings} />
        )}

        {/* Main Content - Always show when not loading */}
        {!isLoading && (
          <ErrorBoundary>
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
                    onSaveFinanced={handleSaveFinancedExpense}
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
                financedExpenses={financedExpenses}
                onUpdateFinancedExpense={handleUpdateFinancedExpense}
                onDeleteFinancedExpense={handleDeleteFinancedExpense}
                isManagerModeUnlocked={isManagerModeUnlocked}
            />
          )}
          </ErrorBoundary>
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
