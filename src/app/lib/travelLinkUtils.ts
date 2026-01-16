import type { TravelReference } from '@/app/types';
import type { TravelLinkInfo } from '@/app/lib/expenseTravelLookup';

export const buildTravelReference = (linkInfo?: TravelLinkInfo): TravelReference | undefined => {
  if (!linkInfo) {
    return undefined;
  }

  const reference: TravelReference = {
    type: linkInfo.type,
    description: linkInfo.name
  };

  if (linkInfo.type === 'location') {
    reference.locationId = linkInfo.id;
  } else if (linkInfo.type === 'accommodation') {
    reference.accommodationId = linkInfo.id;
  } else if (linkInfo.type === 'route') {
    reference.routeId = linkInfo.id;
  }

  return reference;
};
