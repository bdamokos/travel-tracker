import { NextRequest, NextResponse } from 'next/server';
import { loadUnifiedTripData } from '../../../../lib/unifiedDataService';
import { isAdminDomain } from '../../../../lib/server-domains';
import { 
  validateTripBoundary, 
  validateExpenseBelongsToTrip, 
  validateAllTripBoundaries
} from '../../../../lib/tripBoundaryValidation';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { id } = await params;
    const body = await request.json();
    const { action, expenseId, travelItemId } = body;

    // Clean the ID to handle both cost-prefixed and clean IDs
    const cleanId = id.replace(/^cost-/, '');
    
    // Load unified trip data
    const unifiedData = await loadUnifiedTripData(cleanId);
    if (!unifiedData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    switch (action) {
      case 'validate-expense':
        if (!expenseId) {
          return NextResponse.json({ 
            error: 'expenseId is required for expense validation' 
          }, { status: 400 });
        }
        
        const expenseValidation = validateExpenseBelongsToTrip(expenseId, unifiedData);
        return NextResponse.json({
          isValid: expenseValidation.isValid,
          errors: expenseValidation.errors,
          tripId: cleanId
        });

      case 'validate-link':
        if (!expenseId || !travelItemId) {
          return NextResponse.json({ 
            error: 'Both expenseId and travelItemId are required for link validation' 
          }, { status: 400 });
        }
        
        const linkValidation = validateTripBoundary(expenseId, travelItemId, unifiedData);
        return NextResponse.json({
          isValid: linkValidation.isValid,
          errors: linkValidation.errors,
          tripId: cleanId
        });

      case 'validate-all':
        const allValidation = validateAllTripBoundaries(unifiedData);
        return NextResponse.json({
          isValid: allValidation.isValid,
          errors: allValidation.errors,
          tripId: cleanId,
          summary: {
            totalErrors: allValidation.errors.length,
            errorTypes: Array.from(new Set(allValidation.errors.map(e => e.type))),
            affectedExpenses: Array.from(new Set(allValidation.errors.map(e => e.expenseId).filter(Boolean))),
            affectedTravelItems: Array.from(new Set(allValidation.errors.map(e => e.itemId).filter(Boolean)))
          }
        });

      default:
        return NextResponse.json({ 
          error: 'Invalid action. Supported actions: validate-expense, validate-link, validate-all' 
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Error in trip boundary validation:', error);
    return NextResponse.json({ 
      error: 'Failed to validate trip boundaries' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { id } = await params;
    const url = new URL(request.url);
    const expenseId = url.searchParams.get('expenseId');
    const travelItemId = url.searchParams.get('travelItemId');

    // Clean the ID to handle both cost-prefixed and clean IDs
    const cleanId = id.replace(/^cost-/, '');
    
    // Load unified trip data
    const unifiedData = await loadUnifiedTripData(cleanId);
    if (!unifiedData) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // If specific expense and travel item provided, validate the link
    if (expenseId && travelItemId) {
      const validation = validateTripBoundary(expenseId, travelItemId, unifiedData);
      return NextResponse.json({
        isValid: validation.isValid,
        errors: validation.errors,
        tripId: cleanId
      });
    }

    // If only expense provided, validate expense belongs to trip
    if (expenseId) {
      const validation = validateExpenseBelongsToTrip(expenseId, unifiedData);
      return NextResponse.json({
        isValid: validation.isValid,
        errors: validation.errors,
        tripId: cleanId
      });
    }

    // Otherwise, validate all trip boundaries
    const validation = validateAllTripBoundaries(unifiedData);
    return NextResponse.json({
      isValid: validation.isValid,
      errors: validation.errors,
      tripId: cleanId,
      summary: {
        totalErrors: validation.errors.length,
        errorTypes: Array.from(new Set(validation.errors.map(e => e.type))),
        affectedExpenses: Array.from(new Set(validation.errors.map(e => e.expenseId).filter(Boolean))),
        affectedTravelItems: Array.from(new Set(validation.errors.map(e => e.itemId).filter(Boolean)))
      }
    });

  } catch (error) {
    console.error('Error in trip boundary validation:', error);
    return NextResponse.json({ 
      error: 'Failed to validate trip boundaries' 
    }, { status: 500 });
  }
}