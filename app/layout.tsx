// app/layout.tsx

import type { Metadata } from 'next';
import './globals.css';
import { ToastHost } from '@/components/Toast';

export const metadata: Metadata = {
  title: 'Seltzer Social — Rate. Review. Discover.',
  description: 'The social network for sparkling water lovers. Discover, review, and rate your favorite seltzers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <ToastHost />
      </body>
    </html>
  );
}