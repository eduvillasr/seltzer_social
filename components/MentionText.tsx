// components/MentionText.tsx
//
// Renders free-text with @username mentions auto-linked to /profile/[username].
// Drop-in replacement for {text} anywhere user-authored text appears
// (review bodies, comments).
//
// Keeps newlines via white-space:pre-wrap on the parent — the substring
// returned here is plain text + spans, no <br/> injection.

'use client';

import Link from 'next/link';
import { Fragment } from 'react';

const MENTION_RE = /(@[a-zA-Z0-9_]+)/g;

export function MentionText({ text }: { text: string }) {
  if (!text) return null;
  // .split with a capturing group keeps the matched segments interleaved
  // with the surrounding text, so we can map them inline.
  const segments = text.split(MENTION_RE);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.startsWith('@')) {
          const username = seg.slice(1);
          // Don't link an empty handle (paranoid — the regex enforces >=1 char)
          if (!username) return <Fragment key={i}>{seg}</Fragment>;
          return (
            <Link
              key={i}
              href={`/profile/${username}`}
              className="font-semibold hover:underline transition-colors"
              style={{ color: 'var(--cyan-400)' }}
            >
              {seg}
            </Link>
          );
        }
        return <Fragment key={i}>{seg}</Fragment>;
      })}
    </>
  );
}
