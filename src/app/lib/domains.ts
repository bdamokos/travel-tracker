export interface DomainConfig {
  adminDomain: string;
  embedDomain: string;
  isProduction: boolean;
}

export function getDomainConfig(): DomainConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    adminDomain: process.env.NEXT_PUBLIC_ADMIN_DOMAIN || (isProduction ? 'https://tt-admin.bdamokos.org' : 'http://localhost:3000'),
    embedDomain: process.env.NEXT_PUBLIC_EMBED_DOMAIN || (isProduction ? 'https://travel-tracker.bdamokos.org' : 'http://localhost:3000'),
    isProduction,
  };
}

export function getEmbedUrl(mapId: string): string {
  const config = getDomainConfig();
  return `${config.embedDomain}/embed/${mapId}`;
}

export function getMapUrl(mapId: string): string {
  const config = getDomainConfig();
  return `${config.embedDomain}/map/${mapId}`;
}

export function getAdminUrl(): string {
  const config = getDomainConfig();
  return config.adminDomain;
}

// Client-side utilities
export function getClientDomainConfig(): DomainConfig {
  if (typeof window === 'undefined') {
    return getDomainConfig();
  }
  
  const isProduction = process.env.NODE_ENV === 'production';
  const currentHost = window.location.host;
  
  return {
    adminDomain: process.env.NEXT_PUBLIC_ADMIN_DOMAIN || (isProduction ? 'https://tt-admin.bdamokos.org' : `${window.location.protocol}//${currentHost}`),
    embedDomain: process.env.NEXT_PUBLIC_EMBED_DOMAIN || (isProduction ? 'https://travel-tracker.bdamokos.org' : `${window.location.protocol}//${currentHost}`),
    isProduction,
  };
}

export function getClientEmbedUrl(mapId: string): string {
  const config = getClientDomainConfig();
  return `${config.embedDomain}/embed/${mapId}`;
} 