import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Accommodation } from '../../../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const ACCOMMODATIONS_FILE = path.join(DATA_DIR, 'accommodations.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

// Load all accommodations
async function loadAccommodations(): Promise<Accommodation[]> {
  try {
    const data = await fs.readFile(ACCOMMODATIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    // File doesn't exist, return empty array
    return [];
  }
}

// Save accommodations
async function saveAccommodations(accommodations: Accommodation[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(ACCOMMODATIONS_FILE, JSON.stringify(accommodations, null, 2));
}

// Generate unique ID
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

// GET - List accommodations (optionally filtered by locationId)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const locationId = searchParams.get('locationId');
    
    const accommodations = await loadAccommodations();
    
    if (locationId) {
      // Filter by location
      const filtered = accommodations.filter(acc => acc.locationId === locationId);
      return NextResponse.json(filtered);
    }
    
    // Return all accommodations
    return NextResponse.json(accommodations);
  } catch (error) {
    console.error('Error loading accommodations:', error);
    return NextResponse.json({ error: 'Failed to load accommodations' }, { status: 500 });
  }
}

// POST - Create new accommodation(s)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accommodations = await loadAccommodations();
    
    // Support bulk creation for migration
    if (body.accommodations && Array.isArray(body.accommodations)) {
      const newAccommodations: Accommodation[] = body.accommodations.map((acc: Accommodation) => ({
        id: acc.id || generateId(),
        name: acc.name || 'Accommodation',
        locationId: acc.locationId,
        accommodationData: acc.accommodationData || '',
        isAccommodationPublic: acc.isAccommodationPublic || false,
        costTrackingLinks: acc.costTrackingLinks || [],
        createdAt: acc.createdAt || new Date().toISOString(),
        updatedAt: acc.updatedAt || new Date().toISOString()
      }));
      
      accommodations.push(...newAccommodations);
      await saveAccommodations(accommodations);
      
      return NextResponse.json(newAccommodations);
    }
    
    // Single accommodation creation
    if (!body.name || !body.locationId) {
      return NextResponse.json({ error: 'Name and locationId are required' }, { status: 400 });
    }
    
    const newAccommodation: Accommodation = {
      id: generateId(),
      name: body.name,
      locationId: body.locationId,
      accommodationData: body.accommodationData || '',
      isAccommodationPublic: body.isAccommodationPublic || false,
      costTrackingLinks: body.costTrackingLinks || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    accommodations.push(newAccommodation);
    await saveAccommodations(accommodations);
    
    return NextResponse.json(newAccommodation);
  } catch (error) {
    console.error('Error creating accommodation:', error);
    return NextResponse.json({ error: 'Failed to create accommodation' }, { status: 500 });
  }
}

// PUT - Update existing accommodation
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const accommodations = await loadAccommodations();
    
    const index = accommodations.findIndex(acc => acc.id === body.id);
    if (index === -1) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }
    
    // Update accommodation
    accommodations[index] = {
      ...accommodations[index],
      ...body,
      updatedAt: new Date().toISOString()
    };
    
    await saveAccommodations(accommodations);
    
    return NextResponse.json(accommodations[index]);
  } catch (error) {
    console.error('Error updating accommodation:', error);
    return NextResponse.json({ error: 'Failed to update accommodation' }, { status: 500 });
  }
}

// DELETE - Delete accommodation
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }
    
    const accommodations = await loadAccommodations();
    const index = accommodations.findIndex(acc => acc.id === id);
    
    if (index === -1) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }
    
    accommodations.splice(index, 1);
    await saveAccommodations(accommodations);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting accommodation:', error);
    return NextResponse.json({ error: 'Failed to delete accommodation' }, { status: 500 });
  }
}