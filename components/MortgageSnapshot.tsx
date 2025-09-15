import React from 'react';
import { MortgageStats } from '../types';

interface MortgageSnapshotProps {
  stats: MortgageStats;
}

const formatCurrency = (amount: number, compact = false) => {
  return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 1 : 2,
  }).format(amount);
};

const formatDate = (date: Date | null, monthYearOnly = false) => {
    if (!date) return 'N/A';
    const options: Intl.DateTimeFormatOptions = monthYearOnly 
        ? { month: 'short', year: 'numeric' }
        : { month: 'short', day: 'numeric' };
    return date.toLocaleDateString(undefined, options);
};

export const MortgageSnapshot: React.FC<MortgageSnapshotProps> = ({ stats }) => {
  const { mortgage, progress, projections, contributions } = stats;

  return (
    <section className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-1">Home Loan Snapshot</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{mortgage.name}</p>

      {/* Progress Bar and Header */}
      <div className="mb-6">
        <div className="flex justify-between items-baseline mb-1">
            <span className="text-lg font-bold text-slate-700 dark:text-slate-300">
                Remaining: <span className="text-cyan-600 dark:text-cyan-400">{formatCurrency(mortgage.current_principal)}</span>
            </span>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Paid: {progress.percent_principal_paid.toFixed(2)}%
            </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-4 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-emerald-400 to-teal-500 h-4 rounded-full"
            style={{ width: `${progress.percent_principal_paid}%` }}
          />
        </div>
      </div>

      {/* Stats Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* YTD & Projections */}
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Year-to-Date</h3>
                <div className="flex flex-wrap gap-2">
                    <StatChip label="Principal" value={formatCurrency(progress.ytd_principal, true)} color="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" />
                    <StatChip label="Interest" value={formatCurrency(progress.ytd_interest, true)} color="bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" />
                    <StatChip label="Escrow" value={formatCurrency(progress.ytd_escrow, true)} color="bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300" />
                </div>
            </div>
             <div>
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Projections</h3>
                <div className="flex flex-wrap gap-2">
                    <StatChip label="Payoff" value={formatDate(projections.payoff_date_baseline, true)} color="bg-slate-100 text-slate-800 dark:bg-slate-600 dark:text-slate-200" />
                    {progress.last_3mo_avg_extra_principal > 1 && (
                        <StatChip label="With Extra" value={formatDate(projections.payoff_date_with_extra, true)} color="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300" />
                    )}
                </div>
                {projections.insufficient_payment && <p className="text-xs text-red-500 mt-2">Warning: Scheduled payment may not be enough to cover interest.</p>}
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <StatChip label="Rate" value={`${mortgage.interest_rate_apy.toFixed(3)}%`} color="bg-slate-100 dark:bg-slate-700 text-xs" />
                <StatChip label="Term" value={`${mortgage.term_months} mo`} color="bg-slate-100 dark:bg-slate-700 text-xs" />
                <StatChip label="Next Due" value={formatDate(mortgage.next_due_date)} color="bg-slate-100 dark:bg-slate-700 text-xs" />
            </div>
        </div>

        {/* Contributions */}
        <div>
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Who Paid What (YTD)</h3>
            <div className="space-y-2">
                {contributions.per_member_ytd.length > 0 && contributions.per_member_ytd.some(c => c.total > 0) ? (
                    contributions.per_member_ytd.slice(0, 3).map((contrib, index) => (
                        <div key={contrib.personId} className="flex items-center justify-between text-sm p-2 bg-slate-50 dark:bg-slate-700/50 rounded-md">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{index + 1}. {contrib.name}</span>
                            <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(contrib.total)}</span>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">No payments recorded yet this year.</p>
                )}
            </div>
        </div>
      </div>
    </section>
  );
};

const StatChip: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <div className={`flex items-baseline gap-1.5 px-2.5 py-1 rounded-full ${color}`}>
        <span className="text-xs font-semibold uppercase">{label}</span>
        <span className="font-bold">{value}</span>
    </div>
);
