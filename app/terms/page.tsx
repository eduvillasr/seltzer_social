// app/terms/page.tsx
// Public Terms of Service / EULA. Linked from settings, the onboarding terms
// gate, and the store listings. The "no objectionable content" + enforcement
// clauses satisfy Apple App Store guideline 1.2 for user-generated content.
// Review with counsel before launch.

'use client';

import { BackHeader } from '@/components/BackHeader';

const LAST_UPDATED = 'May 29, 2026';

export default function TermsPage() {
  return (
    <>
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <BackHeader href="/settings" />

        <div>
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>Terms of Service</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Last updated {LAST_UPDATED}</p>
        </div>

        <div className="space-y-5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <p>By creating an account or using Seltzer Social, you agree to these Terms. If you do
          not agree, do not use the app.</p>

          <Section title="Eligibility">
            <p>You must be of legal drinking age in your jurisdiction to use Seltzer Social.
            Content on the app relates to alcoholic and non-alcoholic beverages; please drink
            responsibly.</p>
          </Section>

          <Section title="Your content">
            <p>You own the reviews, comments, photos, and other content you post. You grant us a
            license to host and display it within the app so it works as intended.</p>
          </Section>

          <Section title="Acceptable use — zero tolerance for objectionable content">
            <p>You agree <b>not</b> to post content that is unlawful, harassing, hateful, abusive,
            threatening, sexually explicit, or otherwise objectionable, and not to harass or
            impersonate other users. There is no tolerance for objectionable content or abusive
            users.</p>
          </Section>

          <Section title="Reporting, blocking, and enforcement">
            <p>You can <b>report</b> any review, comment, or profile, and <b>block</b> any user.
            We review reports and will remove objectionable content and may suspend or remove
            users who violate these Terms, typically within 24 hours of a report. Blocking a user
            hides their content from you and prevents them from interacting with you.</p>
          </Section>

          <Section title="Account deletion">
            <p>You may delete your account at any time from Settings. Deletion permanently removes
            your content from our active systems.</p>
          </Section>

          <Section title="Disclaimer">
            <p>The app is provided "as is" without warranties. Ratings and reviews reflect users'
            personal opinions, not ours.</p>
          </Section>

          <Section title="Changes">
            <p>We may update these Terms; continued use after an update means you accept the
            revised Terms.</p>
          </Section>

          <Section title="Contact">
            <p>Questions? Email <b>support@seltzersocial.app</b>.</p>
          </Section>
        </div>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {children}
    </section>
  );
}
