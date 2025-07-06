import { headers } from 'next/headers';

export async function getCurrentDomain(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const protocol = headersList.get('x-forwarded-proto') || 'http';
  
  return `${protocol}://${host}`;
}

export async function isAdminDomain(): Promise<boolean> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  
  return host.includes('tt-admin.bdamokos.org') || host.includes('admin') || 
         (process.env.NODE_ENV !== 'production' && host.includes('localhost'));
}

export async function isEmbedDomain(): Promise<boolean> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  
  return host.includes('travel-tracker.bdamokos.org') || host.includes('travel-tracker');
} 