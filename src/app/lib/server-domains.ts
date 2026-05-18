import { headers } from 'next/headers';

export async function getCurrentDomain(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  const protocol = headersList.get('x-forwarded-proto') || 'http';
  
  return `${protocol}://${host}`;
}

function normalizeConfiguredHost(host: string): string {
  return host.replace(/^https?:\/\//, '').toLowerCase().replace(/\.$/, '');
}

function hostMatchesConfiguredHost(host: string, configuredHost: string): boolean {
  if (host === configuredHost) {
    return true;
  }

  if (configuredHost.includes(':')) {
    return false;
  }

  return new RegExp(`^${configuredHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\d+$`).test(host);
}

export function isAdminHost(host: string | null): boolean {
  if (!host) {
    return false;
  }

  // Use environment variable for admin domain
  const adminDomain = process.env.ADMIN_DOMAIN ? normalizeConfiguredHost(process.env.ADMIN_DOMAIN) : undefined;
  const normalizedHost = host.toLowerCase().replace(/\.$/, '');

  return Boolean(
    (adminDomain && hostMatchesConfiguredHost(normalizedHost, adminDomain)) ||
    (process.env.NODE_ENV !== 'production' && hostMatchesConfiguredHost(normalizedHost, 'localhost'))
  );
}

export async function isAdminDomain(): Promise<boolean> {
  const headersList = await headers();
  const host = headersList.get('host') || '';

  return isAdminHost(host);
}

export async function isEmbedDomain(): Promise<boolean> {
  const headersList = await headers();
  const host = headersList.get('host') || '';
  
  // Use environment variable for embed domain
  const embedDomain = process.env.EMBED_DOMAIN?.replace(/^https?:\/\//, '');
  
  return Boolean(embedDomain && (host === embedDomain || host.startsWith(embedDomain + ':')));
} 
