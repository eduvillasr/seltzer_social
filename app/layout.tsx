// app/layout.tsx

import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastHost } from '@/components/Toast';
import { PWARegistrar } from '@/components/PWARegistrar';
import { InstallPrompt } from '@/components/InstallPrompt';

export const metadata: Metadata = {
  title: 'Seltzer Social — Rate. Review. Discover.',
  description: 'The social network for sparkling water lovers. Discover, review, and rate your favorite seltzers.',
  // PWA-ish iOS hints — gives a nicer feel when added to home screen
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Seltzer Social',
  },
  // (themeColor lives in `viewport` now per Next 14 conventions — see below)
  // Prevent phone-number / address auto-detection on iOS Safari
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

// Viewport: scale to device, allow user zoom (a11y), respect notches via viewport-fit=cover
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0a0e1a',
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
        <InstallPrompt />
        <PWARegistrar />
      </body>
    </html>
  );
}