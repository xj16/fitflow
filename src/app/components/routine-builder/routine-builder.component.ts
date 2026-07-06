import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonItem,
  IonInput,
  IonList,
  IonCard,
  IonCardHeader,
  IonCardContent,
  ModalController,
} from '@ionic/angular/standalone';
import { DataService } from '../../core/services/data.service';
import { ExercisePickerComponent } from '../exercise-picker/exercise-picker.component';
import {
  Exercise,
  Routine,
  RoutineDay,
  RoutineSlot,
} from '../../core/models/workout.model';
import { nowIso, uuid } from '../../core/utils/id';

/**
 * Modal for creating or editing a progressive-overload routine.
 *
 * A routine is a name plus one or more days; each day holds exercise slots
 * with target sets/reps, a starting weight and a per-session increment. On
 * save it emits a fully-formed Routine (new or edited) via modal dismissal.
 */
@Component({
  selector: 'app-routine-builder',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonItem,
    IonInput,
    IonList,
    IonCard,
    IonCardHeader,
    IonCardContent,
  ],
  templateUrl: './routine-builder.component.html',
  styleUrl: './routine-builder.component.scss',
})
export class RoutineBuilderComponent implements OnInit {
  private readonly data = inject(DataService);
  private readonly modalCtrl = inject(ModalController);

  @Input() existing?: Routine;

  readonly name = signal('');
  readonly description = signal('');
  readonly days = signal<RoutineDay[]>([]);

  ngOnInit(): void {
    if (this.existing) {
      this.name.set(this.existing.name);
      this.description.set(this.existing.description ?? '');
      // Deep-clone so edits don't mutate the stored routine until saved.
      this.days.set(JSON.parse(JSON.stringify(this.existing.days)));
    } else {
      this.days.set([this.blankDay('Day A')]);
    }
  }

  private blankDay(name: string): RoutineDay {
    return { id: uuid(), name, slots: [] };
  }

  addDay(): void {
    const letter = String.fromCharCode(65 + this.days().length);
    this.days.update((d) => [...d, this.blankDay(`Day ${letter}`)]);
  }

  removeDay(dayId: string): void {
    this.days.update((d) => d.filter((day) => day.id !== dayId));
  }

  updateDayName(dayId: string, value: string | number | null | undefined): void {
    this.days.update((days) =>
      days.map((d) => (d.id === dayId ? { ...d, name: String(value ?? '') } : d)),
    );
  }

  async addSlot(dayId: string): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: ExercisePickerComponent,
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<Exercise>();
    if (!data) {
      return;
    }
    const slot: RoutineSlot = {
      id: uuid(),
      exerciseId: data.id,
      name: data.name,
      targetSets: 3,
      targetReps: 5,
      startWeight: 20,
      incrementKg: 2.5,
    };
    this.days.update((days) =>
      days.map((d) =>
        d.id === dayId ? { ...d, slots: [...d.slots, slot] } : d,
      ),
    );
  }

  removeSlot(dayId: string, slotId: string): void {
    this.days.update((days) =>
      days.map((d) =>
        d.id === dayId
          ? { ...d, slots: d.slots.filter((s) => s.id !== slotId) }
          : d,
      ),
    );
  }

  updateSlot(
    dayId: string,
    slotId: string,
    field: keyof RoutineSlot,
    value: string | number | null | undefined,
  ): void {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    this.days.update((days) =>
      days.map((d) =>
        d.id !== dayId
          ? d
          : {
              ...d,
              slots: d.slots.map((s) =>
                s.id === slotId
                  ? { ...s, [field]: isNaN(num) ? 0 : Math.max(0, num) }
                  : s,
              ),
            },
      ),
    );
  }

  canSave(): boolean {
    return (
      this.name().trim().length > 0 &&
      this.days().some((d) => d.slots.length > 0)
    );
  }

  save(): void {
    if (!this.canSave()) {
      return;
    }
    const ts = nowIso();
    const routine: Routine = {
      id: this.existing?.id ?? uuid(),
      name: this.name().trim(),
      description: this.description().trim() || undefined,
      days: this.days(),
      createdAt: this.existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    void this.modalCtrl.dismiss(routine);
  }

  cancel(): void {
    void this.modalCtrl.dismiss();
  }
}
