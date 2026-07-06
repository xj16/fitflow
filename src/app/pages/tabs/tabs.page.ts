import { Component } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';

/**
 * Bottom tab-bar shell hosting the four primary sections. This is the classic
 * Ionic tabs layout; child routes render inside the tab outlet.
 */
@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="history">
          <ion-icon name="barbell-outline"></ion-icon>
          <ion-label>Log</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="routines">
          <ion-icon name="list-outline"></ion-icon>
          <ion-label>Routines</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="stats">
          <ion-icon name="stats-chart-outline"></ion-icon>
          <ion-label>Stats</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="settings">
          <ion-icon name="settings-outline"></ion-icon>
          <ion-label>Settings</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {}
