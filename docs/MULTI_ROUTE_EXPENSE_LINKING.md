# Multi-Route Expense Linking

## Overview

The multi-route expense linking feature (Issue #188) allows expenses to be linked to multiple transportation routes or segments with automatic cost distribution. This enables accurate cost tracking for combined tickets (e.g., a rail pass covering multiple journey legs).

## Architecture

### Data Model

**CostTrackingLink** (`src/app/types/index.ts`)
```typescript
export type CostTrackingLink = {
  expenseId: string;
  description?: string;
  // Multi-route expense distribution
  splitMode?: 'equal' | 'percentage' | 'fixed';
  splitValue?: number; // For 'percentage' (0-100) or 'fixed' (amount in expense currency)
}
```

**TravelLinkInfo** (`src/app/lib/expenseTravelLookup.ts`)
```typescript
export interface TravelLinkInfo {
  type: 'location' | 'accommodation' | 'route';
  id: string;
  name: string;
  locationName?: string;
  tripTitle?: string;
  // Multi-route expense distribution
  splitMode?: 'equal' | 'percentage' | 'fixed';
  splitValue?: number; // For 'percentage' (0-100) or 'fixed' (amount in expense currency)
}
```

### Backend Services

**ExpenseLinkingService** (`src/app/lib/expenseLinkingService.ts`)

- `createMultipleLinks(expenseId, travelLinkInfos[])` - Creates multiple links with split configuration
- `removeExistingLinks()` - Now searches subRoutes as well as parent routes
- `findTravelItem()` - Searches both parent routes and subRoutes

**API Endpoints** (`src/app/api/travel-data/[tripId]/expense-links/route.ts`)

- `POST /api/travel-data/[tripId]/expense-links` - Create/update links (single or multi)
- `DELETE /api/travel-data/[tripId]/expense-links?expenseId=...` - Remove links
- `GET /api/travel-data/[tripId]/expense-links` - Retrieve all links (already handles subRoutes)

### Frontend Components

**MultiRouteLinkManager** (`src/app/admin/components/MultiRouteLinkManager.tsx`)

Main UI component for managing multi-route expense links.

**Props:**
```typescript
interface MultiRouteLinkManagerProps {
  expenseId: string;
  tripId: string;
  expenseAmount?: number;          // For split calculations
  expenseCurrency?: string;        // For display
  transactionDate?: Date | string | null;
  initialLinks?: TravelLinkInfo[]; // Pre-populate existing links
  onLinksChange: (links: TravelLinkInfo[]) => void;
  className?: string;
}
```

**useMultiRouteLinks Hook** (`src/app/hooks/useMultiRouteLinks.ts`)

React hook for saving expense links:

```typescript
const { saving, error, saveLinks, clearError } = useMultiRouteLinks();

await saveLinks({
  expenseId: 'exp-123',
  tripId: 'trip-456',
  links: [
    { id: 'route-1', type: 'route', name: 'Paris → London', splitMode: 'equal' },
    { id: 'route-2', type: 'route', name: 'London → Edinburgh', splitMode: 'equal' }
  ]
});
```

## Distribution Modes

### 1. Equal Split (Default)

Automatically divides the expense evenly across all linked routes.

**Example:** €120 expense across 3 routes = €40 per route

```typescript
{
  splitMode: 'equal',
  splitValue: undefined // Calculated automatically
}
```

### 2. Percentage Split

User specifies a percentage (0-100) for each route. Must sum to 100%.

**Example:** €120 expense split 50%, 30%, 20%

```typescript
[
  { id: 'route-1', splitMode: 'percentage', splitValue: 50 }, // €60
  { id: 'route-2', splitMode: 'percentage', splitValue: 30 }, // €36
  { id: 'route-3', splitMode: 'percentage', splitValue: 20 }  // €24
]
```

### 3. Fixed Amount Split

User specifies an exact amount for each route. Must sum to total expense.

**Example:** €120 expense split into fixed amounts

```typescript
[
  { id: 'route-1', splitMode: 'fixed', splitValue: 50 },  // €50
  { id: 'route-2', splitMode: 'fixed', splitValue: 45 },  // €45
  { id: 'route-3', splitMode: 'fixed', splitValue: 25 }   // €25
]
```

## Route Segments (SubRoutes)

The system fully supports linking expenses to individual route segments:

**TravelItemSelector** now displays subRoutes with visual hierarchy:
- Parent Route: `Paris → Barcelona`
- Segment 1: `↳ Paris → Lyon` (displayed with indent)
- Segment 2: `↳ Lyon → Barcelona`

Users can link expenses to:
- The entire parent route
- Individual segments
- Any combination of routes and segments

## Integration Example

### Basic Integration into Expense Form

```typescript
import { useState } from 'react';
import MultiRouteLinkManager from '@/app/admin/components/MultiRouteLinkManager';
import { useMultiRouteLinks } from '@/app/hooks/useMultiRouteLinks';
import { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';

function ExpenseFormWithMultiLink({ expense, tripId }) {
  const [multiRouteMode, setMultiRouteMode] = useState(false);
  const [links, setLinks] = useState<TravelLinkInfo[]>([]);
  const { saving, error, saveLinks } = useMultiRouteLinks();

  const handleSave = async () => {
    if (multiRouteMode && links.length > 0) {
      const success = await saveLinks({
        expenseId: expense.id,
        tripId,
        links
      });

      if (success) {
        // Handle success (e.g., show notification, refresh data)
      }
    }
  };

  return (
    <div>
      {/* Toggle between single and multi-link mode */}
      <label>
        <input
          type="checkbox"
          checked={multiRouteMode}
          onChange={(e) => setMultiRouteMode(e.target.checked)}
        />
        Link to multiple routes
      </label>

      {multiRouteMode ? (
        <MultiRouteLinkManager
          expenseId={expense.id}
          tripId={tripId}
          expenseAmount={expense.amount}
          expenseCurrency={expense.currency}
          transactionDate={expense.date}
          onLinksChange={setLinks}
        />
      ) : (
        <TravelItemSelector
          {/* ... single link props */}
        />
      )}

      <button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Expense'}
      </button>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

### Loading Existing Multi-Links

```typescript
useEffect(() => {
  if (expense.id && tripId) {
    fetch(`/api/travel-data/${tripId}/expense-links`)
      .then(res => res.json())
      .then((allLinks) => {
        // Filter links for this expense
        const expenseLinks = allLinks.filter(
          link => link.expenseId === expense.id
        );

        if (expenseLinks.length > 1) {
          // Multi-link expense
          setMultiRouteMode(true);
          setLinks(expenseLinks.map(link => ({
            id: link.travelItemId,
            type: link.travelItemType,
            name: link.travelItemName,
            splitMode: link.splitMode,
            splitValue: link.splitValue
          })));
        }
      });
  }
}, [expense.id, tripId]);
```

## Cost Calculation with Splits

Use the `calculateSplitAmount()` utility to determine how much of an expense is allocated to each route:

```typescript
import { calculateSplitAmount } from '@/app/lib/expenseTravelLookup';

// Example: Calculate split for a specific link
const expenseAmount = 120;
const link: CostTrackingLink = {
  expenseId: 'exp-123',
  splitMode: 'percentage',
  splitValue: 40 // 40%
};

const allocatedAmount = calculateSplitAmount(expenseAmount, link);
// Result: 48 (40% of 120)
```

For equal split mode, pass all links:

```typescript
const allLinksForExpense: CostTrackingLink[] = [link1, link2, link3];
const allocatedAmount = calculateSplitAmount(
  expenseAmount,
  link1,
  allLinksForExpense
);
// Result: 40 (120 / 3)
```

## Validation Rules

The `MultiRouteLinkManager` component automatically validates:

1. **Percentage Mode:** Total must equal 100%
   - Error if sum ≠ 100% (within 0.01% tolerance)

2. **Fixed Amount Mode:** Total must equal expense amount
   - Error if sum ≠ expense amount (within 0.01 currency unit tolerance)

3. **Duplicate Detection:** Cannot add the same route twice

4. **Minimum Links:** Link quantity depends on the operation
   - **Creating/updating multi-link**: At least 1 route must be added before saving
   - **Unlinking expense**: Passing zero links clears all associations (valid operation)
   - Cannot save an empty multi-link configuration (provide at least one route or unlink entirely)

## Backward Compatibility

The system maintains full backward compatibility:

- **Single-link expenses:** `splitMode` undefined = 100% allocation (legacy behavior)
- **API:** Accepts both `TravelLinkInfo` (single) and `TravelLinkInfo[]` (multi)
- **Existing data:** All current expenses continue to work without modification
- **Migration:** No data migration required

## Future Enhancements

Potential improvements not yet implemented:

1. **Cost Display Integration:**
   - Update expense totals in Timeline to show split amounts
   - Add "shared expense" indicator in UI
   - Breakdown view showing cost per route

2. **Bulk Operations:**
   - Apply same split to multiple expenses
   - Template splits for common scenarios

3. **Advanced Splits:**
   - Time-based splits (e.g., by journey duration)
   - Distance-based splits (e.g., by route distance)

4. **Analytics:**
   - Per-segment cost analysis
   - Compare actual vs. expected splits

## Testing

To test the feature:

1. Create an expense with amount > 0
2. Enable multi-route mode
3. Add 2-3 routes or segments
4. Try each distribution mode:
   - Equal: Verify auto-calculation
   - Percentage: Try different %values, check validation
   - Fixed: Enter amounts, check validation
5. Save and verify links are created in database
6. Edit expense and verify links are loaded correctly

## API Reference

### POST /api/travel-data/[tripId]/expense-links

**Request Body:**
```json
{
  "expenseId": "exp-123",
  "links": [
    {
      "id": "route-1",
      "type": "route",
      "name": "Paris → London",
      "splitMode": "percentage",
      "splitValue": 60
    },
    {
      "id": "route-2",
      "type": "route",
      "name": "London → Edinburgh",
      "splitMode": "percentage",
      "splitValue": 40
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Expense linked to 2 routes with split configuration"
}
```

### DELETE /api/travel-data/[tripId]/expense-links

**Query Parameters:**
- `expenseId` (required): ID of expense to unlink

**Response:**
```json
{
  "success": true,
  "message": "Expense link removed"
}
```

## Database Schema

No schema changes required. The feature uses existing `costTrackingLinks` arrays on:

- `Location.costTrackingLinks`
- `Accommodation.costTrackingLinks`
- `Transportation.costTrackingLinks`
- `TransportationSegment.costTrackingLinks` (subRoutes)

The split configuration is stored in the `CostTrackingLink` objects.

## Related Files

- `src/app/types/index.ts` - Type definitions
- `src/app/lib/expenseLinkingService.ts` - Backend linking logic
- `src/app/lib/expenseTravelLookup.ts` - Lookup and calculation utilities
- `src/app/admin/components/TravelItemSelector.tsx` - Route selection (updated for subRoutes)
- `src/app/admin/components/MultiRouteLinkManager.tsx` - Multi-link UI
- `src/app/hooks/useMultiRouteLinks.ts` - React integration hook
- `src/app/api/travel-data/[tripId]/expense-links/route.ts` - API endpoints
