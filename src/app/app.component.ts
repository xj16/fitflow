import { Component, inject, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  add,
  addCircleOutline,
  barbellOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  cloudOfflineOutline,
  cloudUploadOutline,
  ellipseOutline,
  flameOutline,
  listOutline,
  playOutline,
  removeCircleOutline,
  settingsOutline,
  statsChartOutline,
  timerOutline,
  trashOutline,
  trophyOutline,
  addOutline,
  closeOutline,
  refreshOutline,
  calendarOutline,
  createOutline,
  chevronForwardOutline,
  saveOutline,
  pauseOutline,
} from 'ionicons/icons';
import { DataService } from './core/services/data.service';
import { SyncService } from './core/sync/sync.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent implements OnInit {
  private readonly data = inject(DataService);
  private readonly sync = inject(SyncService);

  constructor() {
    addIcons({
      add,
      addOutline,
      addCircleOutline,
      barbellOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      cloudOfflineOutline,
      cloudUploadOutline,
      ellipseOutline,
      flameOutline,
      listOutline,
      playOutline,
      removeCircleOutline,
      settingsOutline,
      statsChartOutline,
      timerOutline,
      trashOutline,
      trophyOutline,
      closeOutline,
      refreshOutline,
      calendarOutline,
      createOutline,
      chevronForwardOutline,
      saveOutline,
      pauseOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.data.init();
    await this.sync.init();
  }
}
