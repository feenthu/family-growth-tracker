
import React, { useState } from 'react';
import { Bill, Person, Payment, FinancedExpense } from '../types';
import { BillList } from './BillList';
import { BillModal } from './BillModal';
import { PlusIcon } from './Icons';
import { PaymentModal } from './PaymentModal';

interface BillManagerProps {
  bills: Bill[];
  people: Person[];
  payments: Payment[];
  onAddBill: () => void;
  onEditBill: (bill: Bill) => void;
  onDeleteBill: (billId: string) => void;
  onSaveBill: (bill: Bill) => void;
  onSaveFinanced?: (expense: FinancedExpense) => void;
  onSavePayment: (payment: Payment) => void;
  onDeletePayment: (paymentId: string) => void;
  isModalOpen: boolean;
  closeModal: () => void;
  editingBill: Bill | null;
}

export const BillManager: React.FC<BillManagerProps> = ({
  bills,
  people,
  payments,
  onAddBill,
  onEditBill,
  onDeleteBill,
  onSaveBill,
  onSaveFinanced,
  onSavePayment,
  onDeletePayment,
  isModalOpen,
  closeModal,
  editingBill,
}) => {
  const sortedBills = [...bills].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentContext, setPaymentContext] = useState<{ bill: Bill, payment: Payment | null } | null>(null);

  const openPaymentModal = (bill: Bill, payment: Payment | null = null) => {
    setPaymentContext({ bill, payment });
    setIsPaymentModalOpen(true);
  };
  
  const closePaymentModal = () => {
    setPaymentContext(null);
    setIsPaymentModalOpen(false);
  };

  const handleSavePayment = (payment: Payment) => {
    onSavePayment(payment);
    closePaymentModal();
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">Bills & Expenses</h2>
        <button
          onClick={onAddBill}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-800"
        >
          <PlusIcon className="w-5 h-5" />
          Add Bill
        </button>
      </div>
      <BillList 
        bills={sortedBills} 
        people={people} 
        payments={payments}
        onEdit={onEditBill} 
        onDelete={onDeleteBill}
        onAddPayment={openPaymentModal}
        onEditPayment={openPaymentModal}
        onDeletePayment={onDeletePayment}
      />
      {isModalOpen && (
        <BillModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={onSaveBill}
          onSaveFinanced={onSaveFinanced}
          people={people}
          existingBill={editingBill}
        />
      )}
      {isPaymentModalOpen && paymentContext && (
          <PaymentModal
            isOpen={isPaymentModalOpen}
            onClose={closePaymentModal}
            onSave={handleSavePayment}
            people={people}
            bill={paymentContext.bill}
            existingPayment={paymentContext.payment}
            paymentsForBill={payments.filter(p => p.billId === paymentContext.bill.id)}
          />
      )}
    </div>
  );
};
