import React from 'react';
import { Bill, Person, Payment } from '../types';
import { BillItem } from './BillItem';

interface BillListProps {
  bills: Bill[];
  people: Person[];
  payments: Payment[];
  onEdit: (bill: Bill) => void;
  onDelete: (billId: string) => void;
  onAddPayment: (bill: Bill) => void;
  onEditPayment: (bill: Bill, payment: Payment) => void;
  onDeletePayment: (paymentId: string) => void;
}

export const BillList: React.FC<BillListProps> = ({ bills, people, payments, onEdit, onDelete, onAddPayment, onEditPayment, onDeletePayment }) => {
  if (bills.length === 0) {
    return (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
            <p className="text-slate-500 dark:text-slate-400">No bills added yet.</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">Click "Add Bill" to get started!</p>
        </div>
    );
  }
  return (
    <div className="space-y-4">
      {bills.map(bill => (
        <BillItem 
            key={bill.id} 
            bill={bill} 
            people={people} 
            payments={payments.filter(p => p.billId === bill.id)}
            onEdit={onEdit} 
            onDelete={onDelete} 
            onAddPayment={onAddPayment}
            onEditPayment={onEditPayment}
            onDeletePayment={onDeletePayment}
        />
      ))}
    </div>
  );
};
