import React, { useState } from 'react';
import { Mortgage, Person, MortgagePayment } from '../types';
import { HomeIcon } from './Icons';
import { MortgageList } from './MortgageList';
import { MortgageModal } from './MortgageModal';
import { MortgagePaymentModal } from './MortgagePaymentModal';

interface MortgageManagerProps {
  mortgages: Mortgage[];
  people: Person[];
  payments: MortgagePayment[];
  onSaveMortgage: (mortgage: Mortgage) => void;
  onDeleteMortgage: (mortgageId: string) => void;
  onSavePayment: (payment: MortgagePayment) => void;
  onDeletePayment: (payment: MortgagePayment) => void;
}

export const MortgageManager: React.FC<MortgageManagerProps> = ({
  mortgages,
  people,
  payments,
  onSaveMortgage,
  onDeleteMortgage,
  onSavePayment,
  onDeletePayment,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMortgage, setEditingMortgage] = useState<Mortgage | null>(null);
  
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentContext, setPaymentContext] = useState<{ mortgage: Mortgage, payment: MortgagePayment | null } | null>(null);

  const openModal = (mortgage: Mortgage | null = null) => {
    setEditingMortgage(mortgage);
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setEditingMortgage(null);
    setIsModalOpen(false);
  };

  const openPaymentModal = (mortgage: Mortgage, payment: MortgagePayment | null = null) => {
    setPaymentContext({ mortgage, payment });
    setIsPaymentModalOpen(true);
  };
  const closePaymentModal = () => {
    setPaymentContext(null);
    setIsPaymentModalOpen(false);
  };
  
  const handleSavePayment = (payment: MortgagePayment) => {
    onSavePayment(payment);
    closePaymentModal();
  };
  
  const handleSaveMortgage = (mortgage: Mortgage) => {
    onSaveMortgage(mortgage);
    closeModal();
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">Mortgages</h2>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg font-semibold hover:bg-cyan-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 dark:focus:ring-offset-slate-800"
        >
          <HomeIcon className="w-5 h-5" />
          {mortgages.length > 0 ? 'Edit Mortgage' : 'Add Mortgage'}
        </button>
      </div>
      <MortgageList 
        mortgages={mortgages} 
        people={people} 
        payments={payments}
        onEdit={openModal} 
        onDelete={onDeleteMortgage}
        onAddPayment={openPaymentModal}
        onEditPayment={openPaymentModal}
        onDeletePayment={onDeletePayment}
      />
      {isModalOpen && (
        <MortgageModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={handleSaveMortgage}
          people={people}
          existingMortgage={editingMortgage}
        />
      )}
      {isPaymentModalOpen && paymentContext && (
        <MortgagePaymentModal
            isOpen={isPaymentModalOpen}
            onClose={closePaymentModal}
            onSave={handleSavePayment}
            people={people}
            mortgage={paymentContext.mortgage}
            existingPayment={paymentContext.payment}
            paymentsForMortgage={payments.filter(p => p.mortgageId === paymentContext.mortgage.id)}
        />
      )}
    </div>
  );
};