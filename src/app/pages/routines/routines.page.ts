import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonButton,
  IonFab,
  IonFabButton,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonCard,
  IonCardContent,
  AlertController,
  ModalController,
} from '@ionic/angular/standalone';
import { DataService } from '../../core/services/data.service';
import { Routine, Workout } from '../../core/models/workout.model';
import { uuid } from '../../core/utils/id';
import {
  nextWorkingWeight,
  roundToPlate,
} from '../../core/utils/training-math';
import { RoutineBuilderComponent } from '../../components/routine-builder/routine-builder.component';

/**
 * Routines tab: saved progressive-overload templates. Each routine is a set of
 * days, each day a list of exercise "slots" with a target and an increment.
 * Starting a routine day creates a pre-filled workout whose weights are the
 * next linear-progression step computed from the user's history.
 */
@Component({
  selector: 'app-routines',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonItem,
    IonLabel,
    IonNote,
    IonIcon,
    IonButton,
    IonFab,
    IonFabButton,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonCard,
    IonCardContent,
  ],
  templateUrl: './routines.page.html',
})
export class RoutinesPage {
  private readonly data = inject(DataService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly modalCtrl = inject(ModalController);

  readonly routines = this.data.routines;

  slotSummary(routine: Routine): string {
    const totalSlots = routine.days.reduce((n, d) => n + d.slots.length, 0);
    return `${routine.days.length} day${routine.days.length === 1 ? '' : 's'} · ${totalSlots} exercises`;
  }

  async createRoutine(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: RoutineBuilderComponent,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<Routine>();
    if (data) {
      await this.data.saveRoutine(data);
    }
  }

  async editRoutine(routine: Routine, sliding: IonItemSliding): Promise<void> {
    await sliding.close();
    const modal = await this.modalCtrl.create({
      component: RoutineBuilderComponent,
      componentProps: { existing: routine },
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<Routine>();
    if (data) {
      await this.data.saveRoutine(data);
    }
  }

  async confirmDelete(routine: Routine, sliding: IonItemSliding): Promise<void> {
    await sliding.close();
    const alert = await this.alertCtrl.create({
      header: 'Delete routine?',
      message: `"${routine.name}" will be removed.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => void this.data.deleteRoutine(routine.id),
        },
      ],
    });
    await alert.present();
  }

  /**
   * Start a routine day: create a workout pre-loaded with each slot's exercise
   * and a target working weight advanced one linear-progression step past the
   * last time the user hit that exercise.
   */
  async startDay(routine: Routine, dayId: string): Promise<void> {
    const day = routine.days.find((d) => d.id === dayId);
    if (!day) {
      return;
    }
    const workout = await this.data.createWorkout(`${routine.name} · ${day.name}`);
    const history = this.data.workouts();

    for (const slot of day.slots) {
      // Find the most recent working weight/reps for this exercise.
      const target = this.projectWeight(history, slot.exerciseId, slot);
      const exercise = this.data.exercises().find((e) => e.id === slot.exerciseId);
      const entry = {
        id: uuid(),
        exerciseId: slot.exerciseId,
        name: exercise?.name ?? slot.name,
        sets: Array.from({ length: slot.targetSets }, () => ({
          id: uuid(),
          weight: target,
          reps: slot.targetReps,
          done: false,
        })),
      };
      const current = this.data.getWorkout(workout.id);
      if (current) {
        await this.data.updateWorkout(workout.id, {
          exercises: [...current.exercises, entry],
        });
      }
    }
    await this.router.navigate(['/workout', workout.id]);
  }

  private projectWeight(
    history: Workout[],
    exerciseId: string,
    slot: { targetReps: number; startWeight: number; incrementKg: number },
  ): number {
    // Scan history newest-first for the last time this exercise was worked.
    for (const w of history) {
      const entry = w.exercises.find((e) => e.exerciseId === exerciseId);
      if (!entry) {
        continue;
      }
      const workingReps = entry.sets
        .filter((s) => s.done && !s.warmup)
        .map((s) => s.reps);
      const lastWeight = entry.sets
        .filter((s) => s.done && !s.warmup)
        .reduce((max, s) => Math.max(max, s.weight), 0);
      if (workingReps.length > 0 && lastWeight > 0) {
        return roundToPlate(
          nextWorkingWeight(
            lastWeight,
            workingReps,
            slot.targetReps,
            slot.incrementKg,
          ),
        );
      }
    }
    return slot.startWeight;
  }

  daySummary(routine: Routine, dayName: string): string {
    return `${routine.name} — ${dayName}`;
  }
}
