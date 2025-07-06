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
  
  // Use environment variable for admin domain
  const adminDomain = process.env.ADMIN_DOMAIN?.replace(/^https?:\/\//, '');
  
  return (adminDomain && (host === adminDomain || host.startsWith(adminDomain + ':'))) || 
         (process.env.NODE_ENV !== 'production' && (host === 'localhost' || host.startsWith('localhost:')));
}

export async function isEmbedDomain(): Promise<boolean> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  
  // Use environment variable for embed domain
  const embedDomain = process.env.EMBED_DOMAIN?.replace(/^https?:\/\//, '');
  
  return Boolean(embedDomain && (host === embedDomain || host.startsWith(embedDomain + ':')));
} 