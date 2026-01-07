import { TripUpdate } from '@/app/types';

type LocationLike = {
  name?: string | null;
};

type RouteLike = {
  from?: string | null;
  to?: string | null;
};

export const filterUpdatesForPublic = (
  updates: TripUpdate[] | undefined,
  locations: LocationLike[],
  routes: RouteLike[]
): TripUpdate[] => {
  if (!updates) return [];

  const allowedNames = new Set<string>();

  locations.forEach(location => {
    if (location?.name) {
      allowedNames.add(location.name);
    }
  });

  routes.forEach(route => {
    if (route?.from) {
      allowedNames.add(route.from);
    }
    if (route?.to) {
      allowedNames.add(route.to);
    }
  });

  const names = Array.from(allowedNames).filter(Boolean);

  if (names.length === 0) {
    return updates.filter(update => update.kind === 'manual');
  }

  return updates.filter(
    update => update.kind === 'manual' || names.some(name => update.message.includes(name))
  );
};

