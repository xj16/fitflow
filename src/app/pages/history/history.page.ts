import { Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonButton,
  IonButtons,
  IonFab,
  IonFabButton,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  AlertController,
} from '@ionic/angular/standalone';
import { DataService } from '../../core/services/data.service';
import { SyncService } from '../../core/sync/sync.service';
import { workoutVolume, workoutReps } from '../../core/utils/training-math';
import { Workout } from '../../core/models/workout.model';

/**
 * The home tab: a reverse-chronological list of logged workouts with a
 * one-tap "start workout" action. Each row shows quick session stats
 * (exercises, sets, total volume) derived on the fly from the training-math
 * helpers so numbers are always consistent with the analytics tab.
 */
@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonIcon,
    IonButton,
    IonButtons,
    IonFab,
    IonFabButton,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
  ],
  templateUrl: './history.page.html',
})
export class HistoryPage {
  private readonly data = inject(DataService);
  private readonly sync = inject(SyncService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);

  readonly workouts = this.data.workouts;
  readonly syncStatus = this.sync.status;
  readonly syncConfigured = this.sync.isConfigured;

  readonly totalVolume = computed(() =>
    this.workouts().reduce((sum, w) => sum + workoutVolume(w), 0),
  );

  volumeOf(w: Workout): number {
    return workoutVolume(w);
  }

  repsOf(w: Workout): number {
    return workoutReps(w);
  }

  setCount(w: Workout): number {
    return w.exercises.reduce((n, e) => n + e.sets.length, 0);
  }

  async startWorkout(): Promise<void> {
    const w = await this.data.createWorkout(this.defaultTitle());
    await this.router.navigate(['/workout', w.id]);
  }

  openWorkout(id: string): void {
    void this.router.navigate(['/workout', id]);
  }

  async confirmDelete(w: Workout, sliding: IonItemSliding): Promise<void> {
    await sliding.close();
    const alert = await this.alertCtrl.create({
      header: 'Delete workout?',
      message: `"${w.title}" will be removed. This cannot be undone.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            void this.data.deleteWorkout(w.id);
          },
        },
      ],
    });
    await alert.present();
  }

  async runSync(): Promise<void> {
    const msg = await this.sync.syncNow();
    const alert = await this.alertCtrl.create({
      header: 'Sync',
      message: msg,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private defaultTitle(): string {
    const hour = new Date().getHours();
    if (hour < 11) {
      return 'Morning Session';
    }
    if (hour < 17) {
      return 'Afternoon Session';
    }
    return 'Evening Session';
  }
}
