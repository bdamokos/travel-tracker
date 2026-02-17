export type InstagramPostSummary = {
  id: string;
  shortcode: string;
  caption: string;
  displayUrl: string;
  takenAt: number | null;
  imageUrls?: string[];
  isCarousel?: boolean;
};

export type InstagramProfileSummary = {
  username: string;
  fullName: string;
  posts: InstagramPostSummary[];
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_SHORTCODE_PREFIX = 'post-';
const INSTAGRAM_RESERVED_PATH_SEGMENTS = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'stories',
  'explore',
  'accounts',
]);

export const INSTAGRAM_USERNAME_PATTERN = /^(?=.{1,30}$)(?!.*\.\.)[A-Za-z0-9_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?$/;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStringValue = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const toNumberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toArrayValue = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const readNestedRecord = (
  source: JsonRecord | null,
  ...keys: string[]
): JsonRecord | null => {
  let current: unknown = source;

  for (const key of keys) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }

  return isRecord(current) ? current : null;
};

const appendUniqueUrl = (urls: string[], candidate: unknown): void => {
  const value = toStringValue(candidate)?.trim();
  if (!value || urls.includes(value)) {
    return;
  }
  urls.push(value);
};

const extractCaptionFromNode = (node: JsonRecord): string => {
  const captionEdges = toArrayValue(
    readNestedRecord(node, 'edge_media_to_caption')?.edges
  );

  for (const edge of captionEdges) {
    if (!isRecord(edge)) {
      continue;
    }
    const text = toStringValue(readNestedRecord(edge, 'node')?.text);
    if (text) {
      return text;
    }
  }

  const captionText = toStringValue(readNestedRecord(node, 'caption')?.text);
  if (captionText) {
    return captionText;
  }

  return toStringValue(node.caption_text) ?? '';
};

const extractOwnerUsername = (node: JsonRecord): string | null => {
  const directOwnerUsername = toStringValue(node.owner_username);
  if (directOwnerUsername) {
    return normalizeInstagramUsername(directOwnerUsername);
  }

  const ownerCandidates = [node.owner, node.user, node.instagram_user];
  for (const candidate of ownerCandidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    const username = toStringValue(candidate.username);
    if (username) {
      return normalizeInstagramUsername(username);
    }
  }

  return null;
};

const extractImageUrls = (node: JsonRecord): { imageUrls: string[]; isCarousel: boolean } => {
  const imageUrls: string[] = [];

  appendUniqueUrl(imageUrls, node.display_url);
  appendUniqueUrl(imageUrls, node.thumbnail_src);
  appendUniqueUrl(imageUrls, node.src);

  const displayResources = toArrayValue(node.display_resources);
  for (const item of displayResources) {
    if (!isRecord(item)) {
      continue;
    }
    appendUniqueUrl(imageUrls, item.src);
  }

  const imageCandidates = toArrayValue(readNestedRecord(node, 'image_versions2')?.candidates);
  for (const item of imageCandidates) {
    if (!isRecord(item)) {
      continue;
    }
    appendUniqueUrl(imageUrls, item.url);
  }

  const genericCandidates = toArrayValue(node.candidates);
  for (const item of genericCandidates) {
    if (!isRecord(item)) {
      continue;
    }
    appendUniqueUrl(imageUrls, item.url);
  }

  const sidecarEdges = toArrayValue(readNestedRecord(node, 'edge_sidecar_to_children')?.edges);
  for (const edge of sidecarEdges) {
    const sidecarNode = isRecord(edge) ? readNestedRecord(edge, 'node') : null;
    if (!sidecarNode) {
      continue;
    }
    appendUniqueUrl(imageUrls, sidecarNode.display_url);
    appendUniqueUrl(imageUrls, sidecarNode.thumbnail_src);
    appendUniqueUrl(imageUrls, sidecarNode.src);
  }

  const carouselMedia = toArrayValue(node.carousel_media);
  for (const mediaItem of carouselMedia) {
    if (!isRecord(mediaItem)) {
      continue;
    }
    appendUniqueUrl(imageUrls, mediaItem.display_url);
    appendUniqueUrl(imageUrls, mediaItem.thumbnail_src);
    appendUniqueUrl(imageUrls, mediaItem.src);
  }

  const typename = toStringValue(node.__typename);
  const isCarousel =
    typename === 'GraphSidecar' ||
    Boolean(node.is_carousel_container) ||
    sidecarEdges.length > 0 ||
    carouselMedia.length > 0;

  return { imageUrls, isCarousel };
};

type ParsedInstagramPost = {
  post: InstagramPostSummary;
  ownerUsername: string | null;
  imageCount: number;
  captionLength: number;
};

const parseInstagramPostNode = (node: JsonRecord): ParsedInstagramPost | null => {
  const shortcode = toStringValue(node.shortcode) ?? toStringValue(node.code);
  if (!shortcode) {
    return null;
  }

  const idCandidate = toStringValue(node.id) ?? toStringValue(node.pk);
  const id = idCandidate || `${DEFAULT_SHORTCODE_PREFIX}${shortcode}`;
  const takenAt =
    toNumberValue(node.taken_at_timestamp) ??
    toNumberValue(node.taken_at) ??
    toNumberValue(node.date);

  const caption = extractCaptionFromNode(node);
  const { imageUrls, isCarousel } = extractImageUrls(node);
  const displayUrl = imageUrls[0] ?? '';

  return {
    post: {
      id,
      shortcode,
      caption,
      displayUrl,
      takenAt,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      isCarousel,
    },
    ownerUsername: extractOwnerUsername(node),
    imageCount: imageUrls.length,
    captionLength: caption.trim().length,
  };
};

