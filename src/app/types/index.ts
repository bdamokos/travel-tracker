// Blog post reference
export type BlogPost = {
  id: string;
  title: string;
  url: string;
  excerpt?: string;
};

// Cost tracking integration
export type CostTrackingLink = {
  expenseId: string;
  description?: string;
};

// Independent accommodation entity
export type Accommodation = {
  id: string;
  name: string;
  locationId: string; // Reference to the location
  accommodationData?: string; // YAML frontmatter or free text
  isAccommodationPublic?: boolean; // Default false (private)
  costTrackingLinks?: CostTrackingLink[];
  createdAt: string;
  updatedAt?: string;
};

// Location type for storing geographical coordinates and related information
export type Location = {
  id: string;
  name: string;
  coordinates: [number, number]; // [latitude, longitude]
  arrivalTime?: string;
  departureTime?: string; // When leaving this location
  date: Date; // Primary date (arrival date)
  endDate?: Date; // Optional end date for multi-day stays
  duration?: number; // Duration in days (calculated or manual)
  notes?: string;
  instagramPosts?: InstagramPost[];
  blogPosts?: BlogPost[];
  // References to accommodations (not embedded data)
  accommodationIds?: string[];
  // Backward compatibility - will be migrated to separate accommodations
  accommodationData?: string;
  isAccommodationPublic?: boolean;
  // Cost tracking integration (for location-level expenses)
  costTrackingLinks?: CostTrackingLink[];
};

// Transportation type for route segments
export interface Transportation {
  id: string;
  type: 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ferry' | 'boat' | 'metro' | 'other';
  from: string;
  to: string;
  departureTime?: string;
  arrivalTime?: string;
  distance?: number; // Distance in kilometers
  fromCoordinates?: [number, number]; // [latitude, longitude]
  toCoordinates?: [number, number]; // [latitude, longitude]
  routePoints?: [number, number][]; // Pre-generated route points for better performance
  // Private fields (admin only)
  privateNotes?: string; // Travel company, station info, reminders
  costTrackingLinks?: CostTrackingLink[];
}

// Instagram post reference
export type InstagramPost = {
  id: string;
  url: string;
  caption?: string;
};

// Single travel period (could be a day, part of a day, or multiple days)
export type JourneyPeriod = {
  id: string;
  date: Date;        // Primary date for the period
  endDate?: Date;    // Optional end date if period spans multiple days
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
  startDate: Date;
  endDate?: Date;
  days: JourneyPeriod[];  // Still called "days" for API compatibility, but contains periods
};



// Cost tracking types
export type CountryPeriod = {
  id: string;
  startDate: Date;
  endDate: Date;
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

export type ExpenseType = 'actual' | 'planned';

export type TravelReference = {
  type: 'location' | 'accommodation' | 'route';
  locationId?: string;
  accommodationId?: string;
  routeId?: string;
  description?: string;
};

export type Expense = {
  id: string;
  date: Date;
  amount: number;
  currency: string;
  category: string;
  country: string;
  description: string;
  notes?: string;
  isGeneralExpense?: boolean; // For expenses not tied to a specific country
  expenseType: ExpenseType; // Type of expense for different budget calculations
  originalPlannedId?: string; // For linking actual expenses to original planned expenses
  // Travel integration (private)
  travelReference?: TravelReference;
};

export type CostTrackingData = {
  id: string;
  tripId: string; // Reference to the travel trip
  tripTitle: string;
  tripStartDate: Date;
  tripEndDate: Date;
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
  // New fields for post-trip and planned expenses
  postTripSpent: number;
  postTripRefunds: number;
  plannedSpending: number;
  plannedRefunds: number; // For negative planned amounts (expected refunds)
  totalCommittedSpending: number; // actual + planned (excluding post-trip)
  availableForPlanning: number; // budget - actual - planned
};

export type CountryBreakdown = {
  country: string;
  budgetAmount: number;
  spentAmount: number;
  refundAmount: number; // New field for refunds in this country
  remainingAmount: number;
  days: number;
  averagePerDay: number;
  // New fields for better breakdown
  preTripSpent: number;
  tripSpent: number;
  suggestedDailyBudget: number; // For remaining days if budget exists
  expenses: Expense[];
  categoryBreakdown: CategoryBreakdown[];
  // New fields for post-trip and planned expenses
  postTripSpent: number;
  postTripRefunds: number;
  plannedSpending: number;
  plannedRefunds: number;
  availableForPlanning: number; // country budget - actual - planned
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
  expenseType?: ExpenseType; // Optional expense type, defaults to 'actual'
};