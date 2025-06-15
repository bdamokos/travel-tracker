import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function Home() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  
  // Check if we're on the admin domain
  if (host.includes('tt-admin.bdamokos.org') || host.includes('admin')) {
    redirect('/admin');
  }
  
  // For travel-tracker domain, redirect to public maps listing
  if (host.includes('travel-tracker.bdamokos.org') || host.includes('travel-tracker')) {
    redirect('/maps');
  }
  
  // Default fallback (for local development or other domains)
  redirect('/admin');
} 