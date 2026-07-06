import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonLabel,
  IonInput,
  IonNote,
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonCardTitle,
  IonCheckbox,
  IonSegment,
  IonSegmentButton,
  ActionSheetController,
  AlertController,
  ModalController,
} from '@ionic/angular/standalone';
import { DataService } from '../../core/services/data.service';
import { RestTimerService } from '../../core/services/rest-timer.service';
import { RestTimerComponent } from '../../components/rest-timer/rest-timer.component';
import { ExercisePickerComponent } from '../../components/exercise-picker/exercise-picker.component';
import {
  bestEntry1RM,
  epley1RM,
  exerciseVolume,
} from '../../core/utils/training-math';
import {
  Exercise,
  ExerciseEntry,
  WeightUnit,
  Workout,
  WorkoutSet,
} from '../../core/models/workout.model';

/**
 * The live workout screen — the core of FitFlow.
 *
 * Renders the current session as a stack of exercise cards, each with an
 * editable set grid (weight / reps / done). Marking a set done starts the
 * rest timer and shows a live estimated-1RM readout for that set. All edits
 * flow straight through DataService, which persists to the offline store on
 * every keystroke, so nothing is ever lost even if the app is killed.
 */
@Component({
  selector: 'app-workout',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonLabel,
    IonInput,
    IonNote,
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonCardTitle,
    IonCheckbox,
    IonSegment,
    IonSegmentButton,
    RestTimerComponent,
  ],
  templateUrl: './workout.page.html',
  styleUrl: './workout.page.scss',
})
export class WorkoutPage {
  private readonly data = inject(DataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly actionSheet = inject(ActionSheetController);
  private readonly alertCtrl = inject(AlertController);
  private readonly modalCtrl = inject(ModalController);
  readonly timer = inject(RestTimerService);

  private readonly workoutId = this.route.snapshot.paramMap.get('id') ?? '';

  /** Reactive view of the current workout pulled from the data signal. */
  readonly workout = computed<Workout | undefined>(() =>
    this.data.workouts().find((w) => w.id === this.workoutId),
  );

  readonly totalVolume = computed(() => {
    const w = this.workout();
    return w ? w.exercises.reduce((s, e) => s + exerciseVolume(e), 0) : 0;
  });

  /** Default rest duration in seconds, adjustable per user preference. */
  readonly restSeconds = signal(90);

  entryVolume(entry: ExerciseEntry): number {
    return exerciseVolume(entry);
  }

  entryBest1RM(entry: ExerciseEntry): number {
    return bestEntry1RM(entry);
  }

  setEstimate(set: WorkoutSet): number {
    if (set.warmup || set.weight <= 0 || set.reps <= 0) {
      return 0;
    }
    return epley1RM(set.weight, set.reps);
  }

  async renameWorkout(): Promise<void> {
    const w = this.workout();
    if (!w) {
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Rename workout',
      inputs: [{ name: 'title', value: w.title, type: 'text' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (val: { title: string }) => {
            const title = val.title?.trim();
            if (title) {
              void this.data.updateWorkout(w.id, { title });
            }
          },
        },
      ],
    });
    await alert.present();
  }

  setUnit(unit: string | undefined): void {
    const w = this.workout();
    if (w && (unit === 'kg' || unit === 'lb')) {
      void this.data.updateWorkout(w.id, { unit: unit as WeightUnit });
    }
  }

  async addExercise(): Promise<void> {
    const w = this.workout();
    if (!w) {
      return;
    }
    const modal = await this.modalCtrl.create({
      component: ExercisePickerComponent,
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<Exercise>();
    if (data) {
      await this.data.addExerciseToWorkout(w.id, data);
    }
  }

  addSet(entry: ExerciseEntry): void {
    const w = this.workout();
    if (w) {
      void this.data.addSet(w.id, entry.id);
    }
  }

  removeSet(entry: ExerciseEntry, set: WorkoutSet): void {
    const w = this.workout();
    if (w) {
      void this.data.removeSet(w.id, entry.id, set.id);
    }
  }

  updateSetField(
    entry: ExerciseEntry,
    set: WorkoutSet,
    field: 'weight' | 'reps' | 'rpe',
    value: string | number | null | undefined,
  ): void {
    const w = this.workout();
    if (!w) {
      return;
    }
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    void this.data.updateSet(w.id, entry.id, set.id, {
      [field]: isNaN(num) ? 0 : Math.max(0, num),
    });
  }

  toggleDone(entry: ExerciseEntry, set: WorkoutSet): void {
    const w = this.workout();
    if (!w) {
      return;
    }
    const nowDone = !set.done;
    void this.data.updateSet(w.id, entry.id, set.id, { done: nowDone });
    // Completing a working set kicks off the rest timer automatically.
    if (nowDone && !set.warmup) {
      this.timer.start(this.restSeconds());
    }
  }

  toggleWarmup(entry: ExerciseEntry, set: WorkoutSet): void {
    const w = this.workout();
    if (w) {
      void this.data.updateSet(w.id, entry.id, set.id, { warmup: !set.warmup });
    }
  }

  async removeEntry(entry: ExerciseEntry): Promise<void> {
    const w = this.workout();
    if (!w) {
      return;
    }
    const sheet = await this.actionSheet.create({
      header: entry.name,
      buttons: [
        {
          text: 'Remove exercise',
          role: 'destructive',
          icon: 'trash-outline',
          handler: () => {
            void this.data.removeExerciseEntry(w.id, entry.id);
          },
        },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  async finish(): Promise<void> {
    this.timer.stop();
    await this.router.navigate(['/tabs/history']);
  }

  restLabel(): string {
    return `${this.restSeconds()}s`;
  }

  bumpRest(delta: number): void {
    this.restSeconds.update((s) => Math.max(15, Math.min(600, s + delta)));
  }
}
