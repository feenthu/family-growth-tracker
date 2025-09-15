
import React, { useState } from 'react';
import { Person } from '../types';
import { UserPlusIcon, TrashIcon } from './Icons';
import { Avatar } from './Avatar';

interface PeopleManagerProps {
  people: Person[];
  onAddPerson: (name: string) => void;
  onDeletePerson: (personId: string) => void;
}

export const PeopleManager: React.FC<PeopleManagerProps> = ({ people, onAddPerson, onDeletePerson }) => {
  const [newName, setNewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onAddPerson(newName.trim());
      setNewName('');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg space-y-6">
      <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">Household</h2>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New person's name"
          className="flex-grow block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
        <button type="submit" className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-800 disabled:opacity-50" disabled={!newName.trim()}>
          <UserPlusIcon className="w-5 h-5" />
        </button>
      </form>
      <div className="space-y-3">
        {people.map(person => (
          <div key={person.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 p-3 rounded-md">
            <div className="flex items-center gap-3">
                <Avatar person={person} />
                <span className="font-semibold text-slate-800 dark:text-slate-100">{person.name}</span>
            </div>
            <button onClick={() => onDeletePerson(person.id)} className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
