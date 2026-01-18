'use client';

import React, { useEffect, useId, useState } from 'react';
import { Location } from '@/app/types';

const updatePost = <T extends { id: string }>(
  posts: T[] | undefined,
  postId: string,
  updates: Partial<T>
): T[] | undefined => posts?.map(post => (post.id === postId ? { ...post, ...updates } : post));

type InstagramPost = NonNullable<Location['instagramPosts']>[number];
type TikTokPost = NonNullable<Location['tikTokPosts']>[number];
type BlogPost = NonNullable<Location['blogPosts']>[number];

type MediaPostUpdateHandler = (postId: string, updates: Partial<{ url: string; caption: string }>) => void;

type InstagramImportPost = {
  id: string;
  shortcode: string;
  caption: string;
  displayUrl: string;
};

interface MediaPostItemProps {
  post: { id: string; url: string; caption?: string };
  onUpdate: MediaPostUpdateHandler;
  onRemove: (postId: string) => void;
  urlPlaceholder: string;
  linkColorClassName: string;
}

const MediaPostItem = ({ post, onUpdate, onRemove, urlPlaceholder, linkColorClassName }: MediaPostItemProps) => {
  const [url, setUrl] = useState(post.url);
  const [caption, setCaption] = useState(post.caption || '');

  useEffect(() => {
    setUrl(post.url);
  }, [post.url]);

  useEffect(() => {
    setCaption(post.caption || '');
  }, [post.caption]);

  const handleUrlBlur = () => {
    if (url !== post.url) {
      onUpdate(post.id, { url });
    }
  };

  const handleCaptionBlur = () => {
    if (caption !== (post.caption || '')) {
      onUpdate(post.id, { caption });
    }
  };

  return (
    <div className="bg-white p-2 rounded-sm text-sm space-y-2">
      <div className="flex gap-2 items-center">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={handleUrlBlur}
          className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
          placeholder={urlPlaceholder}
        />
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkColorClassName} hover:underline whitespace-nowrap`}
        >
          Open
        </a>
        <button onClick={() => onRemove(post.id)} className="text-red-500 hover:text-red-700 ml-2">
          ×
        </button>
      </div>
      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={handleCaptionBlur}
        className="w-full px-2 py-1 border border-gray-300 rounded-sm text-sm"
        placeholder="Caption (optional)"
      />
    </div>
  );
};

interface InstagramPostItemProps {
  post: InstagramPost;
  onUpdate: MediaPostUpdateHandler;
  onRemove: (postId: string) => void;
}

const InstagramPostItem = ({ post, onUpdate, onRemove }: InstagramPostItemProps) => (
  <MediaPostItem
    post={post}
    onUpdate={onUpdate}
    onRemove={onRemove}
    urlPlaceholder="Instagram post URL"
    linkColorClassName="text-blue-500"
  />
);

interface TikTokPostItemProps {
  post: TikTokPost;
  onUpdate: MediaPostUpdateHandler;
  onRemove: (postId: string) => void;
}

const TikTokPostItem = ({ post, onUpdate, onRemove }: TikTokPostItemProps) => (
  <MediaPostItem
    post={post}
    onUpdate={onUpdate}
    onRemove={onRemove}
    urlPlaceholder="TikTok post URL"
    linkColorClassName="text-purple-600"
  />
);

interface BlogPostItemProps {
  post: BlogPost;
  onUpdate: (postId: string, updates: Partial<{ title: string; url: string; excerpt: string }>) => void;
  onRemove: (postId: string) => void;
}

const BlogPostItem = ({ post, onUpdate, onRemove }: BlogPostItemProps) => {
  const [title, setTitle] = useState(post.title);
  const [url, setUrl] = useState(post.url);
  const [excerpt, setExcerpt] = useState(post.excerpt || '');

  useEffect(() => {
    setTitle(post.title);
  }, [post.title]);

  useEffect(() => {
    setUrl(post.url);
  }, [post.url]);

  useEffect(() => {
    setExcerpt(post.excerpt || '');
  }, [post.excerpt]);

  const handleTitleBlur = () => {
    if (title !== post.title) {
      onUpdate(post.id, { title });
    }
  };

  const handleUrlBlur = () => {
    if (url !== post.url) {
      onUpdate(post.id, { url });
    }
  };

  const handleExcerptBlur = () => {
    if (excerpt !== (post.excerpt || '')) {
      onUpdate(post.id, { excerpt });
    }
  };

  return (
    <div className="bg-white p-2 rounded-sm text-sm space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          className="w-full px-2 py-1 border border-gray-300 rounded-sm text-sm"
          placeholder="Post title"
        />
        <div className="flex gap-2 items-center">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={handleUrlBlur}
            className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
            placeholder="Blog post URL"
          />
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline whitespace-nowrap"
          >
            Open
          </a>
          <button onClick={() => onRemove(post.id)} className="text-red-500 hover:text-red-700 ml-2">
            ×
          </button>
        </div>
      </div>
      <input
        type="text"
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        onBlur={handleExcerptBlur}
        className="w-full px-2 py-1 border border-gray-300 rounded-sm text-sm"
        placeholder="Excerpt (optional)"
      />
    </div>
  );
};

interface LocationPostsProps {
  location: Location;
  isVisible: boolean;
  instagramUsername?: string;
  newInstagramPost: Partial<{ url: string; caption: string }>;
  setNewInstagramPost: React.Dispatch<React.SetStateAction<Partial<{ url: string; caption: string }>>>;
  newTikTokPost: Partial<{ url: string; caption: string }>;
  setNewTikTokPost: React.Dispatch<React.SetStateAction<Partial<{ url: string; caption: string }>>>;
  newBlogPost: Partial<{ title: string; url: string; excerpt: string }>;
  setNewBlogPost: React.Dispatch<React.SetStateAction<Partial<{ title: string; url: string; excerpt: string }>>>;
  onLocationUpdate: (updatedLocation: Location) => void;
  onAddInstagramPost: () => void;
  onAddTikTokPost: () => void;
  onAddBlogPost: () => void;
}

export default function LocationPosts({
  location,
  isVisible,
  instagramUsername,
  newInstagramPost,
  setNewInstagramPost,
  newTikTokPost,
  setNewTikTokPost,
  newBlogPost,
  setNewBlogPost,
  onLocationUpdate,
  onAddInstagramPost,
  onAddTikTokPost,
  onAddBlogPost,
}: LocationPostsProps) {
  const [instagramPosts, setInstagramPosts] = useState<InstagramImportPost[]>([]);
  const [instagramLoading, setInstagramLoading] = useState(false);
  const [instagramError, setInstagramError] = useState<string | null>(null);
  const [selectedInstagramId, setSelectedInstagramId] = useState('');
  const id = useId();

  useEffect(() => {
    setSelectedInstagramId('');
    setInstagramError(null);
  }, [location.id]);

  useEffect(() => {
    setInstagramPosts([]);
    setSelectedInstagramId('');
    setInstagramError(null);
  }, [instagramUsername]);

  if (!isVisible) {
    return null;
  }

  const handleRemoveInstagramPost = (postId: string) => {
    const updatedLocation = {
      ...location,
      instagramPosts: location.instagramPosts?.filter(p => p.id !== postId),
    };
    onLocationUpdate(updatedLocation);
  };

  const handleUpdateInstagramPost = (postId: string, updates: Partial<{ url: string; caption: string }>) => {
    const updatedLocation = {
      ...location,
      instagramPosts: updatePost(location.instagramPosts, postId, updates),
    };
    onLocationUpdate(updatedLocation);
  };

  const handleRemoveTikTokPost = (postId: string) => {
    const updatedLocation = {
      ...location,
      tikTokPosts: location.tikTokPosts?.filter(p => p.id !== postId),
    };
    onLocationUpdate(updatedLocation);
  };

  const handleUpdateTikTokPost = (postId: string, updates: Partial<{ url: string; caption: string }>) => {
    const updatedLocation = {
      ...location,
      tikTokPosts: updatePost(location.tikTokPosts, postId, updates),
    };
    onLocationUpdate(updatedLocation);
  };

  const handleRemoveBlogPost = (postId: string) => {
    const updatedLocation = {
      ...location,
      blogPosts: location.blogPosts?.filter(p => p.id !== postId),
    };
    onLocationUpdate(updatedLocation);
  };

  const handleUpdateBlogPost = (
    postId: string,
    updates: Partial<{ title: string; url: string; excerpt: string }>
  ) => {
    const updatedLocation = {
      ...location,
      blogPosts: updatePost(location.blogPosts, postId, updates),
    };
    onLocationUpdate(updatedLocation);
  };

  const loadInstagramPosts = async () => {
    if (!instagramUsername) {
      setInstagramError('Set a global Instagram username to import posts.');
      return;
    }

    setInstagramLoading(true);
    setInstagramError(null);

    try {
      const response = await fetch(`/api/instagram?username=${encodeURIComponent(instagramUsername)}`);
      if (!response.ok) {
        setInstagramError(`Unable to load posts (status ${response.status}).`);
        setInstagramPosts([]);
        return;
      }

      const payload = await response.json();
      const posts = (payload?.posts as InstagramImportPost[]) || [];
      setInstagramPosts(posts);
    } catch (error) {
      console.error('Failed to load Instagram posts:', error);
      setInstagramError('Unable to load Instagram posts.');
      setInstagramPosts([]);
    } finally {
      setInstagramLoading(false);
    }
  };

  const handleImportChange = (postId: string) => {
    setSelectedInstagramId(postId);
    const post = instagramPosts.find(item => item.id === postId);
    if (!post) {
      return;
    }
    setNewInstagramPost({
      url: `https://www.instagram.com/p/${post.shortcode}/`,
      caption: post.caption || ''
    });
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
      <h6 className="font-medium mb-4 text-gray-900 dark:text-white">Instagram, TikTok & Blog Posts</h6>
      
      {/* Instagram Posts */}
      <div className="mb-4">
        <label htmlFor={`${id}-instagram-import`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Instagram Posts</label>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <select
            id={`${id}-instagram-import`}
            value={selectedInstagramId}
            onChange={(e) => handleImportChange(e.target.value)}
            className="min-w-[220px] flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
            disabled={instagramLoading || !instagramUsername}
          >
            <option value="">
              {instagramUsername ? 'Import latest Instagram post…' : 'Set Instagram username first'}
            </option>
            {instagramPosts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.caption ? `${post.caption.slice(0, 80)}${post.caption.length > 80 ? '…' : ''}` : post.shortcode}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadInstagramPosts}
            disabled={!instagramUsername || instagramLoading}
            className="px-3 py-1 bg-gray-200 text-gray-800 rounded-sm text-sm hover:bg-gray-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {instagramLoading ? 'Loading…' : 'Refresh'}
          </button>
          {instagramUsername && (
            <span className="text-xs text-gray-500 dark:text-gray-400">Using @{instagramUsername}</span>
          )}
        </div>
        {instagramError && (
          <p className="text-xs text-red-600 mb-2">{instagramError}</p>
        )}
        <div className="flex gap-2 mb-2">
          <input
            type="url"
            value={newInstagramPost.url || ''}
            onChange={(e) => setNewInstagramPost(prev => ({ ...prev, url: e.target.value }))}
            className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
            placeholder="Instagram post URL"
            aria-label="Instagram post URL"
          />
          <input
            type="text"
            value={newInstagramPost.caption || ''}
            onChange={(e) => setNewInstagramPost(prev => ({ ...prev, caption: e.target.value }))}
            className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
            placeholder="Caption (optional)"
            aria-label="Instagram caption"
          />
          <button
            onClick={onAddInstagramPost}
            className="px-3 py-1 bg-pink-500 text-white rounded-sm text-sm hover:bg-pink-600"
          >
            Add
          </button>
        </div>
        
        {location.instagramPosts && location.instagramPosts.length > 0 && (
          <div className="space-y-2">
            {location.instagramPosts.map((post) => (
              <InstagramPostItem
                key={post.id}
                post={post}
                onUpdate={handleUpdateInstagramPost}
                onRemove={handleRemoveInstagramPost}
              />
            ))}
          </div>
        )}
      </div>

      {/* TikTok Posts */}
      <div className="mb-4">
        <label htmlFor={`${id}-tiktok-url`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">TikTok Posts</label>
        <div className="flex gap-2 mb-2">
          <input
            id={`${id}-tiktok-url`}
            type="url"
            value={newTikTokPost.url || ''}
            onChange={(e) => setNewTikTokPost(prev => ({ ...prev, url: e.target.value }))}
            className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
            placeholder="TikTok post URL"
          />
          <input
            type="text"
            value={newTikTokPost.caption || ''}
            onChange={(e) => setNewTikTokPost(prev => ({ ...prev, caption: e.target.value }))}
            className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
            placeholder="Caption (optional)"
            aria-label="TikTok caption"
          />
          <button
            onClick={onAddTikTokPost}
            className="px-3 py-1 bg-purple-500 text-white rounded-sm text-sm hover:bg-purple-600"
          >
            Add
          </button>
        </div>

        {location.tikTokPosts && location.tikTokPosts.length > 0 && (
          <div className="space-y-2">
            {location.tikTokPosts.map((post) => (
              <TikTokPostItem
                key={post.id}
                post={post}
                onUpdate={handleUpdateTikTokPost}
                onRemove={handleRemoveTikTokPost}
              />
            ))}
          </div>
        )}
      </div>

      {/* Blog Posts */}
      <div>
        <label htmlFor={`${id}-blog-title`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Blog Posts</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          <input
            id={`${id}-blog-title`}
            type="text"
            value={newBlogPost.title || ''}
            onChange={(e) => setNewBlogPost(prev => ({ ...prev, title: e.target.value }))}
            className="px-2 py-1 border border-gray-300 rounded-sm text-sm"
            placeholder="Post title"
          />
          <input
            type="url"
            value={newBlogPost.url || ''}
            onChange={(e) => setNewBlogPost(prev => ({ ...prev, url: e.target.value }))}
            className="px-2 py-1 border border-gray-300 rounded-sm text-sm"
            placeholder="Blog post URL"
            aria-label="Blog post URL"
          />
          <div className="flex gap-1">
            <input
              type="text"
              value={newBlogPost.excerpt || ''}
              onChange={(e) => setNewBlogPost(prev => ({ ...prev, excerpt: e.target.value }))}
              className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
              placeholder="Excerpt (optional)"
              aria-label="Blog post excerpt"
            />
            <button
              onClick={onAddBlogPost}
              className="px-3 py-1 bg-blue-500 dark:bg-blue-600 text-white rounded-sm text-sm hover:bg-blue-600 dark:hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        </div>
        
        {location.blogPosts && location.blogPosts.length > 0 && (
          <div className="space-y-2">
            {location.blogPosts.map((post) => (
              <BlogPostItem
                key={post.id}
                post={post}
                onUpdate={handleUpdateBlogPost}
                onRemove={handleRemoveBlogPost}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
