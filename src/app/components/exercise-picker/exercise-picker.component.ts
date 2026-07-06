import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonChip,
  ModalController,
  AlertController,
} from '@ionic/angular/standalone';
import { DataService } from '../../core/services/data.service';
import {
  Equipment,
  Exercise,
  MuscleGroup,
  MUSCLE_GROUPS,
  EQUIPMENT_TYPES,
} from '../../core/models/workout.model';

/**
 * Bottom-sheet modal for picking an exercise to add to the current workout.
 *
 * Supports free-text search and muscle-group filtering over the offline
 * library, plus inline creation of a brand-new exercise (which is persisted
 * immediately and then selected). Dismisses with the chosen Exercise.
 */
@Component({
  selector: 'app-exercise-picker',
  standalone: true,
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonIcon,
    IonChip,
  ],
  templateUrl: './exercise-picker.component.html',
  styleUrl: './exercise-picker.component.scss',
})
export class ExercisePickerComponent {
  private readonly data = inject(DataService);
  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);

  readonly query = signal('');
  readonly groupFilter = signal<MuscleGroup | 'all'>('all');
  readonly groups = MUSCLE_GROUPS;

  readonly filtered = computed<Exercise[]>(() => {
    const q = this.query().trim().toLowerCase();
    const group = this.groupFilter();
    return this.data.exercises().filter((e) => {
      const matchesGroup = group === 'all' || e.muscleGroup === group;
      const matchesQuery = q === '' || e.name.toLowerCase().includes(q);
      return matchesGroup && matchesQuery;
    });
  });

  onSearch(value: string | null | undefined): void {
    this.query.set(value ?? '');
  }

  setGroup(group: MuscleGroup | 'all'): void {
    this.groupFilter.set(group);
  }

  pick(exercise: Exercise): void {
    void this.modalCtrl.dismiss(exercise);
  }

  cancel(): void {
    void this.modalCtrl.dismiss();
  }

  async createNew(): Promise<void> {
    const groupOpts = MUSCLE_GROUPS.map((g) => ({
      type: 'radio' as const,
      label: g,
      value: g,
    }));
    const alert = await this.alertCtrl.create({
      header: 'New exercise',
      inputs: [
        { name: 'name', type: 'text', placeholder: 'Exercise name' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Next',
          handler: async (val: { name: string }) => {
            const name = val.name?.trim();
            if (name) {
              await this.chooseGroup(name, groupOpts);
            }
          },
        },
      ],
    });
    await alert.present();
  }

  private async chooseGroup(
    name: string,
    groupOpts: Array<{ type: 'radio'; label: string; value: MuscleGroup }>,
  ): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Muscle group',
      inputs: groupOpts,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create',
          handler: async (group: MuscleGroup) => {
            const created = await this.data.createExercise({
              name,
              muscleGroup: group ?? 'other',
              equipment: this.guessEquipment(name),
            });
            this.pick(created);
          },
        },
      ],
    });
    await alert.present();
  }

  /** Naive equipment inference from the name, just to prefill something sane. */
  private guessEquipment(name: string): Equipment {
    const n = name.toLowerCase();
    const found = EQUIPMENT_TYPES.find((eq) => n.includes(eq));
    if (found) {
      return found;
    }
    if (n.includes('press') || n.includes('curl')) {
      return 'dumbbell';
    }
    return 'other';
  }
}
