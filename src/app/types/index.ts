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
  // Shadow planning flag (admin only) - indicates if this is editable in shadow mode
  isReadOnly?: boolean;
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
  tikTokPosts?: TikTokPost[];
  blogPosts?: BlogPost[];
  // References to accommodations (not embedded data)
  accommodationIds?: string[];
  // Backward compatibility - will be migrated to separate accommodations
  accommodationData?: string;
  isAccommodationPublic?: boolean;
  // Cost tracking integration (for location-level expenses)
  costTrackingLinks?: CostTrackingLink[];
  // Wikipedia reference - can be article title or Wikidata identifier (Q123456)
  wikipediaRef?: string;
  // Shadow planning flag (admin only) - indicates if this is editable in shadow mode
  isReadOnly?: boolean;
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
  // When true, render stored manual routePoints instead of a generated arc
  useManualRoutePoints?: boolean;
  // When true, this is a return route
  isReturn?: boolean;
  // Private fields (admin only)
  privateNotes?: string; // Travel company, station info, reminders
  costTrackingLinks?: CostTrackingLink[];
}

// Travel route type for route segments (simplified version of Transportation)
export interface TravelRoute {
  id: string;
  from: string;
  to: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  transportType: Transportation['type'];
  date: Date;
  duration?: string;
  notes?: string;
  // Private fields (admin only)
  privateNotes?: string;
  costTrackingLinks?: CostTrackingLink[];
  // Pre-generated route points for better performance
  routePoints?: [number, number][];
  // When true, render stored manual routePoints instead of a generated arc
  useManualRoutePoints?: boolean;
  // When true, this is a return route
  isReturn?: boolean;
  // Shadow planning flag (admin only) - indicates if this is editable in shadow mode
  isReadOnly?: boolean;
}

// Travel data structure for a complete trip
export interface TravelData {
  id?: string;
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  locations: Location[];
  routes: TravelRoute[];
  accommodations?: Accommodation[];
}

// Instagram post reference
export type InstagramPost = {
  id: string;
  url: string;
  caption?: string;
};

// TikTok post reference
export type TikTokPost = {
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
  tikTokPosts?: TikTokPost[];
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

export interface TravelLink {
  id: string;
  url: string;
  title: string;
  description?: string;
  type: 'booking' | 'ticket' | 'info' | 'other';
  associatedWith: 'trip' | 'location' | 'accommodation' | 'transportation';
  entityId: string; // ID of the trip, location, etc.
}

export type CashTransactionSourceDetails = {
  kind: 'source';
  cashTransactionId: string;
  sourceType?: 'exchange' | 'refund';
  localCurrency: string;
  originalLocalAmount: number;
  remainingLocalAmount: number;
  originalBaseAmount: number;
  remainingBaseAmount: number;
  exchangeRate: number;
  allocationIds: string[];
  // When a cash source is funded by another cash source (e.g., currency conversion),
  // we keep the allocation segments so balances can be updated consistently.
  fundingSegments?: CashTransactionAllocationSegment[];
};

export type CashTransactionAllocationSegment = {
  sourceExpenseId: string;
  localAmount: number;
  baseAmount: number;
};

export type CashTransactionAllocationDetails = {
  kind: 'allocation';
  cashTransactionId: string;
  parentExpenseId?: string;
  localCurrency: string;
  localAmount: number;
  baseAmount: number;
  exchangeRate: number;
  segments?: CashTransactionAllocationSegment[];
};

export type CashTransactionDetails = CashTransactionSourceDetails | CashTransactionAllocationDetails;


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
  amount?: number; // Optional amount for budgets
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
  isPendingYnabImport?: boolean; // For shadow expenses created by hourly YNAB syncs
  expenseType: ExpenseType; // Type of expense for different budget calculations
  originalPlannedId?: string; // For linking actual expenses to original planned expenses
  // Travel integration (private)
  travelReference?: TravelReference;
  cashTransaction?: CashTransactionDetails;
  source?: string;
  hash?: string;
  ynabTransactionId?: string;
  ynabImportId?: string;
};

export type CostTrackingData = {
  id: string;
  tripId: string; // Reference to the travel trip
  tripTitle: string;
  tripStartDate: Date;
  tripEndDate: Date;
  overallBudget: number;
  reservedBudget?: number; // Funds intentionally set aside (not available for daily spend)
  currency: string;
  countryBudgets: BudgetItem[];
  expenses: Expense[];
  customCategories?: string[]; // User-defined expense categories (optional for backwards compatibility)
  ynabImportData?: YnabImportData; // YNAB import configuration and history
  ynabConfig?: YnabConfig; // YNAB API configuration for direct integration
  createdAt: string;
  updatedAt?: string;
};

export type CostSummary = {
  totalBudget: number;
  spendableBudget: number; // Budget after reservations
  reservedBudget: number; // Budget intentionally held back
  totalSpent: number;
  totalRefunds: number; // New field for total refunds
  remainingBudget: number;
  totalDays: number;
  remainingDays: number;
  daysCompleted: number;
  averageSpentPerDay: number;
  suggestedDailyBudget: number;
  dailyBudgetBasisDays: number;
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
  recentTripSpending: { date: string; amount: number }[];
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
  ynabCategoryId?: string; // YNAB API category ID for API-based imports
  mappingType: 'country' | 'general' | 'none';
  countryName?: string; // if mappingType === 'country'
};

