import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { Accommodation } from '../../../../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const ACCOMMODATIONS_FILE = path.join(DATA_DIR, 'accommodations.json');

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

// GET - Get single accommodation by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accommodations = await loadAccommodations();
    const accommodation = accommodations.find(acc => acc.id === id);
    
    if (!accommodation) {
      return NextResponse.json({ error: 'Accommodation not found' }, { status: 404 });
    }
    
    return NextResponse.json(accommodation);
  } catch (error) {
    console.error('Error loading accommodation:', error);
    return NextResponse.json({ error: 'Failed to load accommodation' }, { status: 500 });
  }
}