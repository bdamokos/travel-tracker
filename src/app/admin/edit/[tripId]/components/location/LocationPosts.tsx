'use client';

import React, { useEffect, useState } from 'react';
import { Location } from '@/app/types';

const updatePost = <T extends { id: string }>(
  posts: T[] | undefined,
  postId: string,
  updates: Partial<T>
): T[] | undefined => posts?.map(post => (post.id === postId ? { ...post, ...updates } : post));

type InstagramPost = NonNullable<Location['instagramPosts']>[number];
type TikTokPost = NonNullable<Location['tikTokPosts']>[number];
type BlogPost = NonNullable<Location['blogPosts']>[number];

interface InstagramPostItemProps {
  post: InstagramPost;
  onUpdate: (postId: string, updates: Partial<{ url: string; caption: string }>) => void;
  onRemove: (postId: string) => void;
}

const InstagramPostItem = ({ post, onUpdate, onRemove }: InstagramPostItemProps) => {
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
          placeholder="Instagram post URL"
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

interface TikTokPostItemProps {
  post: TikTokPost;
  onUpdate: (postId: string, updates: Partial<{ url: string; caption: string }>) => void;
  onRemove: (postId: string) => void;
}

const TikTokPostItem = ({ post, onUpdate, onRemove }: TikTokPostItemProps) => {
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
          placeholder="TikTok post URL"
        />
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-600 hover:underline whitespace-nowrap"
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

  return (
    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
      <h6 className="font-medium mb-4 text-gray-900 dark:text-white">Instagram, TikTok & Blog Posts</h6>
      
      {/* Instagram Posts */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Instagram Posts</label>
        <div className="flex gap-2 mb-2">
          <input
            type="url"
            value={newInstagramPost.url || ''}
            onChange={(e) => setNewInstagramPost(prev => ({ ...prev, url: e.target.value }))}
            className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
            placeholder="Instagram post URL"
          />
          <input
            type="text"
            value={newInstagramPost.caption || ''}
            onChange={(e) => setNewInstagramPost(prev => ({ ...prev, caption: e.target.value }))}
            className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
            placeholder="Caption (optional)"
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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">TikTok Posts</label>
        <div className="flex gap-2 mb-2">
          <input
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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Blog Posts</label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          <input
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
          />
          <div className="flex gap-1">
            <input
              type="text"
              value={newBlogPost.excerpt || ''}
              onChange={(e) => setNewBlogPost(prev => ({ ...prev, excerpt: e.target.value }))}
              className="flex-1 px-2 py-1 border border-gray-300 rounded-sm text-sm"
              placeholder="Excerpt (optional)"
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
