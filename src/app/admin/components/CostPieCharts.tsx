'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { PieLabelRenderProps } from 'recharts/types/polar/Pie';
import type { TooltipProps } from 'recharts';
import { CostSummary, CountryBreakdown } from '../../types';
import { formatCurrency } from '../../lib/costUtils';
import AriaSelect from './AriaSelect';

interface CostPieChartsProps {
  costSummary: CostSummary;
  currency: string;
}

interface ChartData {
  name: string;
  value: number;
  country?: string;
  category?: string;
  chartTotal?: number;
}

// High-contrast palettes tuned for light and dark themes
const LIGHT_MODE_COLORS = [
  '#1d4ed8', '#f97316', '#10b981', '#ef4444', '#6366f1',
  '#14b8a6', '#facc15', '#a855f7', '#22d3ee', '#84cc16',
  '#db2777', '#0ea5e9', '#f59e0b', '#15803d', '#c026d3'
];

const DARK_MODE_COLORS = [
  '#60a5fa', '#fb7185', '#4ade80', '#facc15', '#c4b5fd',
  '#22d3ee', '#fbbf24', '#f472b6', '#93c5fd', '#a3e635',
  '#fda4af', '#38bdf8', '#fde68a', '#34d399', '#ddd6fe'
];

const useAccessiblePieStyles = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const evaluateTheme = () => {
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
      const classDark = document.documentElement.classList.contains('dark');
      setIsDarkMode(prefersDark || classDark);
    };

    evaluateTheme();

    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    const handleMediaChange = () => evaluateTheme();

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handleMediaChange);
      } else if (typeof mediaQuery.addListener === 'function') {
        mediaQuery.addListener(handleMediaChange);
      }
    }

    const observer = new MutationObserver(evaluateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      if (mediaQuery) {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', handleMediaChange);
        } else if (typeof mediaQuery.removeListener === 'function') {
          mediaQuery.removeListener(handleMediaChange);
        }
      }
      observer.disconnect();
    };
  }, []);

  return {
    colors: isDarkMode ? DARK_MODE_COLORS : LIGHT_MODE_COLORS,
    labelColor: isDarkMode ? '#e5e7eb' : '#1f2937',
    sliceBorderColor: isDarkMode ? '#0f172a' : '#ffffff',
    tooltipContainerClass: isDarkMode
      ? 'bg-slate-900 border border-slate-700 text-slate-100'
      : 'bg-white border border-slate-200 text-slate-900',
    tooltipValueClass: isDarkMode ? 'text-sky-300' : 'text-blue-600',
    tooltipMutedClass: isDarkMode ? 'text-slate-400' : 'text-gray-500'
  };
};

