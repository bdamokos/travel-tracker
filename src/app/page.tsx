import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function Home() {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  
  // Use environment variables for domains 
  const adminDomain = process.env.ADMIN_DOMAIN?.replace(/^https?:\/\//, '');
  const embedDomain = process.env.EMBED_DOMAIN?.replace(/^https?:\/\//, '');
  
  // Check if we're on the admin domain - use exact match or port-specific match
  if ((adminDomain && (host === adminDomain || host.startsWith(adminDomain + ':'))) || 
      (process.env.NODE_ENV !== 'production' && (host === 'localhost' || host.startsWith('localhost:')))) {
    redirect('/admin');
  }
  
  // For travel-tracker domain, redirect to public maps listing
  if (embedDomain && (host === embedDomain || host.startsWith(embedDomain + ':'))) {
    redirect('/maps');
  }
  
  // Default fallback (for local development or other domains)
  redirect('/admin');
} 