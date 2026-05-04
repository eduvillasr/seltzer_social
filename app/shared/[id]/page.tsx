'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, BellOff, Check, Plus, Star, X } from 'lucide-react';
import { Navigation } from '@/components/Navigation';
import { RatingInput } from '@/components/RatingInput';
import {
  createSharedTierListSuggestion,
  getSharedTierList,
  getSharedTierListItems,
  getSharedTierListSuggestions,
  getSharedTierListSubscription,
  markSharedSuggestionTried,
  subscribeToSharedTierList,
  supabase,
  unsubscribeFromSharedTierList,
  voteOnSharedSuggestion,
} from '@/lib/supabase';
import { SharedTierList, SharedTierListItem, SharedTierListSuggestion } from '@/types';

const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];

export default function SharedListPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [userId, setUserId] = useState('');
  const [list, setList] = useState<SharedTierList | null>(null);
  const [items, setItems] = useState<SharedTierListItem[]>([]);
  const [suggestions, setSuggestions] = useState<SharedTierListSuggestion[]>([]);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [rating, setRating] = useState(3);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [trialRatings, setTrialRatings] = useState<Record<string, number>>({});
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [params.id]);

  async function load() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) {
      setUserId(sessionData.session.user.id);
      const { data: subscription } = await getSharedTierListSubscription(sessionData.session.user.id, params.id);
      setSubscribed(!!subscription);
    }
    const [{ data: listData }, { data: itemData }, { data: suggestionData }] = await Promise.all([
      getSharedTierList(params.id),
      getSharedTierListItems(params.id),
      getSharedTierListSuggestions(params.id),
    ]);
    setList(listData);
    setItems(itemData || []);
    setSuggestions(suggestionData || []);
  }

  function ratingToTier(value: number) {
    if (value >= 4.5) return 'S';
    if (value >= 4) return 'A';
    if (value >= 3) return 'B';
    if (value >= 2) return 'C';
    if (value >= 1) return 'D';
    return 'F';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Add the drink name.'); return; }
    if (!userId) { setError('Sign in to add to this list.'); return; }
    setSaving(true);
    setError('');
    const { error: dbError } = await createSharedTierListSuggestion({
      list_id: params.id,
      created_by: userId,
      seltzer_name: name.trim(),
      brand: brand.trim() || undefined,
      proposed_rating: rating,
      proposed_tier: ratingToTier(rating),
      proposed_note: note.trim() || undefined,
    });
    if (dbError) {
      setError(dbError.message);
      setSaving(false);
      return;
    }
    setName('');
    setBrand('');
    setNote('');
    setRating(3);
    setSaving(false);
    load();
  }

  if (!list) {
    return <><Navigation /><main className="max-w-md mx-auto px-4 pt-10 pb-32"><p style={{ color: 'var(--text-secondary)' }}>Loading shared list...</p></main></>;
  }

  const canEdit = userId === list.owner_id || userId === list.partner_id;

  async function toggleSubscription() {
    if (!userId) return;
    if (subscribed) {
      await unsubscribeFromSharedTierList(userId, params.id);
      setSubscribed(false);
    } else {
      await subscribeToSharedTierList(userId, params.id);
      setSubscribed(true);
    }
  }

  async function markTried(suggestion: SharedTierListSuggestion) {
    if (!userId) return;
    const ratingValue = trialRatings[suggestion.id] ?? Number(suggestion.proposed_rating);
    await markSharedSuggestionTried(suggestion.id, userId, ratingValue);
    load();
  }

  async function vote(suggestion: SharedTierListSuggestion, nextVote: 'approve' | 'reject') {
    if (!userId || !list) return;
    await voteOnSharedSuggestion(suggestion, list, userId, nextVote);
    load();
  }

  return (
    <>
      <Navigation />
      <main className="max-w-md mx-auto px-4 pt-10 pb-32 space-y-5">
        <Link href="/feed" className="inline-flex items-center gap-2 text-sm hover:opacity-80" style={{ color: 'var(--text-tertiary)' }}>
          <ArrowLeft size={16} /> Back
        </Link>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold truncate" style={{ fontFamily: 'var(--font-display)' }}>{list.name}</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              @{list.owner?.username} + @{list.partner?.username}
            </p>
          </div>
          {userId && !canEdit && (
            <button onClick={toggleSubscription} className={subscribed ? 'btn-secondary flex-shrink-0' : 'btn-primary flex-shrink-0'} style={{ padding: '8px 12px', fontSize: '12px' }}>
              {subscribed ? <><BellOff size={13} /> Subscribed</> : <><Bell size={13} /> Subscribe</>}
            </button>
          )}
        </div>

        {canEdit && (
          <form onSubmit={submit} className="glass-card space-y-4" style={{ padding: '16px' }}>
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Drink name" />
              <input value={brand} onChange={(e) => setBrand(e.target.value)} className="input-field" placeholder="Brand" />
            </div>
            <RatingInput value={rating} onChange={setRating} label="Score" size="sm" />
            <textarea value={note} onChange={(e) => setNote(e.target.value)} className="input-field resize-none" rows={2} placeholder="Quick note..." />
            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs">{error}</div>}
            <button type="submit" disabled={saving} className="btn-primary w-full justify-center" style={{ padding: '11px' }}>
              <Plus size={14} /> {saving ? 'Suggesting...' : 'Suggest Change'}
            </button>
          </form>
        )}

        {canEdit && suggestions.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-bold text-sm px-1" style={{ color: 'var(--text-secondary)' }}>Pending Suggestions</h2>
            {suggestions.map((suggestion) => {
              const tried = suggestion.trials?.some((trial) => trial.user_id === userId);
              const userVote = suggestion.votes?.find((row) => row.user_id === userId)?.vote;
              return (
                <div key={suggestion.id} className="glass-card space-y-3" style={{ padding: '14px' }}>
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--cyan-400)' }}>Suggested by @{suggestion.created_by_user?.username}</p>
                    <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{suggestion.seltzer_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {suggestion.brand || 'No brand'} · {suggestion.proposed_tier} tier · {Number(suggestion.proposed_rating).toFixed(1)}
                    </p>
                    {suggestion.proposed_note && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{suggestion.proposed_note}</p>}
                  </div>

                  {!tried ? (
                    <div className="rounded-xl p-3" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.14)' }}>
                      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--amber-400)' }}>Mark "I've tried it" before voting</p>
                      <div className="flex items-end gap-2">
                        <RatingInput
                          value={trialRatings[suggestion.id] ?? Number(suggestion.proposed_rating)}
                          onChange={(value) => setTrialRatings((prev) => ({ ...prev, [suggestion.id]: value }))}
                          label="Your quick score"
                          size="sm"
                        />
                        <button type="button" onClick={() => markTried(suggestion)} className="btn-primary" style={{ padding: '8px 12px', fontSize: '12px' }}>
                          Tried It
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => vote(suggestion, 'approve')} className={userVote === 'approve' ? 'btn-primary flex-1 justify-center' : 'btn-secondary flex-1 justify-center'} style={{ padding: '9px', fontSize: '12px' }}>
                        <Check size={13} /> Approve
                      </button>
                      <button type="button" onClick={() => vote(suggestion, 'reject')} className={userVote === 'reject' ? 'btn-primary flex-1 justify-center' : 'btn-secondary flex-1 justify-center'} style={{ padding: '9px', fontSize: '12px' }}>
                        <X size={13} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2">
          {TIERS.map((tier) => {
            const tierItems = items.filter((item) => item.tier === tier);
            return (
              <div key={tier} className="rounded-xl overflow-hidden flex" style={{ border: '1px solid var(--border-subtle)' }}>
                <div className="w-10 flex items-center justify-center font-extrabold" style={{ background: 'rgba(34,211,238,0.18)' }}>{tier}</div>
                <div className="flex-1 p-2 min-h-[44px] flex flex-wrap gap-1.5" style={{ background: 'var(--bg-card)' }}>
                  {tierItems.length === 0 ? (
                    <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>Empty</span>
                  ) : tierItems.map((item) => (
                    <div key={item.id} className="rounded-lg px-2 py-1 text-xs" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)' }}>
                      <span className="font-semibold">{item.seltzer_name}</span>
                      <span style={{ color: 'var(--text-muted)' }}> <Star size={10} className="inline star-filled" />{item.rating.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}