const CostPieCharts: React.FC<CostPieChartsProps> = ({ costSummary, currency }) => {
  const [countryBasis, setCountryBasis] = useState<'total' | 'daily'>('total');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const {
    colors,
    labelColor,
    sliceBorderColor,
    tooltipContainerClass,
    tooltipValueClass,
    tooltipMutedClass
  } = useAccessiblePieStyles();

  const countryData = useMemo<ChartData[]>(() => {
    const baseData = costSummary.countryBreakdown
      .filter(country => country.spentAmount > 0)
      .map(country => {
        let value = country.spentAmount;

        if (countryBasis === 'daily' && country.days > 0) {
          value = country.spentAmount / country.days;
        }

        return {
          name: country.country,
          value,
          country: country.country
        };
      });

    const data = [...baseData];
    const generalExpenses = costSummary.countryBreakdown.find(c => c.country === 'General');

    if (generalExpenses && generalExpenses.spentAmount > 0) {
      let generalValue = generalExpenses.spentAmount;

      if (countryBasis === 'daily') {
        const totalDays = costSummary.totalDays || 1;
        generalValue = generalExpenses.spentAmount / totalDays;
      }

      const existingGeneralIndex = data.findIndex(d => d.name === 'General');
      if (existingGeneralIndex >= 0) {
        data[existingGeneralIndex] = {
          ...data[existingGeneralIndex],
          value: generalValue
        };
      } else {
        data.push({
          name: 'General',
          value: generalValue,
          country: 'General'
        });
      }
    }

    return data;
  }, [costSummary, countryBasis]);

  const categoryData = useMemo<ChartData[]>(() => {
    let targetCountries: CountryBreakdown[] = costSummary.countryBreakdown;

    if (categoryFilter !== 'all') {
      targetCountries = costSummary.countryBreakdown.filter(c => c.country === categoryFilter);
    }

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
        category
      }))
      .sort((a, b) => b.value - a.value);
  }, [costSummary, categoryFilter]);

  const countryTotal = useMemo(
    () => countryData.reduce((sum, d) => sum + d.value, 0),
    [countryData]
  );
  const categoryTotal = useMemo(
    () => categoryData.reduce((sum, d) => sum + d.value, 0),
    [categoryData]
  );
  const countryChartData = useMemo(
    () => countryData.map(dataPoint => ({ ...dataPoint, chartTotal: countryTotal })),
    [countryData, countryTotal]
  );
  const categoryChartData = useMemo(
    () => categoryData.map(dataPoint => ({ ...dataPoint, chartTotal: categoryTotal })),
    [categoryData, categoryTotal]
  );
  const pieChartMargin = { top: 24, right: 16, bottom: 16, left: 16 };
  const renderSliceLabel = useCallback((props: PieLabelRenderProps | undefined) => {
    if (!props) {
      return null;
    }
    const { x, y, cx, name, percent } = props;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof cx !== 'number') {
      return null;
    }
    if (!name) {
      return null;
    }
    const percentValue = Math.round((percent ?? 0) * 1000) / 10;
    if (percentValue < 4) {
      // Skip rendering extremely small slices to avoid clutter
      return null;
    }

    return (
      <text
        x={x}
        y={y}
        fill={labelColor}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={500}
      >
        {`${name} (${percentValue.toFixed(1)}%)`}
      </text>
    );
  }, [labelColor]);

  type TooltipEntry = {
    name: string;
    value: number;
    payload: ChartData;
    percent?: number;
  };

  type CustomTooltipProps = TooltipProps<number, string> & {
    payload?: TooltipEntry[];
  };

  // Custom tooltip for better formatting
  const renderTooltipContent = useCallback(
    ({ active, payload }: CustomTooltipProps) => {
      if (!active || !payload || payload.length === 0) {
        return null;
      }

      const data = payload[0];
      const chartTotal = data?.payload?.chartTotal ?? 0;
      const percentValue =
        chartTotal > 0
          ? Math.round((data.value / chartTotal) * 1000) / 10
          : null;

      return (
        <div className={`${tooltipContainerClass} p-3 rounded-sm shadow-lg`}>
          <p className="font-medium">{data.name}</p>
          <p className={`mt-1 font-semibold ${tooltipValueClass}`}>
            {countryBasis === 'daily' && data.payload.country ? 
              `${formatCurrency(data.value, currency)} per day` :
              formatCurrency(data.value, currency)
            }
          </p>
          {percentValue !== null && (
            <p className={`${tooltipMutedClass} text-sm`}>{percentValue.toFixed(1)}% of chart</p>
          )}
          {data.payload.country && countryBasis === 'total' && (
            <p className={`${tooltipMutedClass} text-sm`}>Total spent</p>
          )}
        </div>
      );
    },
    [countryBasis, currency, tooltipContainerClass, tooltipMutedClass, tooltipValueClass]
  );

  // Get list of countries for filter dropdown
  const countries = useMemo(
    () => [
      'all',
      ...costSummary.countryBreakdown
        .filter(c => c.spentAmount > 0)
        .map(c => c.country)
    ],
    [costSummary]
  );

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100" data-testid="cost-pie-charts">
      <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-4">Spending Analysis</h4>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Country Spending Chart */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h5 className="font-medium text-gray-800 dark:text-gray-100">Spending by Country</h5>
            <AriaSelect
              id="country-basis-select"
              value={countryBasis}
              onChange={(value) => setCountryBasis(value as 'total' | 'daily')}
              className="px-3 py-1 text-sm"
              options={[
                { value: 'total', label: 'Total Amount' },
                { value: 'daily', label: 'Daily Average' }
              ]}
              placeholder="Select Basis"
            />
          </div>
          
          {countryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart margin={pieChartMargin}>
                <Pie
                  data={countryChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(props) => renderSliceLabel(props as PieLabelRenderProps)}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {countryChartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colors[index % colors.length]}
                      stroke={sliceBorderColor}
                      strokeWidth={1.5}
                    />
                  ))}
                </Pie>
                <Tooltip content={renderTooltipContent} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
              No spending data available
            </div>
          )}
          
          <div className="mt-4 text-xs text-gray-600 dark:text-gray-300">
            {countryBasis === 'daily' ? 
              'General expenses are averaged over total trip duration' :
              'Shows total spending per country'
            }
          </div>
        </div>

        {/* Category Spending Chart */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h5 className="font-medium text-gray-800 dark:text-gray-100">Spending by Category</h5>
            <AriaSelect
              id="category-filter-select"
              value={categoryFilter}
              onChange={(value) => setCategoryFilter(value)}
              className="px-3 py-1 text-sm"
              options={[
                { value: 'all', label: 'All Countries' },
                ...countries.slice(1).map(country => ({ value: country, label: country }))
              ]}
              placeholder="Select Country"
            />
          </div>
          
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart margin={pieChartMargin}>
                <Pie
                  data={categoryChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(props) => renderSliceLabel(props as PieLabelRenderProps)}
                  outerRadius={80}
                  fill="#82ca9d"
                  dataKey="value"
                >
                  {categoryChartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={colors[index % colors.length]}
                      stroke={sliceBorderColor}
                      strokeWidth={1.5}
                    />
                  ))}
                </Pie>
                <Tooltip content={renderTooltipContent} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
              No category data available
            </div>
          )}
          
          <div className="mt-4 text-xs text-gray-600 dark:text-gray-300">
            {categoryFilter === 'all' ? 
              'Shows category breakdown across all countries' :
              `Shows category breakdown for ${categoryFilter}`
            }
          </div>
        </div>
      </div>
      
      {/* Summary Statistics */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
        <h5 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Chart Summary</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-300">Countries with spending:</span>
            <span className="font-medium ml-2">{countryData.length}</span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-300">Expense categories:</span>
            <span className="font-medium ml-2">{categoryData.length}</span>
          </div>
          {countryBasis === 'total' && (
            <div>
              <span className="text-gray-600 dark:text-gray-300">Total visualized:</span>
              <span className="font-medium ml-2">
                {formatCurrency(countryData.reduce((sum, d) => sum + d.value, 0), currency)}
              </span>
            </div>
          )}
          {categoryFilter !== 'all' && (
            <div>
              <span className="text-gray-600 dark:text-gray-300">Filtered total:</span>
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
