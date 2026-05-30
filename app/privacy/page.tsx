// app/privacy/page.tsx
// Public privacy policy. Linked from settings, onboarding EULA gate, and the
// App Store / Play store listings. Plain content — review with counsel before
// launch and update the "Last updated" date when you change it.

'use client';

import { BackHeader } from '@/components/BackHeader';

const LAST_UPDATED = 'May 29, 2026';

export default function PrivacyPage() {
  return (
    <>
      <main className="max-w-md mx-auto px-4 pt-12 pb-32 space-y-5">
        <BackHeader href="/settings" />

        <div>
          <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'var(--font-display)' }}>Privacy Policy</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Last updated {LAST_UPDATED}</p>
        </div>

        <div className="space-y-5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <p>
            Seltzer Social ("we", "us") respects your privacy. This policy explains what we
            collect, why, and the choices you have.
          </p>

          <Section title="Information we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li><b>Account info</b> — email and username you provide at sign-up.</li>
              <li><b>Content you create</b> — reviews, ratings, comments, tier lists, photos, and your profile bio and avatar.</li>
              <li><b>Social graph</b> — who you follow and who follows you.</li>
              <li><b>Device info</b> — if you enable push notifications, a device token so we can deliver them.</li>
            </ul>
          </Section>

          <Section title="How we use it">
            <p>To operate the app: show your content to the people you intend, build your feed and
            recommendations, send notifications you opt into, and keep the community safe (e.g.
            handling reports and blocks).</p>
          </Section>

          <Section title="What we share">
            <p>We do not sell your personal information. Content you post (reviews, comments,
            profile) is visible to other users by design. We use Supabase for hosting, database,
            and storage, and Firebase Cloud Messaging to deliver push notifications.</p>
          </Section>

          <Section title="Your choices">
            <ul className="list-disc pl-5 space-y-1">
              <li><b>Delete your account</b> at any time from Settings — this permanently removes your profile, reviews, comments, and other content.</li>
              <li><b>Block</b> users to hide their content from you.</li>
              <li><b>Turn off push notifications</b> in your device settings.</li>
            </ul>
          </Section>

          <Section title="Data retention">
            <p>We keep your content until you delete it or delete your account. Deleting your
            account removes your data from our active systems; routine backups are purged on a
            rolling basis.</p>
          </Section>

          <Section title="Children">
            <p>Seltzer Social is not directed to children under 13 (or the minimum age in your
            country), and is intended for users of legal drinking age in their jurisdiction.</p>
          </Section>

          <Section title="Contact">
            <p>Questions about this policy? Email <b>privacy@seltzersocial.app</b>.</p>
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
