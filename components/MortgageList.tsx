import React from 'react';
import { Mortgage, Person, MortgagePayment } from '../types';
import { MortgageItem } from './MortgageItem';

interface MortgageListProps {
  mortgages: Mortgage[];
  people: Person[];
  payments: MortgagePayment[];
  onEdit: (mortgage: Mortgage) => void;
  onDelete: (mortgageId: string) => void;
  onAddPayment: (mortgage: Mortgage) => void;
  onEditPayment: (mortgage: Mortgage, payment: MortgagePayment) => void;
  onDeletePayment: (payment: MortgagePayment) => void;
}

export const MortgageList: React.FC<MortgageListProps> = ({ mortgages, people, payments, onEdit, onDelete, onAddPayment, onEditPayment, onDeletePayment }) => {
  if (mortgages.length === 0) {
    return (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
            <p className="text-slate-500 dark:text-slate-400">No mortgages added yet.</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">Click "Add Mortgage" to get started!</p>
        </div>
    );
  }
  return (
    <div className="space-y-4">
      {mortgages.map(mortgage => (
        <MortgageItem 
            key={mortgage.id} 
            mortgage={mortgage} 
            people={people} 
            payments={payments.filter(p => p.mortgageId === mortgage.id)}
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