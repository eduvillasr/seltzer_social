// components/CommentSection.tsx

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Send } from 'lucide-react';
import { Comment } from '@/types';
import { createComment, getComments } from '@/lib/supabase';

interface CommentSectionProps {
  reviewId: string;
  currentUserId?: string;
}

export function CommentSection({ reviewId, currentUserId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadComments();
  }, [reviewId]);

  async function loadComments() {
    const { data } = await getComments(reviewId);
    setComments(data || []);
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !newComment.trim()) return;

    setLoading(true);
    const { data, error } = await createComment(currentUserId, reviewId, newComment);
    if (!error && data) {
      setComments([...comments, data]);
      setNewComment('');
    }
    setLoading(false);
  }

  return (
    <div>
      <h3
        className="font-bold text-lg text-slate-800 mb-4"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Comments ({comments.length})
      </h3>

      {/* Add Comment */}
      {currentUserId ? (
        <form onSubmit={handleAddComment} className="flex gap-3 mb-6">
          <div className="w-8 h-8 rounded-full avatar-gradient text-xs flex-shrink-0 mt-1">
            U
          </div>
          <div className="flex-1 relative">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              rows={2}
              className="input-field pr-12 resize-none"
              style={{ borderRadius: 'var(--radius-lg)' }}
            />
            <button
              type="submit"
              disabled={loading || !newComment.trim()}
              className="absolute right-3 bottom-3 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 text-white flex items-center justify-center disabled:opacity-30 hover:opacity-90 transition-opacity"
            >
              <Send size={14} />
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-slate-50 rounded-xl p-4 text-center mb-6">
          <p className="text-sm text-slate-500">
            <Link href="/auth/login" className="text-cyan-600 font-medium hover:underline">
              Sign in
            </Link>
            {' '}to join the conversation
          </p>
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No comments yet — be the first!</p>
        ) : (
          comments.map((comment) => {
            const initial = comment.user?.username?.charAt(0)?.toUpperCase() || '?';
            return (
              <div key={comment.id} className="flex gap-3 animate-fade-in">
                <Link href={`/profile/${comment.user?.username}`}>
                  <div className="w-8 h-8 rounded-full avatar-gradient text-xs flex-shrink-0 cursor-pointer hover:opacity-90">
                    {initial}
                  </div>
                </Link>
                <div className="flex-1 bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Link href={`/profile/${comment.user?.username}`}>
                      <span className="text-sm font-semibold text-slate-800 hover:text-cyan-600 cursor-pointer">
                        {comment.user?.username}
                      </span>
                    </Link>
                    <span className="text-xs text-slate-400">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{comment.content}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}