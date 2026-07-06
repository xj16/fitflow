import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration. `webDir` points at the Angular production build
 * output. To ship native apps:
 *
 *   npm run build:prod
 *   npx cap add android   # and/or ios
 *   npx cap sync
 *   npx cap open android
 *
 * The offline store uses IndexedDB inside the Capacitor WebView, which persists
 * across app launches with no server. A native SQLite backend can be dropped in
 * behind the KvStore interface without touching any UI code.
 */
const config: CapacitorConfig = {
  appId: 'dev.xj16.fitflow',
  appName: 'FitFlow',
  webDir: 'dist/fitflow/browser',
  server: {
    androidScheme: 'https',
  },
};

export default config;
