'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Bell, BellOff, Check, ChevronDown, ChevronUp,
  ExternalLink, Inbox, LayoutGrid, List as ListIcon, MoreHorizontal, Pencil, Plus,
  Search, Share2, Star, Trash2, X, AlertTriangle,
} from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { RatingInput } from '@/components/RatingInput';
import { CanLoader } from '@/components/CanLoader';
import { showToast } from '@/components/Toast';
import {
  acceptTierListInvite,
  addSharedTierListItem,
  bulkAddSharedTierListItems,
  createSharedTierListSuggestion,
  declineTierListInvite,
  deleteSharedTierList,
  deleteSharedTierListItem,
  getSharedTierList,
  getSharedTierListItems,
  getSharedTierListSuggestions,
  getSharedTierListSubscription,
  getUserReviews,
  markSharedSuggestionTried,
  subscribeToSharedTierList,
  supabase,
  unsubscribeFromSharedTierList,
  updateSharedTierListItem,
  voteOnSharedSuggestion,
} from '@/lib/supabase';
import { Review, SharedTierList, SharedTierListItem, SharedTierListSuggestion } from '@/types';

// ─── constants ───────────────────────────────────────────────
const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
type Tier = typeof TIERS[number];

const TIER_COLORS: Record<string, string> = {
  S: '#f59e0b', A: '#10b981', B: '#22d3ee',
  C: '#a3e635', D: '#f97316', F: '#fb7185',
};

function ratingToTier(v: number): Tier {
  if (v >= 4.5) return 'S';
  if (v >= 4)   return 'A';
  if (v >= 3)   return 'B';
  if (v >= 2)   return 'C';
  if (v >= 1)   return 'D';
  return 'F';
}

// ─── component ───────────────────────────────────────────────
type AddTab = 'reviews' | 'manual';
type ViewMode = 'compact' | 'detailed';

