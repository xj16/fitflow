import { Routes } from '@angular/router';

/**
 * Route table. Lazy-loads every page (standalone components) so the initial
 * bundle stays small — important for an app meant to install as a lightweight
 * PWA / Capacitor build. The tabs shell hosts the four primary sections.
 */
export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () =>
      import('./pages/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      {
        path: 'history',
        loadComponent: () =>
          import('./pages/history/history.page').then((m) => m.HistoryPage),
      },
      {
        path: 'routines',
        loadComponent: () =>
          import('./pages/routines/routines.page').then((m) => m.RoutinesPage),
      },
      {
        path: 'stats',
        loadComponent: () =>
          import('./pages/stats/stats.page').then((m) => m.StatsPage),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: '',
        redirectTo: 'history',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: 'workout/:id',
    loadComponent: () =>
      import('./pages/workout/workout.page').then((m) => m.WorkoutPage),
  },
  {
    path: '',
    redirectTo: 'tabs/history',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'tabs/history',
  },
];
