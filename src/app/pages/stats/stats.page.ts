import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { DataService } from '../../core/services/data.service';
import { MiniChartComponent } from '../../components/mini-chart/mini-chart.component';
import {
  exercisesInHistory,
  oneRepMaxSeries,
  weeklyVolume,
} from '../../core/utils/analytics';
import { PersonalRecord } from '../../core/models/workout.model';

/**
 * Analytics tab: personal records, weekly volume trend, and a per-exercise
 * estimated-1RM progression chart. Everything is derived reactively from the
 * workout history in DataService — no data is stored twice.
 */
@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [
    DecimalPipe,
    DatePipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonIcon,
    IonSelect,
    IonSelectOption,
    MiniChartComponent,
  ],
  templateUrl: './stats.page.html',
})
export class StatsPage {
  private readonly data = inject(DataService);

  readonly workouts = this.data.workouts;

  readonly prs = computed<PersonalRecord[]>(() =>
    [...this.data.personalRecords().values()].sort(
      (a, b) => b.bestEstimated1RM - a.bestEstimated1RM,
    ),
  );

  readonly weekly = computed(() => weeklyVolume(this.workouts(), 8));

  readonly trackedExercises = computed(() =>
    exercisesInHistory(this.workouts()).filter((e) => e.sessions >= 1),
  );

  /** Currently selected exercise for the 1RM progression chart. */
  readonly selectedExerciseId = signal<string | null>(null);

  readonly effectiveExerciseId = computed(() => {
    const sel = this.selectedExerciseId();
    if (sel) {
      return sel;
    }
    const first = this.trackedExercises()[0];
    return first ? first.exerciseId : null;
  });

  readonly oneRmSeries = computed(() => {
    const id = this.effectiveExerciseId();
    return id ? oneRepMaxSeries(this.workouts(), id) : [];
  });

  readonly selectedName = computed(() => {
    const id = this.effectiveExerciseId();
    const found = this.trackedExercises().find((e) => e.exerciseId === id);
    return found?.name ?? '';
  });

  onSelectExercise(id: string | null | undefined): void {
    this.selectedExerciseId.set(id ?? null);
  }
}
