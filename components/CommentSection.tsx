// components/CommentSection.tsx

'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Send, Trash2, CornerDownRight, X } from 'lucide-react';
import { Comment } from '@/types';
import { createComment, getComments, deleteComment, createNotification, getUserIdsByUsernames, supabase } from '@/lib/supabase';
import { FounderBadge, FOUNDERS } from './FounderBadge';

const REACTIONS = ['👍', '❤️', '😂', '😮', '🔥', '💧'];

interface CommentSectionProps {
  reviewId: string;
  reviewSlug?: string; // seltzer_name for notification text
  currentUsername?: string;
  currentUserId?: string;
  reviewOwnerId?: string;
  /** Called whenever the comment count changes (after adds/deletes). */
  onCountChange?: (count: number) => void;
}

function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-z0-9_]+)/gi) || [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}

function renderCommentContent(text: string) {
  const parts = text.split(/(@[a-z0-9_]+)/gi);
  return parts.map((part, i) => {
    if (/^@[a-z0-9_]+$/i.test(part)) {
      return (
        <a key={i} href={`/profile/${part.slice(1)}`} className="font-semibold hover:underline" style={{ color: 'var(--cyan-400)' }}>
          {part}
        </a>
      );
    }
    return part;
  });
}

interface ReactionMap {
  [commentId: string]: { [emoji: string]: string[] }; // emoji -> userIds
}