export type YnabImportData = {
  mappings: YnabCategoryMapping[];
  importedTransactionHashes: string[]; // to prevent duplicates
  lastImportedTransactionHash?: string; // NEW: track last imported transaction
  lastImportedTransactionDate?: string; // NEW: for additional filtering context
  payeeCategoryDefaults?: Record<string, string>; // remembers last category per payee
};

// Extended CategoryMapping with YNAB API support
export interface CategoryMapping {
  ynabCategoryId?: string;
  ynabCategoryName?: string;
  mappingType: 'country' | 'general' | 'none';
  countryName?: string;
}

// YNAB API configuration - scoped to specific cost tracker
export interface YnabConfig {
  costTrackerId: string; // CRITICAL: Scope to specific cost tracker for data isolation
  apiKey: string;
  selectedBudgetId: string;
  selectedBudgetName: string;
  currency: string;
  lastCategorySync?: Date;
  categoryServerKnowledge?: number;
  lastTransactionSync?: Date;
  lastTransactionImport?: Date;
  transactionServerKnowledge?: number;
  lastAutomaticTransactionSync?: Date;
  automaticTransactionServerKnowledge?: number;
}

// YNAB API Budget from SDK
export interface YnabBudget {
  id: string;
  name: string;
  last_modified_on: string;
  first_month: string;
  last_month: string;
  currency_format: {
    iso_code: string;
    example_format: string;
    decimal_digits: number;
    decimal_separator: string;
    symbol_first: boolean;
    group_separator: string;
    currency_symbol: string;
    display_symbol: boolean;
  };
}

// YNAB API Category from SDK
export interface YnabCategory {
  id: string;
  category_group_id: string;
  category_group_name: string;
  name: string;
  hidden: boolean;
  original_category_group_id?: string;
  note?: string;
  budgeted: number;
  activity: number;
  balance: number;
  goal_type?: string;
  goal_day?: number;
  goal_cadence?: number;
  goal_creation_month?: string;
  goal_target?: number;
  goal_target_month?: string;
  goal_percentage_complete?: number;
  goal_months_to_budget?: number;
  goal_under_funded?: number;
  goal_overall_funded?: number;
  goal_overall_left?: number;
  deleted: boolean;
}

// YNAB API Transaction from SDK (simplified)
export interface YnabApiSubTransaction {
  id: string;
  transaction_id: string;
  amount: number;
  memo?: string | null;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  transfer_account_id?: string | null;
  transfer_transaction_id?: string | null;
  deleted: boolean;
}

export interface YnabApiTransaction {
  id: string;
  date: string;
  amount: number; // in milliunits
  memo?: string;
  cleared: string;
  approved: boolean;
  flag_color?: string;
  flag_name?: string;
  account_id: string;
  account_name: string;
  payee_id?: string;
  payee_name?: string;
  category_id?: string;
  category_name?: string;
  transfer_account_id?: string;
  transfer_transaction_id?: string;
  matched_transaction_id?: string;
  import_id?: string;
  import_payee_name?: string;
  import_payee_name_original?: string;
  debt_transaction_type?: string;
  deleted: boolean;
  parent_transaction_id?: string;
  subtransaction_index?: number;
  subtransactions?: YnabApiSubTransaction[];
}

// YNAB API Error Response
export interface YnabApiError {
  id: string;
  name: string;
  detail: string;
}

// Add filtering response type
export type YnabTransactionFilterResult = {
  newTransactions: ProcessedYnabTransaction[];
  filteredCount: number;
  lastTransactionFound: boolean;
};

export type YnabDuplicateMatchType =
  | 'transactionId'
  | 'importId'
  | 'hash'
  | 'payeeDateAmount';

export type YnabDuplicateMatch = {
  expenseId: string;
  description: string;
  date: string;
  amount: number;
  currency: string;
  daysApart: number;
  matchType: YnabDuplicateMatchType;
  exactAmountMatch: boolean;
  amountDifference: number;
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
  instanceId?: string; // unique per-transaction identifier to distinguish identical hashes
  sourceIndex?: number; // original index within the source dataset for deterministic matching
  expenseType?: ExpenseType; // Optional expense type, defaults to 'actual'
  ynabTransactionId?: string; // YNAB API transaction ID when available
  importId?: string; // YNAB API import ID when available
  possibleDuplicateMatches?: YnabDuplicateMatch[];
};

// Shadow Trip Planning Types
export interface ShadowTrip {
  id: string;
  basedOn: string; // ID of the real Trip this shadows
  shadowLocations: Location[];
  shadowRoutes: Transportation[];
  shadowAccommodations: Accommodation[];
  createdAt: string;
  updatedAt?: string;
}

export interface Trip {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  isArchived?: boolean;
  locations: Location[];
  routes: Transportation[];
  accommodations: Accommodation[];
  travelLinks?: TravelLink[];
  costTrackingId?: string;
  shadowTripId?: string; // Link to corresponding shadow trip
  schemaVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExistingTrip {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export interface ExistingCostEntry {
  id: string;
  tripId: string;
  tripTitle: string;
  tripStartDate: string;
  tripEndDate: string;
  overallBudget: number;
  reservedBudget?: number;
  spendableBudget?: number;
  currency: string;
  totalSpent: number;
  remainingBudget: number;
  createdAt: string;
}
