/**
 * Domain models for FitFlow.
 *
 * Every entity carries a client-generated UUID so records created offline on
 * one device reconcile cleanly with the same record synced from another. The
 * `updatedAt` timestamp drives last-write-wins conflict resolution during sync.
 */

/** A single logged set within an exercise entry. */
export interface WorkoutSet {
  id: string;
  /** Weight lifted, in the workout's unit (kg or lb). */
  weight: number;
  /** Repetitions completed. */
  reps: number;
  /** Rate of Perceived Exertion, 1-10. Optional. */
  rpe?: number;
  /** Marks a warm-up set so it is excluded from PR/1RM calculations. */
  warmup?: boolean;
  /** Whether the set was actually completed (vs. planned). */
  done: boolean;
}

/** One exercise performed in a session, holding its sets. */
export interface ExerciseEntry {
  id: string;
  /** References an Exercise definition by id. */
  exerciseId: string;
  /** Denormalized name so history renders without a join. */
  name: string;
  sets: WorkoutSet[];
  /** Free-form note, e.g. "felt easy, add 2.5kg next week". */
  notes?: string;
}

/** A complete training session. */
export interface Workout {
  id: string;
  /** ISO-8601 date-time the session started. */
  date: string;
  title: string;
  /** kg or lb — applied to every set in the workout. */
  unit: WeightUnit;
  exercises: ExerciseEntry[];
  /** Session duration in seconds, if tracked. */
  durationSec?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Soft-delete tombstone so deletions propagate through sync. */
  deleted?: boolean;
}

/** A reusable exercise definition in the user's library. */
export interface Exercise {
  id: string;
  name: string;
  /** Primary muscle group, used for grouping and filtering. */
  muscleGroup: MuscleGroup;
  /** barbell, dumbbell, machine, bodyweight, etc. */
  equipment: Equipment;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

/** A saved progressive-overload template. */
export interface Routine {
  id: string;
  name: string;
  description?: string;
  days: RoutineDay[];
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface RoutineDay {
  id: string;
  name: string;
  slots: RoutineSlot[];
}

/** A planned exercise within a routine day, with target progression. */
export interface RoutineSlot {
  id: string;
  exerciseId: string;
  name: string;
  targetSets: number;
  targetReps: number;
  /** Starting working weight. */
  startWeight: number;
  /** Weight to add each time the target reps are hit on all sets. */
  incrementKg: number;
}

/** A personal record for a given exercise. */
export interface PersonalRecord {
  exerciseId: string;
  exerciseName: string;
  /** Heaviest weight lifted for any rep count. */
  maxWeight: number;
  /** Best estimated one-rep max (Epley) across all sets. */
  bestEstimated1RM: number;
  /** Highest single-set volume (weight * reps). */
  maxVolumeSet: number;
  /** ISO date this PR was achieved. */
  achievedAt: string;
}

export type WeightUnit = 'kg' | 'lb';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'glutes'
  | 'core'
  | 'cardio'
  | 'other';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'other';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'core',
  'cardio',
  'other',
];

export const EQUIPMENT_TYPES: Equipment[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'other',
];