export default function SharedListPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [userId, setUserId]       = useState('');
  const [list, setList]           = useState<SharedTierList | null>(null);
  const [items, setItems]         = useState<SharedTierListItem[]>([]);
  const [suggestions, setSuggestions] = useState<SharedTierListSuggestion[]>([]);
  const [subscribed, setSubscribed]   = useState(false);
  const [trialRatings, setTrialRatings] = useState<Record<string, number>>({});

  // top-level UI
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode]       = useState<ViewMode>('compact');
  const [collapsedTiers, setCollapsedTiers] = useState<Set<Tier>>(new Set());

  // ── add panel ──
  const [addOpen, setAddOpen]       = useState(false);
  const [addTab, setAddTab]         = useState<AddTab>('reviews');

  // reviews picker (members only)
  const [myReviews, setMyReviews]   = useState<Review[]>([]);
  const [reviewQuery, setReviewQuery] = useState('');
  const [pickedIds, setPickedIds]   = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  // manual entry
  const [manualName, setManualName] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualRating, setManualRating] = useState(3);
  const [manualNote, setManualNote] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  // suggestion panel (subscribers only)
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestName, setSuggestName] = useState('');
  const [suggestBrand, setSuggestBrand] = useState('');
  const [suggestRating, setSuggestRating] = useState(3);
  const [suggestNote, setSuggestNote] = useState('');
  const [suggestSaving, setSuggestSaving] = useState(false);

  // inline edit modal for an item
  const [editingItem, setEditingItem] = useState<SharedTierListItem | null>(null);
  const [editTier, setEditTier]       = useState<Tier>('B');
  const [editRating, setEditRating]   = useState(3);
  const [editNote, setEditNote]       = useState('');
  const [editSaving, setEditSaving]   = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // pending suggestions strip
  const [showAllPending, setShowAllPending] = useState(false);

  // header overflow menu + list-level delete modal
  const [menuOpen, setMenuOpen]                   = useState(false);
  const [showDeleteList, setShowDeleteList]       = useState(false);
  const [deleteListConfirm, setDeleteListConfirm] = useState('');
  const [deletingList, setDeletingList]           = useState(false);

  // ─── load ───────────────────────────────────────────────────
  useEffect(() => { load(); }, [params.id]);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id ?? '';
    setUserId(uid);

    const [{ data: listData }, { data: itemData }, { data: suggData }] = await Promise.all([
      getSharedTierList(params.id),
      getSharedTierListItems(params.id),
      getSharedTierListSuggestions(params.id),
    ]);
    setList(listData);
    setItems(itemData || []);
    setSuggestions(suggData || []);

    if (uid) {
      const { data: sub } = await getSharedTierListSubscription(uid, params.id);
      setSubscribed(!!sub);
      const { data: reviews } = await getUserReviews(uid);
      setMyReviews(reviews || []);
    }
  }

  // ─── derived (hooks must run unconditionally — keep above any early return) ─
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.seltzer_name.toLowerCase().includes(q) ||
      (i.brand ?? '').toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const itemsByTier = useMemo(() => {
    const map: Record<Tier, SharedTierListItem[]> = { S: [], A: [], B: [], C: [], D: [], F: [] };
    for (const i of filteredItems) {
      const t = (TIERS as readonly string[]).includes(i.tier) ? (i.tier as Tier) : 'F';
      map[t].push(i);
    }
    for (const t of TIERS) map[t].sort((a, b) => b.rating - a.rating);
    return map;
  }, [filteredItems]);

  const onListReviewIds = useMemo(
    () => new Set(items.map((i) => i.review_id).filter(Boolean) as string[]),
    [items]
  );

  if (!list) {
    return <><Navigation /><main className="max-w-md mx-auto px-4 pt-10 pb-32"><CanLoader /></main></>;
  }

  const isMember = userId === list.owner_id || userId === list.partner_id;
  const isPendingInvite = list.status === 'pending_invite';
  const isInvitee = isPendingInvite && userId === list.partner_id;
  const isInviter = isPendingInvite && userId === list.owner_id;

  // ─── handlers ────────────────────────────────────────────────
  async function toggleSubscription() {
    if (!userId) return;
    if (subscribed) { await unsubscribeFromSharedTierList(userId, params.id); setSubscribed(false); }
    else            { await subscribeToSharedTierList(userId, params.id);     setSubscribed(true);  }
  }

  function toggleTier(t: Tier) {
    setCollapsedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  function togglePicked(id: string) {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkAdd() {
    const picks = myReviews.filter((r) => pickedIds.has(r.id) && !onListReviewIds.has(r.id));
    if (picks.length === 0) return;
    setBulkSaving(true);
    const { error } = await bulkAddSharedTierListItems(picks.map((r) => ({
      list_id:      params.id,
      added_by:     userId,
      seltzer_id:   (r as any).seltzer_id ?? undefined,
      seltzer_name: r.seltzer_name,
      brand:        r.brand ?? undefined,
      rating:       r.rating,
      tier:         ratingToTier(r.rating),
      review_id:    r.id,
    })));
    setPickedIds(new Set());
    setBulkSaving(false);
    setAddOpen(false);
    if (error) showToast('Could not add drinks', 'error', error.message);
    else showToast(`Added ${picks.length} ${picks.length === 1 ? 'drink' : 'drinks'} 🍹`, 'success', list?.name);
    load();
  }

  async function manualAdd() {
    if (!manualName.trim()) return;
    setManualSaving(true);
    const { error } = await addSharedTierListItem({
      list_id:      params.id,
      added_by:     userId,
      seltzer_name: manualName.trim(),
      brand:        manualBrand.trim() || undefined,
      rating:       manualRating,
      tier:         ratingToTier(manualRating),
      note:         manualNote.trim() || undefined,
    });
    const name = manualName.trim();
    setManualName(''); setManualBrand(''); setManualRating(3); setManualNote('');
    setManualSaving(false);
    setAddOpen(false);
    if (error) showToast('Could not add drink', 'error', error.message);
    else showToast(`Added ${name}`, 'success', `${ratingToTier(manualRating)} tier · ${manualRating.toFixed(1)}`);
    load();
  }

  async function submitSuggestion() {
    if (!suggestName.trim()) return;
    setSuggestSaving(true);
    const name = suggestName.trim();
    await createSharedTierListSuggestion({
      list_id:        params.id,
      created_by:     userId,
      action:         'add',
      seltzer_name:   name,
      brand:          suggestBrand.trim() || undefined,
      proposed_rating: suggestRating,
      proposed_tier:  ratingToTier(suggestRating),
      proposed_note:  suggestNote.trim() || undefined,
    });
    setSuggestName(''); setSuggestBrand(''); setSuggestRating(3); setSuggestNote('');
    setSuggestSaving(false);
    setSuggestOpen(false);
    showToast('Suggestion sent', 'success', `${name} → ${list?.name}`);
    load();
  }

  function startEdit(item: SharedTierListItem) {
    setEditingItem(item);
    setEditTier((item.tier as Tier) || 'B');
    setEditRating(item.rating);
    setEditNote(item.note ?? '');
    setConfirmDeleteId(null);
  }

  async function saveEdit() {
    if (!editingItem) return;
    setEditSaving(true);
    const { error } = await updateSharedTierListItem(editingItem.id, params.id, {
      rating: editRating,
      tier:   editTier,
      note:   editNote.trim() || null,
    });
    setEditSaving(false);
    setEditingItem(null);
    if (error) showToast('Could not save', 'error', error.message);
    else showToast('Updated', 'success', `${editingItem.seltzer_name} · ${editTier}`);
    load();
  }

  async function deleteItem(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    const { error } = await deleteSharedTierListItem(itemId, params.id);
    setConfirmDeleteId(null);
    setEditingItem(null);
    if (error) {
      showToast('Could not remove drink', 'error', error.message);
      return;
    }
    showToast('Removed from list', 'info', item?.seltzer_name);
    load();
  }

  async function handleShare() {
    if (!list) return;
    const url = `${window.location.origin}/shared/${params.id}`;
    const text = `Check out "${list.name}" — a seltzer tier list by @${list.owner?.username} + @${list.partner?.username}`;

    // Native share on mobile, copy-to-clipboard everywhere else
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: list.name, text, url });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied 🔗', 'success', 'Paste it anywhere to share.');
    } catch {
      showToast('Could not copy', 'error', url);
    }
  }

  async function handleAcceptInvite() {
    if (!list || !userId) return;
    const { error } = await acceptTierListInvite(params.id, userId);
    if (error) { showToast('Could not accept', 'error', error.message); return; }
    showToast('Invite accepted 🥂', 'success', `You're in "${list.name}"`);
    load();
  }

  async function handleDeclineInvite() {
    if (!list || !userId) return;
    const { error } = await declineTierListInvite(params.id, userId);
    if (error) { showToast('Could not decline', 'error', error.message); return; }
    showToast('Invite declined', 'info');
    router.push('/feed');
  }

  async function handleDeleteList() {
    if (!list) return;
    setDeletingList(true);
    const { error } = await deleteSharedTierList(params.id);
    setDeletingList(false);
    if (error) {
      showToast('Could not delete list', 'error', error.message);
      return;
    }
    showToast('Tier list deleted', 'info', list.name);
    router.push('/feed');
  }

  async function markTried(suggestion: SharedTierListSuggestion) {
    if (!userId) return;
    const r = trialRatings[suggestion.id] ?? Number(suggestion.proposed_rating);
    await markSharedSuggestionTried(suggestion.id, userId, r);
    load();
  }

  async function vote(suggestion: SharedTierListSuggestion, v: 'approve' | 'reject') {
    if (!userId || !list) return;
    await voteOnSharedSuggestion(suggestion, list, userId, v);
    showToast(v === 'approve' ? 'Approved 🥂' : 'Rejected', v === 'approve' ? 'success' : 'info', suggestion.seltzer_name);
    load();
  }

  // filtered review picker
  const filteredReviews = myReviews.filter((r) => {
    const q = reviewQuery.toLowerCase();
    return !q || r.seltzer_name.toLowerCase().includes(q) || (r.brand ?? '').toLowerCase().includes(q);
  });

  // pending counts
  const pendingForMe = suggestions.filter((s) => s.created_by !== userId);
  const myPending    = suggestions.filter((s) => s.created_by === userId);
  const visiblePending = showAllPending ? suggestions : pendingForMe;

  // ─── render ──────────────────────────────────────────────────
  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-10 pb-32 space-y-4">

        {/* Back */}
        <Link href="/feed" className="inline-flex items-center gap-2 text-sm hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back
        </Link>

        {/* ── Pending invite banner ── */}
        {isInvitee && (
          <div
            className="rounded-2xl p-4 animate-fade-in-up"
            style={{
              background: 'linear-gradient(135deg, rgba(34,211,238,0.10), rgba(167,139,250,0.10))',
              border: '1px solid rgba(34,211,238,0.3)',
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--cyan-400)' }}>
              You've been invited
            </p>
            <p className="text-sm font-bold mt-1" style={{ color: 'var(--text-primary)' }}>
              @{list.owner?.username} wants to start "{list.name}" with you
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Accept to start ranking together. You can leave any time.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={handleDeclineInvite} className="btn-secondary flex-1 justify-center" style={{ padding: '10px', fontSize: '13px' }}>
                Decline
              </button>
              <button onClick={handleAcceptInvite} className="btn-primary flex-1 justify-center" style={{ padding: '10px', fontSize: '13px' }}>
                <Check size={13} /> Accept invite
              </button>
            </div>
          </div>
        )}

        {/* ── Inviter waiting state ── */}
        {isInviter && (
          <div
            className="rounded-2xl p-3 flex items-center gap-3 animate-fade-in-up"
            style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)' }}
          >
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(251,191,36,0.12)' }}>
              <Inbox size={15} style={{ color: 'var(--amber-400)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                Waiting for @{list.partner?.username}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                List goes live once they accept the invite.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold truncate" style={{ fontFamily: 'var(--font-display)' }}>{list.name}</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              @{list.owner?.username} + @{list.partner?.username}
              <span style={{ color: 'var(--text-muted)' }}> · {items.length} {items.length === 1 ? 'drink' : 'drinks'}</span>
            </p>
          </div>
          {/* Share button — anyone can copy/share the invite link */}
          <button
            onClick={handleShare}
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
            title="Share this list"
            aria-label="Share"
          >
            <Share2 size={14} />
          </button>

          {userId && !isMember && (
            <button onClick={toggleSubscription} className={subscribed ? 'btn-secondary flex-shrink-0' : 'btn-primary flex-shrink-0'} style={{ padding: '8px 12px', fontSize: '12px' }}>
              {subscribed ? <><BellOff size={13} /> Subscribed</> : <><Bell size={13} /> Subscribe</>}
            </button>
          )}

          {/* Members get an overflow menu for list-level actions */}
          {isMember && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
                style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
                aria-label="List options"
              >
                <MoreHorizontal size={16} />
              </button>
              {menuOpen && (
                <>
                  {/* click-outside */}
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-11 z-40 rounded-xl py-1 min-w-[180px]"
                    style={{
                      background: 'rgba(10,14,26,0.98)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid var(--border-medium)',
                      boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                    }}
                  >
                    <button
                      onClick={() => { setMenuOpen(false); setShowDeleteList(true); setDeleteListConfirm(''); }}
                      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-white/5 transition-colors"
                      style={{ color: '#fb7185' }}
                    >
                      <Trash2 size={13} /> Delete this list
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Toolbar: search + view toggle + add */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search drinks…"
              className="input-field pl-9"
              style={{ height: '38px', fontSize: '13px', borderRadius: '999px' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/5"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            onClick={() => setViewMode((m) => (m === 'compact' ? 'detailed' : 'compact'))}
            className="flex-shrink-0 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
            style={{ width: '38px', height: '38px', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
            title={viewMode === 'compact' ? 'Switch to detailed view' : 'Switch to compact view'}
          >
            {viewMode === 'compact' ? <ListIcon size={15} /> : <LayoutGrid size={15} />}
          </button>
        </div>

        {/* ══════════════════════════════════════
            ADD PANEL — members only, direct edit
        ══════════════════════════════════════ */}
        {isMember && (
          <div className="glass-card overflow-hidden" style={{ padding: 0 }}>
            <button
              onClick={() => setAddOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--cyan-400)' }}>
                <Plus size={14} /> Add Drinks
              </span>
              {addOpen ? <ChevronUp size={15} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />}
            </button>

            {addOpen && (
              <div className="px-4 pb-4 space-y-3">
                {/* Tab toggle */}
                <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(15,20,36,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {(['reviews', 'manual'] as AddTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAddTab(t)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        background: addTab === t ? 'linear-gradient(135deg, var(--cyan-400), var(--cyan-600))' : 'transparent',
                        color: addTab === t ? '#fff' : 'var(--text-tertiary)',
                      }}
                    >
                      {t === 'reviews' ? 'From My Reviews' : 'Manual Entry'}
                    </button>
                  ))}
                </div>

                {/* ── FROM MY REVIEWS ── */}
                {addTab === 'reviews' && (
                  myReviews.length === 0 ? (
                    <div className="text-center py-6 rounded-xl" style={{ background: 'rgba(15,20,36,0.4)', border: '1px solid var(--border-subtle)' }}>
                      <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No reviews yet</p>
                      <Link href="/create" className="btn-primary inline-flex mt-2" style={{ fontSize: '12px', padding: '7px 14px' }}>
                        <Plus size={13} /> Write a Review
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input
                          value={reviewQuery}
                          onChange={(e) => setReviewQuery(e.target.value)}
                          placeholder="Search your reviews…"
                          className="input-field pl-9"
                          style={{ fontSize: '13px', height: '36px' }}
                        />
                      </div>

                      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                        {filteredReviews.map((r) => {
                          const onList = onListReviewIds.has(r.id);
                          const picked = pickedIds.has(r.id);
                          return (
                            <button
                              key={r.id}
                              type="button"
                              disabled={onList}
                              onClick={() => togglePicked(r.id)}
                              className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-all"
                              style={{
                                border: `1px solid ${picked ? 'rgba(34,211,238,0.5)' : 'var(--border-subtle)'}`,
                                background: picked ? 'rgba(34,211,238,0.08)' : (onList ? 'rgba(15,20,36,0.2)' : 'rgba(15,20,36,0.4)'),
                                opacity: onList ? 0.4 : 1,
                                cursor: onList ? 'not-allowed' : 'pointer',
                              }}
                            >
                              <div
                                className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center"
                                style={{
                                  background: picked ? 'var(--cyan-400)' : 'transparent',
                                  border: `1.5px solid ${picked ? 'var(--cyan-400)' : 'var(--border-strong)'}`,
                                }}
                              >
                                {picked && <Check size={12} className="text-white" strokeWidth={3} />}
                              </div>

                              {r.image_url ? (
                                <img src={r.image_url} alt={r.seltzer_name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ background: 'rgba(34,211,238,0.1)' }}>
                                  <Star size={13} className="text-cyan-400" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{r.seltzer_name}</p>
                                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                                  {r.brand ?? 'No brand'}{onList && ' · already on list'}
                                </p>
                              </div>
                              <span
                                className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                                style={{
                                  background: `${TIER_COLORS[ratingToTier(r.rating)]}22`,
                                  color: TIER_COLORS[ratingToTier(r.rating)],
                                  border: `1px solid ${TIER_COLORS[ratingToTier(r.rating)]}44`,
                                }}
                              >
                                {ratingToTier(r.rating)} · {r.rating.toFixed(1)}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={bulkAdd}
                        disabled={bulkSaving || pickedIds.size === 0}
                        className="btn-primary w-full justify-center"
                        style={{ padding: '10px' }}
                      >
                        <Plus size={14} />
                        {bulkSaving
                          ? 'Adding…'
                          : pickedIds.size === 0
                            ? 'Select drinks to add'
                            : `Add ${pickedIds.size} ${pickedIds.size === 1 ? 'drink' : 'drinks'} to list`}
                      </button>
                    </>
                  )
                )}

                {/* ── MANUAL ENTRY ── */}
                {addTab === 'manual' && (
                  <div className="space-y-2.5">
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Drink name"
                      className="input-field"
                      style={{ fontSize: '13px', height: '38px' }}
                    />
                    <input
                      value={manualBrand}
                      onChange={(e) => setManualBrand(e.target.value)}
                      placeholder="Brand (optional)"
                      className="input-field"
                      style={{ fontSize: '13px', height: '38px' }}
                    />
                    <RatingInput value={manualRating} onChange={setManualRating} label={`Rating · ${ratingToTier(manualRating)} tier`} size="sm" />
                    <textarea
                      value={manualNote}
                      onChange={(e) => setManualNote(e.target.value)}
                      placeholder="Notes (optional)"
                      className="input-field resize-none"
                      rows={2}
                      style={{ fontSize: '13px' }}
                    />
                    <button
                      type="button"
                      onClick={manualAdd}
                      disabled={manualSaving || !manualName.trim()}
                      className="btn-primary w-full justify-center"
                      style={{ padding: '10px' }}
                    >
                      <Plus size={14} /> {manualSaving ? 'Adding…' : 'Add to list'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            SUGGEST PANEL — non-members
        ══════════════════════════════════════ */}
        {userId && !isMember && (
          <div className="glass-card overflow-hidden" style={{ padding: 0 }}>
            <button
              onClick={() => setSuggestOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                <Plus size={14} /> Suggest a Drink
              </span>
              {suggestOpen ? <ChevronUp size={15} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />}
            </button>

            {suggestOpen && (
              <div className="px-4 pb-4 space-y-2.5">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  The list owners will get a notification and can approve or reject your suggestion.
                </p>
                <input value={suggestName} onChange={(e) => setSuggestName(e.target.value)} placeholder="Drink name" className="input-field" style={{ fontSize: '13px', height: '38px' }} />
                <input value={suggestBrand} onChange={(e) => setSuggestBrand(e.target.value)} placeholder="Brand (optional)" className="input-field" style={{ fontSize: '13px', height: '38px' }} />
                <RatingInput value={suggestRating} onChange={setSuggestRating} label={`Rating · ${ratingToTier(suggestRating)} tier`} size="sm" />
                <textarea value={suggestNote} onChange={(e) => setSuggestNote(e.target.value)} placeholder="Why should this be on the list?" className="input-field resize-none" rows={2} style={{ fontSize: '13px' }} />
                <button
                  type="button"
                  onClick={submitSuggestion}
                  disabled={suggestSaving || !suggestName.trim()}
                  className="btn-primary w-full justify-center"
                  style={{ padding: '10px' }}
                >
                  {suggestSaving ? 'Sending…' : 'Send Suggestion'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════
            PENDING SUGGESTIONS — members only
        ══════════════════════════════════════ */}
        {isMember && suggestions.length > 0 && (
          <div className="glass-card" style={{ padding: '12px' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--amber-400)' }}>
                <Inbox size={12} />
                {pendingForMe.length > 0 ? `${pendingForMe.length} need your vote` : `${myPending.length} pending`}
              </span>
              {myPending.length > 0 && pendingForMe.length > 0 && (
                <button
                  onClick={() => setShowAllPending((s) => !s)}
                  className="text-xs hover:text-cyan-400"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {showAllPending ? 'Hide mine' : `+${myPending.length} mine`}
                </button>
              )}
            </div>

            <div className="space-y-2">
              {visiblePending.map((s) => {
                const isOwn    = s.created_by === userId;
                const isAdd    = s.action === 'add';
                const tried    = s.trials?.some((t) => t.user_id === userId);
                const userVote = s.votes?.find((v) => v.user_id === userId)?.vote;

                return (
                  <div
                    key={s.id}
                    className="rounded-xl p-2.5 space-y-2"
                    style={{ background: 'rgba(15,20,36,0.4)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
                        style={isAdd
                          ? { background: 'rgba(34,211,238,0.12)', color: 'var(--cyan-400)' }
                          : { background: 'rgba(251,191,36,0.12)', color: 'var(--amber-400)' }
                        }
                      >
                        {isAdd ? '+ Add' : '✏ Edit'}
                      </span>
                      <p className="font-bold text-sm truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                        {s.seltzer_name}
                      </p>
                      <span style={{ color: TIER_COLORS[s.proposed_tier], fontSize: '12px', fontWeight: 700 }}>
                        {s.proposed_tier}·{Number(s.proposed_rating).toFixed(1)}
                      </span>
                    </div>

                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      by @{s.created_by_user?.username}
                      {s.review_id && (
                        <Link href={`/review/${s.review_id}`} className="ml-2 inline-flex items-center gap-0.5 hover:text-cyan-400">
                          <ExternalLink size={9} /> review
                        </Link>
                      )}
                    </p>

                    {isOwn ? (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Waiting for your partner.
                        {userVote && <span style={{ color: 'var(--cyan-400)' }}> You: {userVote}.</span>}
                      </p>
                    ) : isAdd && !tried && s.review_id ? (
                      <div className="flex items-center gap-2">
                        <RatingInput
                          value={trialRatings[s.id] ?? Number(s.proposed_rating)}
                          onChange={(v) => setTrialRatings((p) => ({ ...p, [s.id]: v }))}
                          label="Try it"
                          size="sm"
                        />
                        <button
                          onClick={() => markTried(s)}
                          className="btn-primary"
                          style={{ padding: '7px 10px', fontSize: '11px' }}
                        >
                          Tried ✓
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => vote(s, 'approve')}
                          className={userVote === 'approve' ? 'btn-primary flex-1 justify-center' : 'btn-secondary flex-1 justify-center'}
                          style={{ padding: '7px', fontSize: '11px' }}>
                          <Check size={12} /> Approve
                        </button>
                        <button onClick={() => vote(s, 'reject')}
                          className={userVote === 'reject' ? 'btn-primary flex-1 justify-center' : 'btn-secondary flex-1 justify-center'}
                          style={{ padding: '7px', fontSize: '11px' }}>
                          <X size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            TIER GRID
        ══════════════════════════════════════ */}
        <div className="space-y-1.5">
          {TIERS.map((tier) => {
            const tierItems = itemsByTier[tier];
            const isCollapsed = collapsedTiers.has(tier);
            const isEmpty     = tierItems.length === 0;

            return (
              <div key={tier} className="rounded-xl overflow-hidden flex" style={{ border: '1px solid var(--border-subtle)' }}>
                {/* Tier letter rail */}
                <button
                  onClick={() => toggleTier(tier)}
                  className="w-10 flex flex-col items-center justify-center font-extrabold flex-shrink-0 hover:opacity-80 transition-opacity"
                  style={{ background: `${TIER_COLORS[tier]}22`, color: TIER_COLORS[tier] }}
                >
                  <span className="text-base">{tier}</span>
                  {!isEmpty && <span className="text-[9px] font-medium opacity-60 mt-0.5">{tierItems.length}</span>}
                </button>

                {/* Tier content */}
                <div className="flex-1 p-2 min-h-[44px]" style={{ background: 'var(--bg-card)' }}>
                  {isEmpty ? (
                    <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
                      {searchQuery ? 'No matches' : 'Empty'}
                    </span>
                  ) : isCollapsed ? (
                    <button
                      onClick={() => toggleTier(tier)}
                      className="text-xs hover:text-cyan-400 transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Show {tierItems.length} {tierItems.length === 1 ? 'drink' : 'drinks'}…
                    </button>
                  ) : viewMode === 'compact' ? (
                    /* COMPACT: thumbnails only, dense */
                    <div className="flex flex-wrap gap-1.5">
                      {tierItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => isMember && startEdit(item)}
                          className="relative group rounded-lg overflow-hidden flex-shrink-0 transition-transform hover:scale-105"
                          style={{ width: '36px', height: '36px', border: '1px solid var(--border-subtle)', cursor: isMember ? 'pointer' : 'default' }}
                          title={`${item.seltzer_name}${item.brand ? ' · ' + item.brand : ''} · ⭐${item.rating.toFixed(1)}`}
                        >
                          {item.review?.image_url ? (
                            <img src={item.review.image_url} alt={item.seltzer_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] font-bold px-0.5 text-center" style={{ background: `${TIER_COLORS[tier]}33`, color: TIER_COLORS[tier] }}>
                              {item.seltzer_name.slice(0, 4)}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    /* DETAILED: full row per item */
                    <div className="space-y-1.5">
                      {tierItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center rounded-lg overflow-hidden"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)' }}
                        >
                          {item.review?.image_url ? (
                            <Link href={`/review/${item.review_id}`} className="flex-shrink-0 hover:opacity-80" title="View original review">
                              <img src={item.review.image_url} alt={item.seltzer_name} className="w-10 h-10 object-cover" />
                            </Link>
                          ) : (
                            <div className="w-10 h-10 flex-shrink-0" style={{ background: `${TIER_COLORS[tier]}33` }} />
                          )}
                          <div className="flex-1 min-w-0 px-2.5 py-1.5">
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                              {item.seltzer_name}
                            </p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                              {item.brand && <>{item.brand} · </>}⭐ {item.rating.toFixed(1)}
                              {item.rating_contributions && Object.keys(item.rating_contributions).length > 1 && (
                                <span style={{ color: 'var(--cyan-400)' }}> · avg of {Object.keys(item.rating_contributions).length}</span>
                              )}
                              {item.note && <> · {item.note}</>}
                            </p>
                          </div>
                          {isMember && (
                            <button
                              onClick={() => startEdit(item)}
                              className="flex-shrink-0 self-stretch px-2.5 hover:bg-white/5 transition-colors"
                              style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)' }}
                              title="Edit"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ══════════════════════════════════════
          EDIT ITEM MODAL
      ══════════════════════════════════════ */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(5,8,16,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setEditingItem(null)}
        >
          <div
            className="glass-card w-full max-w-sm space-y-3"
            style={{ padding: '18px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold truncate" style={{ color: 'var(--text-primary)' }}>{editingItem.seltzer_name}</p>
                {editingItem.brand && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{editingItem.brand}</p>}
              </div>
              <button onClick={() => setEditingItem(null)} style={{ color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Tier picker */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Tier</p>
              <div className="flex gap-1.5">
                {TIERS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setEditTier(t)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-extrabold transition-all"
                    style={{
                      background: editTier === t ? TIER_COLORS[t] : `${TIER_COLORS[t]}18`,
                      color: editTier === t ? '#0a0e1a' : TIER_COLORS[t],
                      border: `1px solid ${TIER_COLORS[t]}44`,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <RatingInput value={editRating} onChange={setEditRating} size="sm" />

            <textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Notes (optional)"
              className="input-field resize-none"
              rows={2}
              style={{ fontSize: '13px' }}
            />

            <div className="flex gap-2 pt-1">
              {confirmDeleteId === editingItem.id ? (
                <>
                  <button
                    onClick={() => deleteItem(editingItem.id)}
                    className="btn-primary flex-1 justify-center"
                    style={{ padding: '9px', fontSize: '12px', background: '#fb7185', boxShadow: 'none' }}
                  >
                    <Trash2 size={12} /> Confirm Delete
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="btn-secondary" style={{ padding: '9px 12px', fontSize: '12px' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setConfirmDeleteId(editingItem.id)}
                    className="btn-secondary"
                    style={{ padding: '9px 12px', fontSize: '12px', color: '#fb7185' }}
                  >
                    <Trash2 size={12} />
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={editSaving}
                    className="btn-primary flex-1 justify-center"
                    style={{ padding: '9px', fontSize: '12px' }}
                  >
                    <Check size={12} /> {editSaving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          DELETE LIST CONFIRMATION
      ══════════════════════════════════════ */}
      {showDeleteList && list && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(5,8,16,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => !deletingList && setShowDeleteList(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl space-y-4"
            style={{
              padding: '22px',
              background: 'linear-gradient(135deg, rgba(251,113,133,0.06), rgba(15,20,36,0.95))',
              border: '1px solid rgba(251,113,133,0.25)',
              boxShadow: '0 30px 80px rgba(251,113,133,0.18)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ background: 'rgba(251,113,133,0.12)' }}
              >
                <AlertTriangle size={18} style={{ color: '#fb7185' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Delete this tier list?</p>
                <p className="text-xs mt-1 leading-snug" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>"{list.name}"</span>
                  {' '}and all <span className="font-semibold">{items.length}</span> {items.length === 1 ? 'drink' : 'drinks'} will be permanently removed for everyone, including @{list.owner?.username} and @{list.partner?.username}. This cannot be undone.
                </p>
              </div>
            </div>

            {/* Type-to-confirm gate */}
            <div>
              <label className="block text-[11px] font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                Type the list name to confirm
              </label>
              <input
                type="text"
                value={deleteListConfirm}
                onChange={(e) => setDeleteListConfirm(e.target.value)}
                placeholder={list.name}
                className="input-field"
                style={{ fontSize: '13px' }}
                autoFocus
                disabled={deletingList}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowDeleteList(false); setDeleteListConfirm(''); }}
                disabled={deletingList}
                className="btn-secondary flex-1 justify-center"
                style={{ padding: '11px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteList}
                disabled={deletingList || deleteListConfirm.trim() !== list.name}
                className="btn-primary flex-1 justify-center"
                style={{
                  padding: '11px',
                  fontSize: '13px',
                  background: '#fb7185',
                  boxShadow: 'none',
                  opacity: deleteListConfirm.trim() !== list.name && !deletingList ? 0.55 : 1,
                }}
              >
                <Trash2 size={13} /> {deletingList ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
