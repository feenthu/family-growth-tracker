import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface TrendData {
  period: string;
  date: string;
  totalCents: number;
}

interface SpendingTrendsProps {
  data: TrendData[];
  timeRange: 'current-month' | '3-months' | '6-months' | 'ytd';
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};

const formatDate = (dateStr: string, timeRange: string) => {
  const date = new Date(dateStr);

  switch (timeRange) {
    case 'current-month':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case '3-months':
    case '6-months':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'ytd':
      return date.toLocaleDateString('en-US', { month: 'short' });
    default:
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
};

export const SpendingTrends: React.FC<SpendingTrendsProps> = ({ data, timeRange }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4">Spending Trends</h3>
        <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          No trend data available for this period
        </div>
      </div>
    );
  }

  // Sort data by date
  const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Prepare chart data
  const chartData = sortedData.map(item => ({
    date: formatDate(item.date, timeRange),
    fullDate: item.date,
    amount: item.totalCents / 100,
    cents: item.totalCents,
  }));

  // Calculate statistics
  const totalSpending = sortedData.reduce((sum, item) => sum + item.totalCents, 0);
  const avgSpending = totalSpending / sortedData.length;
  const maxSpending = Math.max(...sortedData.map(item => item.totalCents));
  const minSpending = Math.min(...sortedData.map(item => item.totalCents));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-700 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600">
          <p className="font-semibold text-slate-800 dark:text-slate-200">{payload[0].payload.date}</p>
          <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
            {formatCurrency(payload[0].payload.cents)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4">Spending Trends</h3>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              stroke="#64748b"
              style={{ fontSize: '12px' }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              stroke="#64748b"
              style={{ fontSize: '14px' }}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ fill: '#6366f1', r: 4 }}
              activeDot={{ r: 6 }}
              name="Spending"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-lg">
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Total</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatCurrency(totalSpending)}</p>
        </div>
        <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-lg">
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Average</p>
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{formatCurrency(avgSpending)}</p>
        </div>
        <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-lg">
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Highest</p>
          <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(maxSpending)}</p>
        </div>
        <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-lg">
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase">Lowest</p>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(minSpending)}</p>
        </div>
      </div>
    </div>
  );
};