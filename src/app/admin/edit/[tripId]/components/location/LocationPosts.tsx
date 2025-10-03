'use client';

import React from 'react';
import { Location } from '@/app/types';

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

  const handleRemoveTikTokPost = (postId: string) => {
    const updatedLocation = {
      ...location,
      tikTokPosts: location.tikTokPosts?.filter(p => p.id !== postId),
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
          <div className="space-y-1">
            {location.instagramPosts.map((post) => (
              <div key={post.id} className="flex justify-between items-center bg-white p-2 rounded-sm text-sm">
                <a href={post.url} target="_blank" rel="noopener" className="text-blue-500 hover:underline truncate">
                  {post.url}
                </a>
                <button
                  onClick={() => handleRemoveInstagramPost(post.id)}
                  className="text-red-500 hover:text-red-700 ml-2"
                >
                  ×
                </button>
              </div>
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
          <div className="space-y-1">
            {location.tikTokPosts.map((post) => (
              <div key={post.id} className="flex justify-between items-center bg-white p-2 rounded-sm text-sm">
                <a href={post.url} target="_blank" rel="noopener" className="text-purple-600 hover:underline truncate">
                  {post.url}
                </a>
                <button
                  onClick={() => handleRemoveTikTokPost(post.id)}
                  className="text-red-500 hover:text-red-700 ml-2"
                >
                  ×
                </button>
              </div>
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
          <div className="space-y-1">
            {location.blogPosts.map((post) => (
              <div key={post.id} className="flex justify-between items-center bg-white p-2 rounded-sm text-sm">
                <div className="flex-1 truncate">
                  <a href={post.url} target="_blank" rel="noopener" className="text-blue-500 hover:underline font-medium">
                    {post.title}
                  </a>
                  {post.excerpt && <p className="text-gray-600 text-xs">{post.excerpt}</p>}
                </div>
                <button
                  onClick={() => handleRemoveBlogPost(post.id)}
                  className="text-red-500 hover:text-red-700 ml-2"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
