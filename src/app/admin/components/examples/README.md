# Multi-Route Expense Linking Examples

This directory contains example implementations of the multi-route expense linking feature.

## Files

### MultiRouteLinkExample.tsx

A complete, production-ready example showing how to integrate multi-route expense linking into an expense form.

**Features demonstrated:**

- ✅ Toggle between single-link and multi-link modes
- ✅ Load existing links when editing expenses
- ✅ Auto-detect single vs. multi-link from API data
- ✅ Save links using the `useMultiRouteLinks` hook
- ✅ Error handling and display
- ✅ State management for both modes
- ✅ Backward compatibility with single-link expenses

**Usage:**

```typescript
import MultiRouteLinkExample from '@/app/admin/components/examples/MultiRouteLinkExample';

function ExpenseEditor({ expense, tripId }) {
  return (
    <MultiRouteLinkExample
      expense={expense}
      tripId={tripId}
      onSave={(savedExpense, links) => {
        console.log('Expense saved:', savedExpense);
        console.log('Links:', links);
        // Handle success (refresh UI, show notification, etc.)
      }}
    />
  );
}
```

## Integration Checklist

When integrating multi-route linking into your own component:

### 1. Imports

```typescript
import TravelItemSelector from '@/app/admin/components/TravelItemSelector';
import MultiRouteLinkManager from '@/app/admin/components/MultiRouteLinkManager';
import { useMultiRouteLinks } from '@/app/hooks/useMultiRouteLinks';
import { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';
```

### 2. State Management

```typescript
const [useMultiLink, setUseMultiLink] = useState(false);
const [singleLink, setSingleLink] = useState<TravelLinkInfo | undefined>();
const [multiLinks, setMultiLinks] = useState<TravelLinkInfo[]>([]);
const { saving, error, saveLinks } = useMultiRouteLinks();
```

### 3. Load Existing Links

```typescript
useEffect(() => {
  if (expenseId && tripId) {
    fetch(`/api/travel-data/${tripId}/expense-links`)
      .then(res => res.json())
      .then((allLinks) => {
        const expenseLinks = allLinks.filter(l => l.expenseId === expenseId);

        if (expenseLinks.length > 1) {
          setUseMultiLink(true);
          setMultiLinks(/* map to TravelLinkInfo[] */);
        } else if (expenseLinks.length === 1) {
          setSingleLink(/* map to TravelLinkInfo */);
        }
      });
  }
}, [expenseId, tripId]);
```

### 4. Conditional Rendering

```typescript
{useMultiLink ? (
  <MultiRouteLinkManager
    expenseId={expenseId}
    tripId={tripId}
    expenseAmount={expense.amount}
    expenseCurrency={expense.currency}
    onLinksChange={setMultiLinks}
  />
) : (
  <TravelItemSelector
    expenseId={expenseId}
    tripId={tripId}
    onReferenceChange={setSingleLink}
  />
)}
```

### 5. Save Implementation

```typescript
const handleSave = async () => {
  const success = await saveLinks({
    expenseId,
    tripId,
    links: useMultiLink ? multiLinks : singleLink
  });

  if (success) {
    // Handle success
  }
};
```

## Common Patterns

### Pattern 1: Auto-detect Mode from Data

```typescript
// If expense has multiple links, automatically enable multi-link mode
if (expenseLinks.length > 1) {
  setUseMultiLink(true);
}
```

### Pattern 2: Clear State on Mode Switch

```typescript
const handleModeToggle = (enabled: boolean) => {
  setUseMultiLink(enabled);

  // Clear opposite mode to avoid confusion
  if (enabled) {
    setSingleLink(undefined);
  } else {
    setMultiLinks([]);
  }
};
```

### Pattern 3: Validation Before Save

```typescript
const handleSave = async () => {
  if (useMultiLink && multiLinks.length === 0) {
    alert('Please add at least one route');
    return;
  }

  await saveLinks({ expenseId, tripId, links: ... });
};
```

## Testing

To test your integration:

1. **Create Mode**: Add a new expense and link to multiple routes
2. **Edit Mode**: Load an existing multi-link expense and verify it displays correctly
3. **Toggle Mode**: Switch between single and multi-link, verify state clears
4. **Validation**: Test all three split modes (equal, percentage, fixed)
5. **Error Handling**: Disconnect network and verify error displays correctly
6. **Backward Compat**: Verify single-link expenses still work

## Troubleshooting

### Links not saving

- Check browser console for API errors
- Verify `tripId` and `expenseId` are valid
- Ensure expense exists before saving links

### Links not loading

- Check `/api/travel-data/[tripId]/expense-links` returns data
- Verify filter logic (`link.expenseId === expenseId`)
- Check for typos in type casting

### Validation errors

- For percentage mode: sum must equal 100%
- For fixed mode: sum must equal expense amount
- Check tolerance (0.01) in validation logic

### State not updating

- Verify `onLinksChange` callback is wired correctly
- Check React dev tools for state values
- Ensure `useEffect` dependencies are correct

## Next Steps

After implementing multi-route linking:

1. **Update Cost Display**: Show split amounts in expense lists
2. **Add Analytics**: Track which routes have highest costs
3. **Bulk Operations**: Apply same split to multiple expenses
4. **Export**: Include split info in CSV/Excel exports

## Additional Resources

- [Full Documentation](../../../../docs/MULTI_ROUTE_EXPENSE_LINKING.md)
- [API Reference](../../../../docs/MULTI_ROUTE_EXPENSE_LINKING.md#api-reference)
- [GitHub Issue #188](https://github.com/bdamokos/travel-tracker/issues/188)
