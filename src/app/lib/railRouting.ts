import type { Transportation } from '@/app/types';

type Coordinate = [number, number];

type OverpassNode = {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
};

type OverpassWay = {
  type: 'way';
  id: number;
  nodes?: number[];
  tags?: Record<string, string>;
};

type OverpassOther = {
  type: string;
  id: number;
  [key: string]: unknown;
};

type OverpassElement = OverpassNode | OverpassWay | OverpassOther;

type OverpassResponse = {
  elements?: OverpassElement[];
};

type Edge = {
  to: number;
  weight: number;
};

type NodeEntry = {
  id: number;
  point: Coordinate;
};

type QueueItem = {
  id: number;
  distance: number;
};

const EARTH_RADIUS_METERS = 6371000;
const SEARCH_PADDING_DEGREES = [0.08, 0.2, 0.5];
const MAX_SNAP_DISTANCE_METERS = 30000;
const FETCH_TIMEOUT_MS = 18000;
const SIMPLIFY_TOLERANCE_METERS = 20;
const MAX_ROUTE_POINTS = 600;

const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

const getOverpassEndpoints = (): string[] => {
  const configured = (
    process.env.NEXT_PUBLIC_RAIL_OVERPASS_ENDPOINTS ??
    process.env.RAIL_OVERPASS_ENDPOINTS ??
    ''
  )
    .split(',')
    .map((endpoint) => endpoint.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return configured;
  }

  return DEFAULT_OVERPASS_ENDPOINTS;
};

const toRadians = (degrees: number): number => degrees * (Math.PI / 180);

