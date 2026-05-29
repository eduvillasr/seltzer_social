import type { CapacitorConfig } from '@capacitor/cli';

// Seltzer Social ships its SSR Next.js app inside a thin native shell.
// Because the app has server-rendered/dynamic routes and Supabase auth
// callbacks, it can't be statically exported — so instead of bundling files,
// the native WebView loads the deployed production site via `server.url`.
//
// 1. Deploy the web app (Vercel) and put that HTTPS URL in `server.url`.
// 2. `npm run cap:sync` after each native config change.
// 3. See CAPACITOR_SETUP.md for the full first-run walkthrough.
const config: CapacitorConfig = {
  appId: 'app.seltzersocial',
  appName: 'Seltzer Social',
  // Required by the CLI even when loading a remote URL; points at a real
  // folder so `cap sync` has something to copy.
  webDir: 'public',
  backgroundColor: '#0a0e1a',
  server: {
    // ⚠️ Replace with your production HTTPS domain before building a release.
    url: 'https://seltzer-social.vercel.app',
    cleartext: false,
  },
  ios: {
    backgroundColor: '#0a0e1a',
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#0a0e1a',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0a0e1a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0e1a',
    },
  },
};

export default config;
