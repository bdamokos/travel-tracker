# Integration Guide: Adding Multi-Route Linking to ExpenseForm and ExpenseInlineEditor

This guide shows how to integrate the `MultiRouteLinkManager` component into the existing expense editing forms.

## Overview

Both `ExpenseForm` and `ExpenseInlineEditor` currently use single-route linking via `TravelItemSelector`. This guide shows how to add multi-route support while maintaining backward compatibility.

## Architecture

The integration follows this pattern:

1. Add state for multi-link mode toggle
2. Add state for storing multiple links
3. Load existing links and detect single vs. multi
4. Conditionally render `TravelItemSelector` vs `MultiRouteLinkManager`
5. Save using the appropriate API format

See `src/app/admin/components/examples/MultiRouteLinkExample.tsx` for a complete reference implementation.

---

## ExpenseForm Integration

### Step 1: Add Imports

```typescript
import MultiRouteLinkManager from './MultiRouteLinkManager';
import { useMultiRouteLinks } from '@/app/hooks/useMultiRouteLinks';
```

### Step 2: Add State

After line 37 (`const [selectedTravelLinkInfo, setSelectedTravelLinkInfo] = ...`):

```typescript
// Multi-route linking state
const [useMultiLink, setUseMultiLink] = useState(false);
const [multiLinks, setMultiLinks] = useState<TravelLinkInfo[]>([]);
const { saving: savingLinks, error: linkError, saveLinks } = useMultiRouteLinks();
```

### Step 3: Update useEffect for Loading Links

Replace the existing `useEffect` (lines 44-74) with:

```typescript
// Load existing travel link(s) when editing an expense
useEffect(() => {
  if (editingExpenseIndex !== null && currentExpense.id && tripId) {
    const abortController = new AbortController();

    fetch(`/api/travel-data/${tripId}/expense-links`, {
      signal: abortController.signal
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Failed to load expense links: ${response.statusText}`);
        }
        return response.json();
      })
      .then((links: Array<{
        expenseId: string;
        travelItemId: string;
        travelItemName: string;
        travelItemType: 'location' | 'accommodation' | 'route';
        splitMode?: 'equal' | 'percentage' | 'fixed';
        splitValue?: number;
      }>) => {
        const expenseLinks = links.filter(link => link.expenseId === currentExpense.id);

        if (expenseLinks.length > 1) {
          // Multi-link expense
          setUseMultiLink(true);
          setMultiLinks(expenseLinks.map(link => ({
            id: link.travelItemId,
            name: link.travelItemName,
            type: link.travelItemType as 'location' | 'accommodation' | 'route',
            splitMode: link.splitMode,
            splitValue: link.splitValue
          })));
        } else if (expenseLinks.length === 1) {
          // Single link
          setUseMultiLink(false);
          setSelectedTravelLinkInfo({
            id: expenseLinks[0].travelItemId,
            name: expenseLinks[0].travelItemName,
            type: expenseLinks[0].travelItemType as 'location' | 'accommodation' | 'route',
            splitMode: expenseLinks[0].splitMode,
            splitValue: expenseLinks[0].splitValue
          });
        }
      })
      .catch(error => {
        // Ignore abort errors
        if (error.name !== 'AbortError') {
          console.error('Error loading existing travel link:', error);
        }
      });

    // Cleanup: abort fetch if component unmounts or dependencies change
    return () => abortController.abort();
  } else {
    setUseMultiLink(false);
    setSelectedTravelLinkInfo(undefined);
    setMultiLinks([]);
  }
}, [editingExpenseIndex, currentExpense.id, tripId]);
```

### Step 4: Update submitExpenseAction

Add link saving logic after creating the expense (around line 106-108):

```typescript
// Save expense
onExpenseAdded(expense, selectedTravelLinkInfo);

