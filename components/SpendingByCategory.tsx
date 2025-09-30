import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface CategoryData {
  categoryId: string;
  categoryName: string;
  totalCents: number;
}

interface SpendingByCategoryProps {
  data: CategoryData[];
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};

// Color palette for categories
const COLORS = [
  '#10B981', // Green
  '#F59E0B', // Amber
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#6B7280', // Gray
];

export const SpendingByCategory: React.FC<SpendingByCategoryProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4">Spending by Category</h3>
        <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          No spending data available for this period
        </div>
      </div>
    );
  }

  // Aggregate data by category
  const aggregated = data.reduce((acc, item) => {
    const existing = acc.find(a => a.categoryId === item.categoryId);
    if (existing) {
      existing.totalCents += item.totalCents;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, [] as CategoryData[]);

  // Sort by total descending
  aggregated.sort((a, b) => b.totalCents - a.totalCents);

  // Prepare chart data
  const chartData = aggregated.map(item => ({
    name: item.categoryName,
    value: item.totalCents / 100, // Convert to dollars for display
    cents: item.totalCents,
  }));

  const totalSpending = aggregated.reduce((sum, item) => sum + item.totalCents, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-700 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600">
          <p className="font-semibold text-slate-800 dark:text-slate-200">{payload[0].name}</p>
          <p className="text-slate-600 dark:text-slate-400">{formatCurrency(payload[0].payload.cents)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            {((payload[0].payload.cents / totalSpending) * 100).toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4">Spending by Category</h3>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex justify-between items-center font-bold text-slate-800 dark:text-slate-200 border-t pt-2">
          <span>Total Spending</span>
          <span>{formatCurrency(totalSpending)}</span>
        </div>
      </div>
    </div>
  );
};