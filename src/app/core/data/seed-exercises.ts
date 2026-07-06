import { Equipment, Exercise, MuscleGroup } from '../models/workout.model';
import { nowIso, uuid } from '../utils/id';

/**
 * A starter library of common compound and accessory lifts, seeded on first
 * run so the user can log a workout immediately without any setup. Ids are
 * generated at seed time; names are stable so PRs track across sessions.
 */
const RAW: Array<[string, MuscleGroup, Equipment]> = [
  ['Back Squat', 'legs', 'barbell'],
  ['Front Squat', 'legs', 'barbell'],
  ['Deadlift', 'back', 'barbell'],
  ['Romanian Deadlift', 'legs', 'barbell'],
  ['Bench Press', 'chest', 'barbell'],
  ['Incline Bench Press', 'chest', 'barbell'],
  ['Overhead Press', 'shoulders', 'barbell'],
  ['Barbell Row', 'back', 'barbell'],
  ['Pull-Up', 'back', 'bodyweight'],
  ['Chin-Up', 'biceps', 'bodyweight'],
  ['Dip', 'triceps', 'bodyweight'],
  ['Push-Up', 'chest', 'bodyweight'],
  ['Dumbbell Bench Press', 'chest', 'dumbbell'],
  ['Dumbbell Shoulder Press', 'shoulders', 'dumbbell'],
  ['Dumbbell Row', 'back', 'dumbbell'],
  ['Lateral Raise', 'shoulders', 'dumbbell'],
  ['Bicep Curl', 'biceps', 'dumbbell'],
  ['Hammer Curl', 'biceps', 'dumbbell'],
  ['Tricep Pushdown', 'triceps', 'cable'],
  ['Lat Pulldown', 'back', 'cable'],
  ['Cable Row', 'back', 'cable'],
  ['Leg Press', 'legs', 'machine'],
  ['Leg Curl', 'legs', 'machine'],
  ['Leg Extension', 'legs', 'machine'],
  ['Hip Thrust', 'glutes', 'barbell'],
  ['Calf Raise', 'legs', 'machine'],
  ['Plank', 'core', 'bodyweight'],
  ['Hanging Leg Raise', 'core', 'bodyweight'],
  ['Kettlebell Swing', 'glutes', 'kettlebell'],
  ['Running', 'cardio', 'bodyweight'],
];

export function buildSeedExercises(): Exercise[] {
  const ts = nowIso();
  return RAW.map(([name, muscleGroup, equipment]) => ({
    id: uuid(),
    name,
    muscleGroup,
    equipment,
    createdAt: ts,
    updatedAt: ts,
  }));
}
