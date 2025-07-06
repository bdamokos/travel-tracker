'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CostSummary, CountryBreakdown } from '../../types';
import { formatCurrency } from '../../lib/costUtils';

interface CostPieChartsProps {
  costSummary: CostSummary;
  currency: string;
}

interface ChartData {
  name: string;
  value: number;
  country?: string;
  category?: string;
}

// Color palette for charts
const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1',
  '#d084d0', '#87ceeb', '#dda0dd', '#98fb98', '#f0e68c',
  '#ffa07a', '#20b2aa', '#b0c4de', '#ffb6c1', '#daa520'
];

const CostPieCharts: React.FC<CostPieChartsProps> = ({ costSummary, currency }) => {
  const [countryBasis, setCountryBasis] = useState<'total' | 'daily'>('total');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Prepare country data
  const countryData: ChartData[] = costSummary.countryBreakdown
    .filter(country => country.spentAmount > 0)
    .map(country => {
      let value = country.spentAmount;
      
      // For daily basis, calculate per day spending
      if (countryBasis === 'daily' && country.days > 0) {
        value = country.spentAmount / country.days;
      }
      
      return {
        name: country.country,
        value: value,
        country: country.country
      };
    });

  // Add general expenses (expenses not tied to specific countries)
  const generalExpenses = costSummary.countryBreakdown.find(c => c.country === 'General');
  if (generalExpenses && generalExpenses.spentAmount > 0) {
    let generalValue = generalExpenses.spentAmount;
    
    if (countryBasis === 'daily') {
      // For general expenses, average over total trip duration
      const totalDays = costSummary.totalDays || 1;
      generalValue = generalExpenses.spentAmount / totalDays;
    }
    
    // Update existing general entry or add it
    const existingGeneralIndex = countryData.findIndex(d => d.name === 'General');
    if (existingGeneralIndex >= 0) {
      countryData[existingGeneralIndex].value = generalValue;
    } else {
      countryData.push({
        name: 'General',
        value: generalValue,
        country: 'General'
      });
    }
  }

  // Prepare category data
  const getCategoryData = (): ChartData[] => {
    let targetCountries: CountryBreakdown[] = costSummary.countryBreakdown;
    
    // Filter by country if specific country is selected
    if (categoryFilter !== 'all') {
      targetCountries = costSummary.countryBreakdown.filter(c => c.country === categoryFilter);
    }
    
    // Aggregate categories across selected countries
    const categoryMap = new Map<string, number>();
    
    targetCountries.forEach(country => {
      country.categoryBreakdown.forEach(cat => {
        const existing = categoryMap.get(cat.category) || 0;
        categoryMap.set(cat.category, existing + cat.amount);
      });
    });
    
    return Array.from(categoryMap.entries())
      .filter(([, amount]) => amount > 0)
      .map(([category, amount]) => ({
        name: category,
        value: amount,
        category: category
      }))
      .sort((a, b) => b.value - a.value); // Sort by value descending
  };

  const categoryData = getCategoryData();

  // Custom tooltip for better formatting
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[]; label?: string }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-white p-3 border border-gray-300 rounded shadow-lg">
          <p className="font-medium">{data.name}</p>
          <p className="text-blue-600">
            {countryBasis === 'daily' && data.payload.country ? 
              `${formatCurrency(data.value, currency)} per day` :
              formatCurrency(data.value, currency)
            }
          </p>
          {data.payload.country && countryBasis === 'total' && (
            <p className="text-gray-500 text-sm">Total spent</p>
          )}
        </div>
      );
    }
    return null;
  };

  // Get list of countries for filter dropdown
  const countries = ['all', ...costSummary.countryBreakdown
    .filter(c => c.spentAmount > 0)
    .map(c => c.country)];

  return (
    <div className="space-y-6">
      <h4 className="font-medium text-gray-700 mb-4">Spending Analysis</h4>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Country Spending Chart */}
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex justify-between items-center mb-4">
            <h5 className="font-medium text-gray-800">Spending by Country</h5>
            <select
              value={countryBasis}
              onChange={(e) => setCountryBasis(e.target.value as 'total' | 'daily')}
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="total">Total Amount</option>
              <option value="daily">Daily Average</option>
            </select>
          </div>
          
          {countryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={countryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(1)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {countryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No spending data available
            </div>
          )}
          
          <div className="mt-4 text-xs text-gray-600">
            {countryBasis === 'daily' ? 
              'General expenses are averaged over total trip duration' :
              'Shows total spending per country'
            }
          </div>
        </div>

        {/* Category Spending Chart */}
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex justify-between items-center mb-4">
            <h5 className="font-medium text-gray-800">Spending by Category</h5>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Countries</option>
              {countries.slice(1).map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
          </div>
          
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(1)}%)`}
                  outerRadius={80}
                  fill="#82ca9d"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No category data available
            </div>
          )}
          
          <div className="mt-4 text-xs text-gray-600">
            {categoryFilter === 'all' ? 
              'Shows category breakdown across all countries' :
              `Shows category breakdown for ${categoryFilter}`
            }
          </div>
        </div>
      </div>
      
      {/* Summary Statistics */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h5 className="font-medium text-gray-700 mb-2">Chart Summary</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Countries with spending:</span>
            <span className="font-medium ml-2">{countryData.length}</span>
          </div>
          <div>
            <span className="text-gray-600">Expense categories:</span>
            <span className="font-medium ml-2">{categoryData.length}</span>
          </div>
          {countryBasis === 'total' && (
            <div>
              <span className="text-gray-600">Total visualized:</span>
              <span className="font-medium ml-2">
                {formatCurrency(countryData.reduce((sum, d) => sum + d.value, 0), currency)}
              </span>
            </div>
          )}
          {categoryFilter !== 'all' && (
            <div>
              <span className="text-gray-600">Filtered total:</span>
              <span className="font-medium ml-2">
                {formatCurrency(categoryData.reduce((sum, d) => sum + d.value, 0), currency)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CostPieCharts;