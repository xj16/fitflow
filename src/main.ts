import { bootstrapApplication } from '@angular/platform-browser';
import { isDevMode } from '@angular/core';
import {
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular({ mode: 'md' }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    // Register the generated service worker for a true installable, offline
    // cold-start PWA. Disabled in dev (isDevMode) so live-reload works, and
    // registration is deferred until the app is stable so it never competes
    // with first paint. The SW caches the app shell + Ionic assets; user data
    // still lives in IndexedDB, so both the shell and the data survive offline.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
}).catch((err) => console.error(err));