export function CommentSection({ reviewId, reviewSlug, currentUsername, currentUserId, reviewOwnerId, onCountChange }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [reactionPicker, setReactionPicker] = useState<string | null>(null); // commentId

  // Reply state — a single open reply input at a time, keyed by parent comment id.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText]   = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  useEffect(() => {
    loadComments();
  }, [reviewId]);

  // Notify the parent whenever the comment list size changes
  useEffect(() => {
    onCountChange?.(comments.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments.length]);

  // Build the thread tree from the flat list once per render.
  const { topLevel, repliesByParent } = useMemo(() => {
    const tops: Comment[] = [];
    const repliesMap: Record<string, Comment[]> = {};
    for (const c of comments) {
      if (!c.parent_id) tops.push(c);
      else {
        if (!repliesMap[c.parent_id]) repliesMap[c.parent_id] = [];
        repliesMap[c.parent_id].push(c);
      }
    }
    // Replies sorted oldest → newest so threads read top-to-bottom
    for (const k of Object.keys(repliesMap)) {
      repliesMap[k].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return { topLevel: tops, repliesByParent: repliesMap };
  }, [comments]);

  async function loadComments() {
    const { data } = await getComments(reviewId);
    setComments(data || []);
    if (data && data.length > 0) {
      await loadReactions(data.map((c: Comment) => c.id));
    }
  }

  async function loadReactions(commentIds: string[]) {
    const { data } = await supabase
      .from('comment_reactions')
      .select('*')
      .in('comment_id', commentIds);

    if (!data) return;
    const map: ReactionMap = {};
    for (const row of data) {
      if (!map[row.comment_id]) map[row.comment_id] = {};
      if (!map[row.comment_id][row.emoji]) map[row.comment_id][row.emoji] = [];
      map[row.comment_id][row.emoji].push(row.user_id);
    }
    setReactions(map);
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId || !newComment.trim()) return;
    setLoading(true);
    const text = newComment.trim();
    const { data, error } = await createComment(currentUserId, reviewId, text);
    if (!error && data) {
      setComments([...comments, data]);
      setNewComment('');

      // Fire-and-forget: send @mention notifications
      const mentions = extractMentions(text).filter((u) => u !== currentUsername?.toLowerCase());
      if (mentions.length > 0) {
        getUserIdsByUsernames(mentions).then(({ data: users }) => {
          if (!users) return;
          users.forEach((u: { id: string; username: string }) => {
            if (u.id !== currentUserId) {
              createNotification({
                user_id: u.id,
                type: 'mention',
                title: `@${currentUsername || 'Someone'} mentioned you`,
                body: text.length > 80 ? text.slice(0, 77) + '…' : text,
                link: `/review/${reviewId}`,
              });
            }
          });
        });
      }
    }
    setLoading(false);
  }

  async function handleDeleteComment(commentId: string) {
    await deleteComment(commentId);
    // Drop the comment AND all of its replies (cascade should handle DB-side, but mirror it client-side).
    setComments((prev) => prev.filter((c) => c.id !== commentId && c.parent_id !== commentId));
  }

  function startReply(commentId: string, replyToUsername?: string) {
    setReplyingTo(commentId);
    // Pre-fill with @username so the reply context is obvious + mention notification fires.
    setReplyText(replyToUsername ? `@${replyToUsername} ` : '');
  }

  function cancelReply() {
    setReplyingTo(null);
    setReplyText('');
  }

  async function handleAddReply(parentId: string) {
    if (!currentUserId || !replyText.trim()) return;
    setReplyLoading(true);
    const text = replyText.trim();
    // Replies thread off the *root* parent — collapse nested replies to a single level.
    // If the user clicked Reply on a reply, we want to attach it to the original top-level parent.
    const parent = comments.find((c) => c.id === parentId);
    const rootParentId = parent?.parent_id ?? parentId;

    const { data, error } = await createComment(currentUserId, reviewId, text, rootParentId);
    if (!error && data) {
      setComments([...comments, data]);
      setReplyText('');
      setReplyingTo(null);

      // Mention notifications still fire for any @username in the reply body.
      const mentions = extractMentions(text).filter((u) => u !== currentUsername?.toLowerCase());
      if (mentions.length > 0) {
        getUserIdsByUsernames(mentions).then(({ data: users }) => {
          if (!users) return;
          users.forEach((u: { id: string; username: string }) => {
            if (u.id !== currentUserId) {
              createNotification({
                user_id: u.id,
                type: 'mention',
                title: `@${currentUsername || 'Someone'} mentioned you`,
                body: text.length > 80 ? text.slice(0, 77) + '…' : text,
                link: `/review/${reviewId}`,
              });
            }
          });
        });
      }
    }
    setReplyLoading(false);
  }

  async function handleReaction(commentId: string, emoji: string) {
    if (!currentUserId) return;
    setReactionPicker(null);

    const existing = reactions[commentId]?.[emoji] || [];
    const alreadyReacted = existing.includes(currentUserId);

    if (alreadyReacted) {
      await supabase
        .from('comment_reactions')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', currentUserId)
        .eq('emoji', emoji);

      setReactions((prev) => {
        const updated = { ...prev };
        if (updated[commentId]?.[emoji]) {
          updated[commentId][emoji] = updated[commentId][emoji].filter((id) => id !== currentUserId);
          if (updated[commentId][emoji].length === 0) delete updated[commentId][emoji];
        }
        return updated;
      });
    } else {
      await supabase
        .from('comment_reactions')
        .upsert([{ comment_id: commentId, user_id: currentUserId, emoji }], { onConflict: 'comment_id,user_id,emoji' });

      setReactions((prev) => {
        const updated = { ...prev };
        if (!updated[commentId]) updated[commentId] = {};
        if (!updated[commentId][emoji]) updated[commentId][emoji] = [];
        updated[commentId][emoji] = [...updated[commentId][emoji], currentUserId];
        return updated;
      });
    }
  }

  return (
    <div>
      <h3 className="font-bold text-lg mb-4" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
        Comments ({comments.length})
      </h3>

      {currentUserId ? (
        <form onSubmit={handleAddComment} className="flex gap-3 mb-6">
          <div className="w-8 h-8 rounded-full avatar-gradient text-xs flex-shrink-0 mt-1" />
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
        <div className="rounded-xl p-4 text-center mb-6" style={{ background: 'rgba(15,20,36,0.4)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Link href="/auth/login" className="text-cyan-400 font-medium hover:underline">Sign in</Link>
            {' '}to join the conversation
          </p>
        </div>
      )}

      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>No comments yet — be the first!</p>
        ) : (
          topLevel.map((comment) => {
            const replies = repliesByParent[comment.id] || [];
            return (
              <div key={comment.id} className="animate-fade-in">
                <CommentItem
                  comment={comment}
                  isReply={false}
                  reactions={reactions}
                  reactionPicker={reactionPicker}
                  setReactionPicker={setReactionPicker}
                  handleReaction={handleReaction}
                  handleDeleteComment={handleDeleteComment}
                  currentUserId={currentUserId}
                  reviewOwnerId={reviewOwnerId}
                  startReply={startReply}
                />

                {/* Replies indented under the parent */}
                {replies.length > 0 && (
                  <div className="mt-3 ml-7 space-y-3 pl-4" style={{ borderLeft: '2px solid var(--border-subtle)' }}>
                    {replies.map((r) => (
                      <CommentItem
                        key={r.id}
                        comment={r}
                        isReply={true}
                        reactions={reactions}
                        reactionPicker={reactionPicker}
                        setReactionPicker={setReactionPicker}
                        handleReaction={handleReaction}
                        handleDeleteComment={handleDeleteComment}
                        currentUserId={currentUserId}
                        reviewOwnerId={reviewOwnerId}
                        startReply={startReply}
                      />
                    ))}
                  </div>
                )}

                {/* Inline reply input — appears under whichever comment / reply was Reply'd to */}
                {replyingTo && (replyingTo === comment.id || replies.some((r) => r.id === replyingTo)) && (
                  <form
                    onSubmit={(e) => { e.preventDefault(); handleAddReply(replyingTo); }}
                    className="mt-3 ml-7 pl-4 flex gap-2"
                    style={{ borderLeft: '2px solid rgba(34,211,238,0.3)' }}
                  >
                    <div className="flex-1 relative">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Write a reply…"
                        rows={2}
                        className="input-field pr-12 resize-none"
                        style={{ borderRadius: 'var(--radius-lg)', fontSize: '14px' }}
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={replyLoading || !replyText.trim()}
                        className="absolute right-2 bottom-2 w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 text-white flex items-center justify-center disabled:opacity-30 hover:opacity-90 transition-opacity"
                      >
                        <Send size={12} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={cancelReply}
                      className="action-btn"
                      style={{ padding: '6px 8px', color: 'var(--text-muted)' }}
                      aria-label="Cancel reply"
                    >
                      <X size={14} />
                    </button>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ───────── Single comment renderer ───────── */
interface CommentItemProps {
  comment: Comment;
  isReply: boolean;
  reactions: ReactionMap;
  reactionPicker: string | null;
  setReactionPicker: (id: string | null) => void;
  handleReaction: (commentId: string, emoji: string) => void;
  handleDeleteComment: (commentId: string) => void;
  currentUserId?: string;
  reviewOwnerId?: string;
  startReply: (commentId: string, replyToUsername?: string) => void;
}

function CommentItem({
  comment, isReply, reactions, reactionPicker, setReactionPicker,
  handleReaction, handleDeleteComment, currentUserId, reviewOwnerId, startReply,
}: CommentItemProps) {
  const initial = comment.user?.username?.charAt(0)?.toUpperCase() || '?';
  const canDelete = currentUserId === comment.user_id || currentUserId === reviewOwnerId;
  const commentReactions = reactions[comment.id] || {};
  const hasReactions = Object.keys(commentReactions).length > 0;

  return (
    <div onClick={() => reactionPicker === comment.id && setReactionPicker(null)}>
      <div className="flex gap-3">
        <Link href={`/profile/${comment.user?.username}`} className="flex-shrink-0">
          <div className={`${isReply ? 'w-7 h-7' : 'w-8 h-8'} rounded-full avatar-gradient text-xs cursor-pointer hover:opacity-90 flex items-center justify-center`}>
            {initial}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div
            className="rounded-xl p-3 relative group"
            style={{ background: 'rgba(15,20,36,0.5)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <Link href={`/profile/${comment.user?.username}`} className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-semibold truncate hover:text-cyan-400 cursor-pointer transition-colors" style={{ color: 'var(--text-primary)' }}>
                    {comment.user?.username}
                  </span>
                  {comment.user?.username && FOUNDERS.has(comment.user.username) && <FounderBadge />}
                </Link>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {new Date(comment.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                {currentUserId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setReactionPicker(reactionPicker === comment.id ? null : comment.id); }}
                    className="text-base leading-none px-1 hover:scale-110 transition-transform"
                    title="React"
                  >
                    😊
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="action-btn"
                    style={{ padding: '3px 6px', color: 'var(--text-muted)' }}
                    title="Delete comment"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm leading-relaxed break-anywhere" style={{ color: 'var(--text-secondary)' }}>{renderCommentContent(comment.content)}</p>

            {/* Reaction picker */}
            {reactionPicker === comment.id && (
              <div
                className="absolute right-2 top-10 z-20 flex gap-1 p-2 rounded-2xl animate-slide-down"
                style={{ background: 'rgba(15,20,36,0.95)', border: '1px solid var(--border-medium)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {REACTIONS.map((emoji) => {
                  const reacted = commentReactions[emoji]?.includes(currentUserId || '') ?? false;
                  return (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(comment.id, emoji)}
                      className="text-lg leading-none w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-125"
                      style={{ background: reacted ? 'rgba(6,182,212,0.15)' : 'transparent' }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reactions + Reply row */}
          <div className="flex items-center gap-1.5 mt-1.5 ml-1 flex-wrap">
            {hasReactions && (
              <>
                {Object.entries(commentReactions).map(([emoji, userIds]) =>
                  userIds.length > 0 ? (
                    <button
                      key={emoji}
                      onClick={() => currentUserId && handleReaction(comment.id, emoji)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all hover:scale-105"
                      style={{
                        background: userIds.includes(currentUserId || '') ? 'rgba(6,182,212,0.15)' : 'rgba(148,163,184,0.06)',
                        border: `1px solid ${userIds.includes(currentUserId || '') ? 'rgba(6,182,212,0.3)' : 'var(--border-subtle)'}`,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {emoji} <span>{userIds.length}</span>
                    </button>
                  ) : null
                )}
              </>
            )}
            {currentUserId && (
              <button
                onClick={() => startReply(comment.id, comment.user?.username)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
              >
                <CornerDownRight size={11} /> Reply
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
