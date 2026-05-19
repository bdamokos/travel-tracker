export const isSafePublicHttpUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const filterSafePublicLinks = <T extends { url: string }>(links: T[] | undefined | null): T[] | undefined => {
  if (links == null) {
    return undefined;
  }

  return links.filter(link => isSafePublicHttpUrl(link.url));
};
