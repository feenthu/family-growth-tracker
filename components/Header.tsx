
import React from 'react';
import { EyeIcon, LockClosedIcon } from './Icons';

interface HeaderProps {
    currentView: 'manage' | 'family';
    isManagerModeUnlocked: boolean;
    onViewChange: (view: 'manage' | 'family') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, isManagerModeUnlocked, onViewChange }) => {
  return (
    <header className="bg-white dark:bg-slate-800 shadow-md">
      <div className="container mx-auto px-4 md:px-8 py-4 flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-teal-400">
          Family Budget Tracker
        </h1>
        <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                {!isManagerModeUnlocked && <LockClosedIcon className="w-4 h-4 text-slate-500" />}
                Manage
            </span>
            <button
                onClick={() => onViewChange(currentView === 'manage' ? 'family' : 'manage')}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:ring-offset-slate-800 ${currentView === 'family' ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-slate-700'}`}
                aria-label="Toggle Family View"
            >
                <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${currentView === 'family' ? 'translate-x-5' : 'translate-x-0'}`}
                />
            </button>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <EyeIcon className="w-4 h-4" /> Family
            </span>
        </div>
      </div>
    </header>
  );
};
