import { NextRequest, NextResponse } from 'next/server';
import { updateCostData, getLegacyCostData } from '../../lib/unifiedDataService';
import { isAdminDomain } from '../../lib/server-domains';


export async function POST(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const costData = await request.json();
    
    // Generate a unique ID for this cost tracking data
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Use unified data service to save cost data
    const unifiedData = await updateCostData(id, {
      ...costData,
      id,
      createdAt: new Date().toISOString()
    });
    
    // Return legacy format for compatibility
    const legacyData = {
      id,
      ...costData,
      createdAt: unifiedData.createdAt
    };
    
    return NextResponse.json({ 
      success: true, 
      id,
      data: legacyData
    });
  } catch (error) {
    console.error('Error saving cost tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to save cost tracking data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }
    
    // Clean the ID to handle both cost-prefixed and clean IDs
    const cleanId = id.replace(/^(cost-)+/, '');
    
    // Use unified data service for automatic migration
    const costData = await getLegacyCostData(cleanId);
    
    if (!costData) {
      return NextResponse.json(
        { error: 'Cost tracking data not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(costData);
  } catch (error) {
    console.error('Error loading cost tracking data:', error);
    return NextResponse.json(
      { error: 'Cost tracking data not found' },
      { status: 404 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Check if request is from admin domain
    const isAdmin = await isAdminDomain();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID parameter is required' },
        { status: 400 }
      );
    }
    
    // Clean the ID to handle both cost-prefixed and clean IDs
    const cleanId = id.replace(/^(cost-)+/, '');
    
    const updatedData = await request.json();
    
    // Use unified data service to update cost data
    const unifiedData = await updateCostData(cleanId, updatedData);
    
    // Extract legacy format for response
    const legacyData = {
      id: cleanId,
      ...updatedData,
      updatedAt: unifiedData.updatedAt
    };
    
    return NextResponse.json({ 
      success: true, 
      id: cleanId,
      data: legacyData
    });
  } catch (error) {
    console.error('Error updating cost tracking data:', error);
    return NextResponse.json(
      { error: 'Failed to update cost tracking data' },
      { status: 500 }
    );
  }
} 