// Save expense links if needed
if (expense.id && tripId) {
  const linksToSave = useMultiLink ? multiLinks : selectedTravelLinkInfo;

  if (linksToSave && (Array.isArray(linksToSave) ? linksToSave.length > 0 : true)) {
    await saveLinks({
      expenseId: expense.id,
      tripId,
      links: linksToSave
    });
  }
}
```

### Step 5: Replace TravelItemSelector in UI

Find the `TravelItemSelector` component (around line 289) and replace with:

```typescript
<div className="md:col-span-2">
  {/* Multi-link toggle */}
  <div className="mb-2">
    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      <input
        type="checkbox"
        checked={useMultiLink}
        onChange={(e) => {
          setUseMultiLink(e.target.checked);
          if (e.target.checked) {
            setSelectedTravelLinkInfo(undefined);
          } else {
            setMultiLinks([]);
          }
        }}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      Link to multiple routes (split cost)
    </label>
  </div>

  {/* Conditional rendering */}
  {useMultiLink ? (
    <MultiRouteLinkManager
      expenseId={currentExpense.id ?? 'new-expense'}
      tripId={tripId}
      expenseAmount={currentExpense.amount || 0}
      expenseCurrency={currentExpense.currency || currency}
      transactionDate={currentExpense.date}
      initialLinks={multiLinks}
      onLinksChange={setMultiLinks}
    />
  ) : (
    <TravelItemSelector
      expenseId={currentExpense.id ?? 'new-expense'}
      tripId={tripId}
      travelLookup={travelLookup}
      transactionDate={currentExpense.date}
      initialValue={selectedTravelLinkInfo}
      onReferenceChange={(travelLinkInfo) => {
        setSelectedTravelLinkInfo(travelLinkInfo);
        setCurrentExpense(prev => ({
          ...prev,
          travelReference: travelLinkInfo ? {
            type: travelLinkInfo.type,
            locationId: travelLinkInfo.type === 'location' ? travelLinkInfo.id : undefined,
            accommodationId: travelLinkInfo.type === 'accommodation' ? travelLinkInfo.id : undefined,
            routeId: travelLinkInfo.type === 'route' ? travelLinkInfo.id : undefined,
            description: travelLinkInfo.name,
          } : undefined,
        }));
      }}
    />
  )}

  {/* Error display */}
  {linkError && (
    <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
      <p className="text-sm text-red-600 dark:text-red-400">
        Error saving links: {linkError}
      </p>
    </div>
  )}
</div>
```

---

## ExpenseInlineEditor Integration

The integration is similar but simpler since ExpenseInlineEditor is a smaller component.

### Step 1: Add Imports

```typescript
import MultiRouteLinkManager from './MultiRouteLinkManager';
import { useMultiRouteLinks } from '@/app/hooks/useMultiRouteLinks';
```

### Step 2: Update Props Interface

Modify `ExpenseInlineEditorProps` to accept initial multi-links:

```typescript
interface ExpenseInlineEditorProps {
  expense: Expense;
  onSave: (expense: Expense, travelLinkInfo?: TravelLinkInfo | TravelLinkInfo[]) => void;
  // ... rest of props
}
```

### Step 3: Add State

After line 34 (`const [selectedTravelLinkInfo, setSelectedTravelLinkInfo] = ...`):

```typescript
// Multi-route linking state
const [useMultiLink, setUseMultiLink] = useState(false);
const [multiLinks, setMultiLinks] = useState<TravelLinkInfo[]>([]);
```

### Step 4: Add useEffect to Load Links

After the existing state declarations:

```typescript
// Load existing links when mounting
useEffect(() => {
  if (!expense.id || !tripId) return;

  const abortController = new AbortController();

  fetch(`/api/travel-data/${tripId}/expense-links`, {
    signal: abortController.signal
  })
    .then(async response => {
      if (!response.ok) {
        throw new Error(`Failed to load expense links: ${response.statusText}`);
      }
      return response.json();
    })
    .then((links: Array<{
      expenseId: string;
      travelItemId: string;
      travelItemName: string;
      travelItemType: 'location' | 'accommodation' | 'route';
      splitMode?: 'equal' | 'percentage' | 'fixed';
      splitValue?: number;
    }>) => {
      const expenseLinks = links.filter(link => link.expenseId === expense.id);

      if (expenseLinks.length > 1) {
        setUseMultiLink(true);
        setMultiLinks(expenseLinks.map(link => ({
          id: link.travelItemId,
          name: link.travelItemName,
          type: link.travelItemType as 'location' | 'accommodation' | 'route',
          splitMode: link.splitMode,
          splitValue: link.splitValue
        })));
      } else if (expenseLinks.length === 1) {
        setSelectedTravelLinkInfo({
          id: expenseLinks[0].travelItemId,
          name: expenseLinks[0].travelItemName,
          type: expenseLinks[0].travelItemType as 'location' | 'accommodation' | 'route',
          splitMode: expenseLinks[0].splitMode,
          splitValue: expenseLinks[0].splitValue
        });
      }
    })
    .catch(error => {
      // Ignore abort errors
      if (error.name !== 'AbortError') {
        console.error('Error loading expense links:', error);
      }
    });

  // Cleanup: abort fetch if component unmounts
  return () => abortController.abort();
}, [expense.id, tripId]);
```

### Step 5: Update handleSubmit

Modify the `handleSubmit` function to pass the correct link info:

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();

  if (!formData.date || !formData.amount || formData.amount === 0 || !formData.category) {
    return;
  }

  const linksToSave = useMultiLink ? multiLinks : selectedTravelLinkInfo;
  onSave(formData, linksToSave);
};
```

