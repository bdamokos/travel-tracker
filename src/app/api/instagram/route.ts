import { NextRequest, NextResponse } from 'next/server';

type InstagramPostSummary = {
  id: string;
  shortcode: string;
  caption: string;
  displayUrl: string;
  takenAt: number | null;
};

const INSTAGRAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'application/json',
  'X-Requested-With': 'XMLHttpRequest'
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const instagramAppId = process.env.INSTAGRAM_APP_ID;

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  if (!instagramAppId) {
    return NextResponse.json({ error: 'Instagram app ID is not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          ...INSTAGRAM_HEADERS,
          'X-IG-App-ID': instagramAppId,
          Referer: `https://www.instagram.com/${username}/`
        },
        next: { revalidate: 600 }
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch Instagram profile', status: response.status },
        { status: response.status }
      );
    }

    const payload = await response.json();
    const edges = payload?.data?.user?.edge_owner_to_timeline_media?.edges ?? [];
    const posts: InstagramPostSummary[] = edges.map((edge: { node?: Record<string, unknown> }) => {
      const node = edge?.node ?? {};
      const captionEdges = (node as { edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> } })
        ?.edge_media_to_caption?.edges;
      const caption = captionEdges?.[0]?.node?.text ?? '';

      return {
        id: (node as { id?: string }).id || '',
        shortcode: (node as { shortcode?: string }).shortcode || '',
        caption,
        displayUrl: (node as { display_url?: string }).display_url || '',
        takenAt: (node as { taken_at_timestamp?: number }).taken_at_timestamp ?? null
      };
    }).filter(post => post.id && post.shortcode);

    return NextResponse.json(
      {
        username: payload?.data?.user?.username || username,
        fullName: payload?.data?.user?.full_name || '',
        posts
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=300'
        }
      }
    );
  } catch (error) {
    console.error('Error fetching Instagram profile:', error);
    return NextResponse.json({ error: 'Failed to fetch Instagram profile' }, { status: 500 });
  }
}