const collectMediaNodesFromPayload = (payload: unknown): JsonRecord[] => {
  const nodes: JsonRecord[] = [];

  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    if (typeof value.shortcode === 'string' || typeof value.code === 'string') {
      nodes.push(value);
    }

    const edges = toArrayValue(value.edges);
    for (const edge of edges) {
      if (!isRecord(edge)) {
        continue;
      }
      const edgeNode = readNestedRecord(edge, 'node');
      if (edgeNode) {
        nodes.push(edgeNode);
      }
    }

    const items = toArrayValue(value.items);
    for (const item of items) {
      if (isRecord(item)) {
        nodes.push(item);
      }
    }

    Object.values(value).forEach(walk);
  };

  walk(payload);
  return nodes;
};

const comparePostRank = (left: ParsedInstagramPost, right: ParsedInstagramPost): number => {
  const leftTimestamp = left.post.takenAt ?? 0;
  const rightTimestamp = right.post.takenAt ?? 0;
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  if (left.imageCount !== right.imageCount) {
    return left.imageCount - right.imageCount;
  }

  if (left.captionLength !== right.captionLength) {
    return left.captionLength - right.captionLength;
  }

  return 0;
};

export const normalizeInstagramUsername = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (!withoutAt.includes('/')) {
    return withoutAt;
  }

  const parseFromPath = (pathValue: string): string => {
    const segments = pathValue
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return '';
    }

    const firstSegment = segments[0].toLowerCase();
    if (!INSTAGRAM_RESERVED_PATH_SEGMENTS.has(firstSegment)) {
      return segments[0];
    }

    return segments[segments.length - 1];
  };

  const urlInput = withoutAt.startsWith('http') ? withoutAt : `https://${withoutAt}`;
  try {
    const parsed = new URL(urlInput);
    if (!parsed.hostname.toLowerCase().includes('instagram.com')) {
      return withoutAt;
    }
    return parseFromPath(parsed.pathname);
  } catch {
    return parseFromPath(withoutAt);
  }
};

export const isValidInstagramUsername = (username: string): boolean =>
  INSTAGRAM_USERNAME_PATTERN.test(username);

export const payloadRequiresInstagramLogin = (payload: unknown): boolean => {
  if (!isRecord(payload)) {
    return false;
  }

  if (payload.require_login === true) {
    return true;
  }

  const status = toStringValue(payload.status)?.toLowerCase() ?? '';
  const message = toStringValue(payload.message)?.toLowerCase() ?? '';

  if (status !== 'fail' && status !== 'error') {
    return false;
  }

  return (
    message.includes('log in') ||
    message.includes('login') ||
    message.includes('session') ||
    message.includes('checkpoint')
  );
};

export const extractInstagramProfileSummary = (
  payload: unknown,
  expectedUsername: string
): InstagramProfileSummary | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const payloadUser = readNestedRecord(payload, 'data', 'user');
  const fallbackUsername = normalizeInstagramUsername(expectedUsername);
  const username = toStringValue(payloadUser?.username) ?? fallbackUsername;
  const fullName = toStringValue(payloadUser?.full_name) ?? '';

  const nodesFromTimeline = toArrayValue(
    readNestedRecord(payloadUser, 'edge_owner_to_timeline_media')?.edges
  )
    .map((edge) => (isRecord(edge) ? readNestedRecord(edge, 'node') : null))
    .filter((node): node is JsonRecord => Boolean(node));

  const nodes = [...nodesFromTimeline, ...collectMediaNodesFromPayload(payload)];
  if (nodes.length === 0) {
    return { username, fullName, posts: [] };
  }

  const parsedPosts = nodes
    .map(parseInstagramPostNode)
    .filter((value): value is ParsedInstagramPost => Boolean(value));

  const normalizedExpected = fallbackUsername.toLowerCase();
  let sourcePosts = parsedPosts;
  if (normalizedExpected) {
    const ownerMatched = parsedPosts.filter(
      (post) => (post.ownerUsername ?? '').toLowerCase() === normalizedExpected
    );
    const ownerUnknown = parsedPosts.filter((post) => !post.ownerUsername);
    sourcePosts = ownerMatched.length > 0 ? ownerMatched : ownerUnknown;
  }

  const dedupedByShortcode = new Map<string, ParsedInstagramPost>();
  for (const parsedPost of sourcePosts) {
    const key = parsedPost.post.shortcode;
    const existing = dedupedByShortcode.get(key);
    if (!existing || comparePostRank(parsedPost, existing) > 0) {
      dedupedByShortcode.set(key, parsedPost);
    }
  }

  const posts = Array.from(dedupedByShortcode.values())
    .sort((left, right) => comparePostRank(right, left))
    .map(({ post }) => post);

  return { username, fullName, posts };
};

export const buildInstagramCookieHeaderFromEnv = (): string | undefined => {
  const readFirst = (...envKeys: string[]): string | undefined => {
    for (const key of envKeys) {
      const candidate = process.env[key]?.trim();
      if (candidate) {
        return candidate;
      }
    }
    return undefined;
  };

  const cookieEntries: string[] = [];

  const sessionId = readFirst('INSTAGRAM_SESSIONID', 'IG_SESSIONID', 'IG_SESSION_ID');
  if (sessionId) {
    cookieEntries.push(`sessionid=${sessionId}`);
  }

  const csrfToken = readFirst('INSTAGRAM_CSRFTOKEN', 'IG_CSRFTOKEN');
  if (csrfToken) {
    cookieEntries.push(`csrftoken=${csrfToken}`);
  }

  const userId = readFirst('INSTAGRAM_DS_USER_ID', 'IG_DS_USER_ID');
  if (userId) {
    cookieEntries.push(`ds_user_id=${userId}`);
  }

  return cookieEntries.length > 0 ? cookieEntries.join('; ') : undefined;
};