### Step 6: Add UI Elements

Find where `TravelItemSelector` is rendered and replace with:

```typescript
{/* Travel Item Linking */}
<div>
  <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 mb-1">
    <input
      type="checkbox"
      checked={useMultiLink}
      onChange={(e) => {
        setUseMultiLink(e.target.checked);
        if (e.target.checked) {
          setSelectedTravelLinkInfo(undefined);
        } else {
          setMultiLinks([]);
        }
      }}
      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
    />
    Link to multiple routes
  </label>

  {useMultiLink ? (
    <MultiRouteLinkManager
      expenseId={expense.id}
      tripId={tripId}
      expenseAmount={formData.amount || 0}
      expenseCurrency={formData.currency || 'EUR'}
      transactionDate={formData.date}
      initialLinks={multiLinks}
      onLinksChange={setMultiLinks}
      className="mt-2"
    />
  ) : (
    <TravelItemSelector
      expenseId={expense.id}
      tripId={tripId}
      travelLookup={travelLookup}
      transactionDate={formData.date}
      onReferenceChange={setSelectedTravelLinkInfo}
      className="mt-2"
    />
  )}
</div>
```

---

## API Integration Notes

Both forms will need to handle the API calls. You can either:

**Option A: Use the hook (recommended)**
```typescript
const { saveLinks } = useMultiRouteLinks();

// In submit handler:
await saveLinks({
  expenseId: expense.id,
  tripId,
  links: useMultiLink ? multiLinks : selectedTravelLinkInfo
});
```

**Option B: Direct API call**
```typescript
await fetch(`/api/travel-data/${tripId}/expense-links`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    expenseId: expense.id,
    links: useMultiLink ? multiLinks : selectedTravelLinkInfo
  })
});
```

---

## Testing Checklist

After integrating, test the following scenarios:

### Single-Link Mode (Backward Compatibility)
- [ ] Create new expense with single link
- [ ] Edit expense with existing single link
- [ ] Remove link from expense
- [ ] Switch from multi to single mode

### Multi-Link Mode
- [ ] Create expense with 2+ routes
- [ ] Edit expense with existing multi-links
- [ ] Add/remove routes from multi-link
- [ ] Test all 3 split modes (equal, percentage, fixed)
- [ ] Verify validation (percentages = 100%, fixed = total)

### Edge Cases
- [ ] Toggle between modes without saving
- [ ] Load expense with no links
- [ ] Load expense with legacy travelReference
- [ ] Split configuration persists across edits
- [ ] Error handling for API failures

---

## Migration Path

**Existing Expenses**: No migration needed!
- Single-link expenses work as before
- Multi-link is opt-in via toggle
- Legacy travelReference still supported

**Data Safety**:
- Never auto-convert single to multi
- Only create multi-links when explicitly toggled
- Validate split configuration before saving

---

## Additional Features (Optional)

Consider adding these enhancements:

1. **Quick Split Presets**
   - "50/50 split" button for 2 routes
   - "Equal thirds" for 3 routes
   - Common percentage templates

2. **Visual Indicators**
   - Badge showing link count in expense list
   - Icon for multi-link expenses
   - Preview of split amounts

3. **Bulk Operations**
   - Apply same split to multiple expenses
   - Copy split configuration
   - Template management

4. **Validation Warnings**
   - Warn if total > 100% or < 100%
   - Suggest fixes for validation errors
   - Preview calculated amounts before save

---

## Reference Files

- **Complete Example**: `src/app/admin/components/examples/MultiRouteLinkExample.tsx`
- **Component**: `src/app/admin/components/MultiRouteLinkManager.tsx`
- **Hook**: `src/app/hooks/useMultiRouteLinks.ts`
- **API**: `src/app/api/travel-data/[tripId]/expense-links/route.ts`
- **Types**: `src/app/types/index.ts` (CostTrackingLink)
- **Documentation**: `docs/MULTI_ROUTE_EXPENSE_LINKING.md`

---

## Support

If you encounter issues:

1. Check the MultiRouteLinkExample implementation
2. Verify API response includes splitMode/splitValue
3. Check browser console for errors
4. Review validation error messages
5. Refer to full documentation in `docs/MULTI_ROUTE_EXPENSE_LINKING.md`
