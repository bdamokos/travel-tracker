import { Location, Transportation, TransportationSegment, Trip } from '@/app/types';

export function isPrivateCalendarLocation(location: Location): boolean {
  return Boolean(location.notes && /\[private\]/i.test(location.notes));
}

export function sanitizeCalendarLocationForPublic(location: Location): Location {
  const publicLocation: Location = {
    id: location.id,
    name: location.name,
    coordinates: location.coordinates,
    date: location.date,
  };

  if (location.endDate !== undefined) publicLocation.endDate = location.endDate;
  if (location.duration !== undefined) publicLocation.duration = location.duration;
  if (location.instagramPosts !== undefined) {
    publicLocation.instagramPosts = location.instagramPosts.map(post => ({
      id: post.id,
      url: post.url,
      caption: post.caption,
    }));
  }
  if (location.tikTokPosts !== undefined) {
    publicLocation.tikTokPosts = location.tikTokPosts.map(post => ({
      id: post.id,
      url: post.url,
      caption: post.caption,
    }));
  }
  if (location.blogPosts !== undefined) {
    publicLocation.blogPosts = location.blogPosts.map(post => ({
      id: post.id,
      title: post.title,
      url: post.url,
      excerpt: post.excerpt,
    }));
  }
  if (location.isAccommodationPublic && location.accommodationData !== undefined) {
    publicLocation.accommodationData = location.accommodationData;
  }
  if (location.wikipediaRef !== undefined) publicLocation.wikipediaRef = location.wikipediaRef;

  return publicLocation;
}

export function sanitizeCalendarRouteForPublic(route: Transportation): Transportation {
  const publicRoute: Transportation = {
    id: route.id,
    type: route.type,
    from: route.from,
    to: route.to,
  };

  if (route.distance !== undefined) publicRoute.distance = route.distance;
  if (route.fromCoordinates !== undefined) publicRoute.fromCoordinates = route.fromCoordinates;
  if (route.toCoordinates !== undefined) publicRoute.toCoordinates = route.toCoordinates;
  if (route.routePoints !== undefined) publicRoute.routePoints = route.routePoints;
  if (route.useManualRoutePoints !== undefined) publicRoute.useManualRoutePoints = route.useManualRoutePoints;
  if (route.isReturn !== undefined) publicRoute.isReturn = route.isReturn;
  if (route.subRoutes !== undefined) {
    publicRoute.subRoutes = route.subRoutes
      .filter(subRoute => !subRoute.privateNotes)
      .map(subRoute => {
        const publicSubRoute: TransportationSegment = {
          id: subRoute.id,
          type: subRoute.type,
          from: subRoute.from,
          to: subRoute.to,
        };

        if (subRoute.distance !== undefined) publicSubRoute.distance = subRoute.distance;
        if (subRoute.fromCoordinates !== undefined) publicSubRoute.fromCoordinates = subRoute.fromCoordinates;
        if (subRoute.toCoordinates !== undefined) publicSubRoute.toCoordinates = subRoute.toCoordinates;
        if (subRoute.routePoints !== undefined) publicSubRoute.routePoints = subRoute.routePoints;
        if (subRoute.useManualRoutePoints !== undefined) {
          publicSubRoute.useManualRoutePoints = subRoute.useManualRoutePoints;
        }
        if (subRoute.isReturn !== undefined) publicSubRoute.isReturn = subRoute.isReturn;

        return publicSubRoute;
      });
  }

  return publicRoute;
}

export function buildPublicCalendarTrip(trip: Trip): Trip {
  return {
    id: trip.id,
    title: trip.title,
    description: trip.description,
    startDate: trip.startDate,
    endDate: trip.endDate,
    isArchived: trip.isArchived,
    locations: trip.locations
      .filter(location => !isPrivateCalendarLocation(location))
      .map(sanitizeCalendarLocationForPublic),
    routes: trip.routes
      .filter(route => !route.privateNotes)
      .map(sanitizeCalendarRouteForPublic),
    accommodations: trip.accommodations
      .filter(accommodation => accommodation.isAccommodationPublic)
      .map(accommodation => ({
        id: accommodation.id,
        name: accommodation.name,
        locationId: accommodation.locationId,
        accommodationData: accommodation.accommodationData,
        createdAt: accommodation.createdAt,
        updatedAt: accommodation.updatedAt,
      })),
  };
}