const haversineDistanceMeters = (from: Coordinate, to: Coordinate): number => {
  const [fromLat, fromLon] = from;
  const [toLat, toLon] = to;
  const dLat = toRadians(toLat - fromLat);
  const dLon = toRadians(toLon - fromLon);
  const fromLatRad = toRadians(fromLat);
  const toLatRad = toRadians(toLat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
};

const getBoundingBox = (
  from: Coordinate,
  to: Coordinate,
  padding: number
): { south: number; west: number; north: number; east: number } => {
  const south = Math.min(from[0], to[0]) - padding;
  const north = Math.max(from[0], to[0]) + padding;
  const west = Math.min(from[1], to[1]) - padding;
  const east = Math.max(from[1], to[1]) + padding;

  return { south, west, north, east };
};

const getRailwayRegex = (transportType: Transportation['type']): string => {
  if (transportType === 'metro') {
    return 'subway|light_rail|tram|monorail|funicular|rail|narrow_gauge';
  }

  return 'rail|narrow_gauge|light_rail|subway|monorail|funicular';
};

const buildOverpassQuery = (
  from: Coordinate,
  to: Coordinate,
  transportType: Transportation['type'],
  padding: number
): string => {
  const { south, west, north, east } = getBoundingBox(from, to, padding);
  const railwayRegex = getRailwayRegex(transportType);

  return `
[out:json][timeout:25];
(
  way["railway"~"${railwayRegex}"]["railway"!~"abandoned|construction|disused|proposed|razed"](${south},${west},${north},${east});
);
(._;>;);
out body;
`.trim();
};

const fetchOverpass = async (query: string): Promise<OverpassResponse> => {
  let lastError: unknown;

  for (const endpoint of getOverpassEndpoints()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: query,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Overpass API error ${response.status} at ${endpoint}`);
      }

      const data = (await response.json()) as OverpassResponse;
      return data;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error('No Overpass endpoint available');
};

const buildRailGraph = (
  data: OverpassResponse
): { nodes: Map<number, Coordinate>; edges: Map<number, Edge[]> } => {
  const nodes = new Map<number, Coordinate>();
  const ways: OverpassWay[] = [];

  const isNode = (element: OverpassElement): element is OverpassNode => {
    return (
      element.type === 'node' &&
      typeof (element as OverpassNode).lat === 'number' &&
      typeof (element as OverpassNode).lon === 'number'
    );
  };

  const isWay = (element: OverpassElement): element is OverpassWay => {
    return element.type === 'way' && Array.isArray((element as OverpassWay).nodes);
  };

  for (const element of data.elements ?? []) {
    if (isNode(element)) {
      nodes.set(element.id, [element.lat, element.lon]);
      continue;
    }

    if (isWay(element)) {
      ways.push(element);
    }
  }

  const edges = new Map<number, Edge[]>();

  const addEdge = (fromId: number, toId: number, weight: number) => {
    if (!edges.has(fromId)) {
      edges.set(fromId, []);
    }

    edges.get(fromId)!.push({ to: toId, weight });
  };

  for (const way of ways) {
    const nodeIds = way.nodes ?? [];
    for (let index = 0; index < nodeIds.length - 1; index += 1) {
      const fromId = nodeIds[index];
      const toId = nodeIds[index + 1];
      const fromPoint = nodes.get(fromId);
      const toPoint = nodes.get(toId);

      if (!fromPoint || !toPoint) {
        continue;
      }

      const weight = haversineDistanceMeters(fromPoint, toPoint);
      addEdge(fromId, toId, weight);
      addEdge(toId, fromId, weight);
    }
  }

  return { nodes, edges };
};

const findClosestNode = (
  target: Coordinate,
  nodes: Map<number, Coordinate>
): NodeEntry | null => {
  let best: NodeEntry | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  nodes.forEach((point, id) => {
    const distance = haversineDistanceMeters(target, point);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { id, point };
    }
  });

  return best;
};

class MinHeap {
  private readonly values: QueueItem[] = [];

  public push(item: QueueItem): void {
    this.values.push(item);
    this.bubbleUp(this.values.length - 1);
  }

  public pop(): QueueItem | undefined {
    if (this.values.length === 0) {
      return undefined;
    }

    const first = this.values[0];
    const last = this.values.pop()!;
    if (this.values.length > 0) {
      this.values[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  public get length(): number {
    return this.values.length;
  }

  private bubbleUp(startIndex: number): void {
    let index = startIndex;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.values[parentIndex].distance <= this.values[index].distance) {
        break;
      }
      [this.values[parentIndex], this.values[index]] = [this.values[index], this.values[parentIndex]];
      index = parentIndex;
    }
  }

  private bubbleDown(startIndex: number): void {
    let index = startIndex;
    const length = this.values.length;

    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < length && this.values[left].distance < this.values[smallest].distance) {
        smallest = left;
      }

      if (right < length && this.values[right].distance < this.values[smallest].distance) {
        smallest = right;
      }

      if (smallest === index) {
        break;
      }

      [this.values[index], this.values[smallest]] = [this.values[smallest], this.values[index]];
      index = smallest;
    }
  }
}

const findShortestPathNodeIds = (
  startId: number,
  endId: number,
  edges: Map<number, Edge[]>
): number[] | null => {
  const distances = new Map<number, number>();
  const previous = new Map<number, number>();
  const queue = new MinHeap();
  const visited = new Set<number>();

  distances.set(startId, 0);
  queue.push({ id: startId, distance: 0 });

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || visited.has(current.id)) {
      continue;
    }

    visited.add(current.id);

    if (current.id === endId) {
      break;
    }

    for (const edge of edges.get(current.id) ?? []) {
      if (visited.has(edge.to)) {
        continue;
      }

      const currentDistance = distances.get(current.id) ?? Number.POSITIVE_INFINITY;
      const candidateDistance = currentDistance + edge.weight;
      const knownDistance = distances.get(edge.to) ?? Number.POSITIVE_INFINITY;

      if (candidateDistance < knownDistance) {
        distances.set(edge.to, candidateDistance);
        previous.set(edge.to, current.id);
        queue.push({ id: edge.to, distance: candidateDistance });
      }
    }
  }

  if (!distances.has(endId)) {
    return null;
  }

  const path: number[] = [];
  let cursor: number | undefined = endId;

  while (cursor !== undefined) {
    path.push(cursor);
    cursor = previous.get(cursor);
  }

  path.reverse();
  return path;
};

const ensureEndpoints = (
  from: Coordinate,
  to: Coordinate,
  pathPoints: Coordinate[]
): Coordinate[] => {
  if (pathPoints.length === 0) {
    return [from, to];
  }

  const points: Coordinate[] = [...pathPoints];
  const first = points[0];
  const last = points[points.length - 1];

  if (first[0] !== from[0] || first[1] !== from[1]) {
    points.unshift(from);
  }

  if (last[0] !== to[0] || last[1] !== to[1]) {
    points.push(to);
  }

  return points;
};

const pointToSegmentDistanceMeters = (
  point: Coordinate,
  segmentStart: Coordinate,
  segmentEnd: Coordinate
): number => {
  const [pointLat, pointLon] = point;
  const [startLat, startLon] = segmentStart;
  const [endLat, endLon] = segmentEnd;

  const scale = Math.cos(toRadians((startLat + endLat + pointLat) / 3));
  const pointX = pointLon * scale;
  const startX = startLon * scale;
  const endX = endLon * scale;

  const pointY = pointLat;
  const startY = startLat;
  const endY = endLat;

  const dx = endX - startX;
  const dy = endY - startY;

  if (dx === 0 && dy === 0) {
    return haversineDistanceMeters(point, segmentStart);
  }

  const t = Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / (dx * dx + dy * dy)));
  const projected: Coordinate = [startY + t * dy, (startX + t * dx) / scale];
  return haversineDistanceMeters(point, projected);
};

const simplifyPolyline = (points: Coordinate[], toleranceMeters: number): Coordinate[] => {
  if (points.length <= 2) {
    return points;
  }

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop()!;
    let maxDistance = -1;
    let splitIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = pointToSegmentDistanceMeters(points[index], points[startIndex], points[endIndex]);
      if (distance > maxDistance) {
        maxDistance = distance;
        splitIndex = index;
      }
    }

    if (maxDistance > toleranceMeters && splitIndex !== -1) {
      keep[splitIndex] = true;
      stack.push([startIndex, splitIndex], [splitIndex, endIndex]);
    }
  }

  return points.filter((_, index) => keep[index]);
};

const downsamplePath = (points: Coordinate[], maxPoints: number): Coordinate[] => {
  if (points.length <= maxPoints) {
    return points;
  }

  const sampled: Coordinate[] = [];
  const stride = (points.length - 1) / (maxPoints - 1);

  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(index * stride);
    sampled.push(points[sourceIndex]);
  }

  sampled[0] = points[0];
  sampled[sampled.length - 1] = points[points.length - 1];
  return sampled;
};

export const generateRailRoutePoints = async (
  fromCoordinates: Coordinate,
  toCoordinates: Coordinate,
  transportType: Transportation['type']
): Promise<Coordinate[] | null> => {
  for (const padding of SEARCH_PADDING_DEGREES) {
    try {
      const query = buildOverpassQuery(fromCoordinates, toCoordinates, transportType, padding);
      const data = await fetchOverpass(query);
      const { nodes, edges } = buildRailGraph(data);

      if (nodes.size === 0 || edges.size === 0) {
        continue;
      }

      const startNode = findClosestNode(fromCoordinates, nodes);
      const endNode = findClosestNode(toCoordinates, nodes);

      if (!startNode || !endNode) {
        continue;
      }

      const startSnapDistance = haversineDistanceMeters(fromCoordinates, startNode.point);
      const endSnapDistance = haversineDistanceMeters(toCoordinates, endNode.point);

      if (startSnapDistance > MAX_SNAP_DISTANCE_METERS || endSnapDistance > MAX_SNAP_DISTANCE_METERS) {
        continue;
      }

      const pathNodeIds = findShortestPathNodeIds(startNode.id, endNode.id, edges);
      if (!pathNodeIds || pathNodeIds.length < 2) {
        continue;
      }

      const pathPoints = pathNodeIds
        .map((nodeId) => nodes.get(nodeId))
        .filter((point): point is Coordinate => Boolean(point));

      if (pathPoints.length < 2) {
        continue;
      }

      const simplified = simplifyPolyline(pathPoints, SIMPLIFY_TOLERANCE_METERS);
      const withEndpoints = ensureEndpoints(fromCoordinates, toCoordinates, simplified);
      return downsamplePath(withEndpoints, MAX_ROUTE_POINTS);
    } catch (error) {
      console.warn('[railRouting] Failed to generate OSM rail route:', error);
    }
  }

  return null;
};
