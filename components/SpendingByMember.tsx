import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MemberSpendingData {
  memberId: string;
  memberName: string;
  categoryId: string;
  categoryName: string;
  totalCents: number;
}

interface SpendingByMemberProps {
  data: MemberSpendingData[];
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
};

// Color palette matching categories
const CATEGORY_COLORS: Record<string, string> = {
  'Uncategorized': '#6B7280',
  'Groceries': '#10B981',
  'Utilities': '#F59E0B',
  'Transportation': '#3B82F6',
  'Healthcare': '#EF4444',
  'Entertainment': '#8B5CF6',
  'Dining Out': '#EC4899',
  'Shopping': '#14B8A6',
  'Housing': '#F97316',
};

export const SpendingByMember: React.FC<SpendingByMemberProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
        <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4">Spending by Member</h3>
        <div className="flex items-center justify-center h-64 text-slate-500 dark:text-slate-400">
          No spending data available for this period
        </div>
      </div>
    );
  }

  // Group data by member
  const memberMap = new Map<string, { memberName: string; categories: Map<string, number>; total: number }>();

  data.forEach(item => {
    if (!memberMap.has(item.memberId)) {
      memberMap.set(item.memberId, {
        memberName: item.memberName,
        categories: new Map(),
        total: 0,
      });
    }

    const member = memberMap.get(item.memberId)!;
    const currentAmount = member.categories.get(item.categoryName) || 0;
    member.categories.set(item.categoryName, currentAmount + item.totalCents);
    member.total += item.totalCents;
  });

  // Get all unique categories across all members
  const allCategories = new Set<string>();
  memberMap.forEach(member => {
    member.categories.forEach((_, categoryName) => {
      allCategories.add(categoryName);
    });
  });

  // Prepare chart data
  const chartData = Array.from(memberMap.entries()).map(([memberId, memberData]) => {
    const entry: any = {
      name: memberData.memberName,
      total: memberData.total / 100,
    };

    allCategories.forEach(categoryName => {
      entry[categoryName] = (memberData.categories.get(categoryName) || 0) / 100;
    });

    return entry;
  });

  // Sort by total spending
  chartData.sort((a, b) => b.total - a.total);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-700 p-3 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600">
          <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-400">{entry.name}:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {formatCurrency(entry.value * 100)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
      <h3 className="text-lg font-bold text-slate-700 dark:text-slate-300 mb-4">Spending by Member</h3>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              style={{ fontSize: '14px' }}
            />
            <YAxis
              stroke="#64748b"
              style={{ fontSize: '14px' }}
              tickFormatter={(value) => `$${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {Array.from(allCategories).map((categoryName, index) => (
              <Bar
                key={categoryName}
                dataKey={categoryName}
                stackId="a"
                fill={CATEGORY_COLORS[categoryName] || `hsl(${index * 40}, 70%, 50%)`}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {chartData.map((member, index) => (
          <div key={index} className="flex justify-between items-center p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{member.name}</span>
            <span className="font-bold text-slate-800 dark:text-slate-100">{formatCurrency(member.total * 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};