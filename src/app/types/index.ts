// Blog post reference
export type BlogPost = {
  id: string;
  title: string;
  url: string;
};

// Location type for storing geographical coordinates and related information
export type Location = {
  id: string;
  name: string;
  coordinates: [number, number]; // [latitude, longitude]
  arrivalTime?: string;
  notes?: string;
  instagramPosts?: InstagramPost[];
  blogPosts?: BlogPost[];
};

// Transportation type for route segments
export interface Transportation {
  id: string;
  type: 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ferry' | 'other';
  from: string;
  to: string;
  departureTime?: string;
  arrivalTime?: string;
  distance?: number; // Distance in kilometers
  fromCoordinates?: [number, number]; // [latitude, longitude]
  toCoordinates?: [number, number]; // [latitude, longitude]
}

// Instagram post reference
export type InstagramPost = {
  id: string;
  url: string;
};

// Single travel period (could be a day, part of a day, or multiple days)
export type JourneyPeriod = {
  id: string;
  date: string;        // Primary date for the period
  endDate?: string;    // Optional end date if period spans multiple days
  title: string;
  locations: Location[];
  transportation?: Transportation;
  instagramPosts?: InstagramPost[];
  customNotes?: string;
};

// For backward compatibility
export type JourneyDay = JourneyPeriod;

// Complete journey data structure
export type Journey = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  days: JourneyPeriod[];  // Still called "days" for API compatibility, but contains periods
};



// Cost tracking types
export type CountryPeriod = {
  id: string;
  startDate: string;
  endDate: string;
  notes?: string;
};

export type BudgetItem = {
  id: string;
  country: string;
  amount?: number; // Optional amount for undefined budgets
  currency: string;
  notes?: string;
  periods?: CountryPeriod[];
};

export type Expense = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  category: string;
  country: string;
  description: string;
  notes?: string;
  isGeneralExpense?: boolean; // For expenses not tied to a specific country
};

export type CostTrackingData = {
  id: string;
  tripId: string; // Reference to the travel trip
  tripTitle: string;
  tripStartDate: string;
  tripEndDate: string;
  overallBudget: number;
  currency: string;
  countryBudgets: BudgetItem[];
  expenses: Expense[];
  customCategories?: string[]; // User-defined expense categories (optional for backwards compatibility)
  ynabImportData?: YnabImportData; // YNAB import configuration and history
  createdAt: string;
  updatedAt?: string;
};

export type CostSummary = {
  totalBudget: number;
  totalSpent: number;
  totalRefunds: number; // New field for total refunds
  remainingBudget: number;
  totalDays: number;
  remainingDays: number;
  averageSpentPerDay: number;
  suggestedDailyBudget: number;
  countryBreakdown: CountryBreakdown[];
  // New fields for smarter pre-trip expense handling
  preTripSpent: number;
  preTripRefunds: number; // New field for pre-trip refunds
  tripSpent: number;
  tripRefunds: number; // New field for trip refunds
  averageSpentPerTripDay: number;
  tripStatus: 'before' | 'during' | 'after';
};

export type CountryBreakdown = {
  country: string;
  budgetAmount: number;
  spentAmount: number;
  refundAmount: number; // New field for refunds in this country
  remainingAmount: number;
  days: number;
  averagePerDay: number;
  expenses: Expense[];
  categoryBreakdown: CategoryBreakdown[];
};

export type CategoryBreakdown = {
  category: string;
  amount: number;
  count: number;
};

// YNAB Import types
export type YnabTransaction = {
  Account: string;
  Flag: string;
  Date: string;
  Payee: string;
  'Category Group/Category': string;
  'Category Group': string;
  Category: string;
  Memo: string;
  Outflow: string;
  Inflow: string;
  Cleared: string;
};

export type YnabCategoryMapping = {
  ynabCategory: string;
  mappingType: 'country' | 'general' | 'none';
  countryName?: string; // if mappingType === 'country'
};

export type YnabImportData = {
  mappings: YnabCategoryMapping[];
  importedTransactionHashes: string[]; // to prevent duplicates
};

export type ProcessedYnabTransaction = {
  originalTransaction: YnabTransaction;
  amount: number;
  date: string;
  description: string;
  memo: string;
  mappedCountry: string; // empty string for general expenses
  isGeneralExpense: boolean;
  hash: string; // unique identifier to prevent duplicates
};