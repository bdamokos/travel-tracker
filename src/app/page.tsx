import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { isAdminHost, isEmbedHost } from '@/app/lib/server-domains';

export default async function Home() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  
  if (isAdminHost(host)) {
    redirect('/admin');
  }
  
  // For travel-tracker domain, redirect to public maps listing
  if (isEmbedHost(host)) {
    redirect('/maps');
  }
  
  // Default fallback (for local development or other domains)
  redirect('/admin');
} 
