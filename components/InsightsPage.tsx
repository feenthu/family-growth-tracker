import React, { useState, useEffect } from 'react';
import { SpendingByCategory } from './SpendingByCategory';
import { SpendingByMember } from './SpendingByMember';
import { SpendingTrends } from './SpendingTrends';
import { TimeRangeSelector, TimeRange } from './TimeRangeSelector';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';

interface CategoryData {
  categoryId: string;
  categoryName: string;
  totalCents: number;
}

interface MemberSpendingData {
  memberId: string;
  memberName: string;
  categoryId: string;
  categoryName: string;
  totalCents: number;
}

interface TrendData {
  period: string;
  date: string;
  totalCents: number;
}

interface PaymentStatusData {
  paidCount: number;
  overdueCount: number;
  upcomingCount: number;
  totalAmountCents: number;
  totalPaidCents: number;
}

interface MortgageVsExpensesData {
  mortgageCents: number;
  otherExpensesCents: number;
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};

const API_BASE = (import.meta as any).env?.PROD
  ? 'https://family-growth-tracker-production.up.railway.app'
  : 'http://localhost:8080';

export const InsightsPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('current-month');
  const [spendingSummary, setSpendingSummary] = useState<MemberSpendingData[]>([]);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusData | null>(null);
  const [mortgageVsExpenses, setMortgageVsExpenses] = useState<MortgageVsExpensesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch all analytics data in parallel
        const [summaryRes, trendsRes, statusRes, comparisonRes] = await Promise.all([
          fetch(`${API_BASE}/api/analytics/spending-summary?timeRange=${timeRange}`),
          fetch(`${API_BASE}/api/analytics/spending-trends?timeRange=${timeRange}`),
          fetch(`${API_BASE}/api/analytics/payment-status?timeRange=${timeRange}`),
          fetch(`${API_BASE}/api/analytics/mortgage-vs-expenses?timeRange=${timeRange}`),
        ]);

        if (!summaryRes.ok || !trendsRes.ok || !statusRes.ok || !comparisonRes.ok) {
          throw new Error('Failed to fetch analytics data');
        }

        const [summaryData, trendsData, statusData, comparisonData] = await Promise.all([
          summaryRes.json(),
          trendsRes.json(),
          statusRes.json(),
          comparisonRes.json(),
        ]);

        setSpendingSummary(summaryData);
        setTrends(trendsData);
        setPaymentStatus(statusData);
        setMortgageVsExpenses(comparisonData);
      } catch (err) {
        console.error('Error fetching analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [timeRange]);

  // Aggregate data for category pie chart
  const categoryData: CategoryData[] = spendingSummary.reduce((acc, item) => {
    const existing = acc.find(a => a.categoryId === item.categoryId);
    if (existing) {
      existing.totalCents += item.totalCents;
    } else {
      acc.push({
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        totalCents: item.totalCents,
      });
    }
    return acc;
  }, [] as CategoryData[]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <LoadingSpinner size="lg" />
        <p className="text-lg text-gray-600 dark:text-gray-400">Loading spending insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <ErrorMessage message={error} />
      </div>
    );
  }

  const totalSpending = categoryData.reduce((sum, cat) => sum + cat.totalCents, 0);

  return (
    <div className="space-y-6">
      {/* Header with Time Range Selector */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold text-slate-700 dark:text-slate-300 mb-4">Spending Insights</h2>
        <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase">Total Spending</p>
          <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">
            {formatCurrency(totalSpending)}
          </p>
        </div>

        {paymentStatus && (
          <>
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase">Payment Status</p>
              <div className="mt-2 space-y-1">
                <p className="text-sm">
                  <span className="font-semibold text-green-600">{paymentStatus.paidCount}</span> Paid
                </p>
                <p className="text-sm">
                  <span className="font-semibold text-red-600">{paymentStatus.overdueCount}</span> Overdue
                </p>
                <p className="text-sm">
                  <span className="font-semibold text-blue-600">{paymentStatus.upcomingCount}</span> Upcoming
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase">Payment Progress</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-2">
                {paymentStatus.totalAmountCents > 0
                  ? Math.round((paymentStatus.totalPaidCents / paymentStatus.totalAmountCents) * 100)
                  : 0}%
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {formatCurrency(paymentStatus.totalPaidCents)} of {formatCurrency(paymentStatus.totalAmountCents)}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Mortgage vs Other Expenses */}
      {mortgageVsExpenses && (mortgageVsExpenses.mortgageCents > 0 || mortgageVsExpenses.otherExpensesCents > 0) && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4">Housing vs Other Expenses</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-400 uppercase">Mortgage/Housing</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-500 mt-2">
                {formatCurrency(mortgageVsExpenses.mortgageCents)}
              </p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400 uppercase">Other Expenses</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-500 mt-2">
                {formatCurrency(mortgageVsExpenses.otherExpensesCents)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SpendingByCategory data={categoryData} />
        <SpendingByMember data={spendingSummary} />
      </div>

      <SpendingTrends data={trends} timeRange={timeRange} />
    </div>
  );
};