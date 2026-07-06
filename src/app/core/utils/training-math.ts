import {
  ExerciseEntry,
  PersonalRecord,
  Workout,
  WorkoutSet,
} from '../models/workout.model';

/**
 * Pure, dependency-free training-math helpers.
 *
 * These are deliberately side-effect free so they can be unit-tested in
 * isolation and reused by both the live workout screen and the analytics
 * charts. All weight inputs are assumed to already be in a single unit.
 */

/**
 * Estimate a one-rep max from a working set using the Epley formula:
 *
 *   1RM = weight * (1 + reps / 30)
 *
 * A single rep returns the weight unchanged. Guards against non-positive
 * input so bad data never produces NaN/Infinity downstream.
 */
export function epley1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) {
    return 0;
  }
  if (reps === 1) {
    return weight;
  }
  return weight * (1 + reps / 30);
}

/**
 * Estimate 1RM using the Brzycki formula, offered as an alternative because
 * it tends to be more accurate in the low-rep (<=10) range:
 *
 *   1RM = weight * 36 / (37 - reps)
 *
 * Reps are clamped to 36 to avoid a division-by-zero / negative denominator.
 */
export function brzycki1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) {
    return 0;
  }
  const clampedReps = Math.min(reps, 36);
  return (weight * 36) / (37 - clampedReps);
}

/** Volume of a single set: weight * reps. Warm-up sets count as zero. */
export function setVolume(set: WorkoutSet): number {
  if (set.warmup || !set.done) {
    return 0;
  }
  return Math.max(0, set.weight) * Math.max(0, set.reps);
}

/** Total working volume across an exercise entry. */
export function exerciseVolume(entry: ExerciseEntry): number {
  return entry.sets.reduce((sum, s) => sum + setVolume(s), 0);
}

/** Total working volume across an entire workout. */
export function workoutVolume(workout: Workout): number {
  return workout.exercises.reduce((sum, e) => sum + exerciseVolume(e), 0);
}

/** Total completed working reps in a workout (excludes warm-ups). */
export function workoutReps(workout: Workout): number {
  return workout.exercises.reduce(
    (sum, e) =>
      sum +
      e.sets.reduce(
        (s, set) => s + (set.done && !set.warmup ? Math.max(0, set.reps) : 0),
        0,
      ),
    0,
  );
}

/** The best estimated 1RM among all completed working sets of an entry. */
export function bestEntry1RM(entry: ExerciseEntry): number {
  return entry.sets.reduce((best, s) => {
    if (s.warmup || !s.done) {
      return best;
    }
    return Math.max(best, epley1RM(s.weight, s.reps));
  }, 0);
}

/**
 * Compute personal records per exercise across a history of workouts.
 *
 * Returns a map keyed by exerciseId. Later-dated workouts win ties on
 * `achievedAt` so the most recent PR is surfaced. Deleted workouts and
 * warm-up sets are ignored.
 */
export function computePersonalRecords(
  workouts: Workout[],
): Map<string, PersonalRecord> {
  const prs = new Map<string, PersonalRecord>();

  for (const workout of workouts) {
    if (workout.deleted) {
      continue;
    }
    for (const entry of workout.exercises) {
      for (const set of entry.sets) {
        if (set.warmup || !set.done || set.weight <= 0 || set.reps <= 0) {
          continue;
        }
        const est1RM = epley1RM(set.weight, set.reps);
        const vol = set.weight * set.reps;
        const existing = prs.get(entry.exerciseId);

        if (!existing) {
          prs.set(entry.exerciseId, {
            exerciseId: entry.exerciseId,
            exerciseName: entry.name,
            maxWeight: set.weight,
            bestEstimated1RM: est1RM,
            maxVolumeSet: vol,
            achievedAt: workout.date,
          });
          continue;
        }

        const improved =
          set.weight > existing.maxWeight ||
          est1RM > existing.bestEstimated1RM ||
          vol > existing.maxVolumeSet;

        prs.set(entry.exerciseId, {
          exerciseId: entry.exerciseId,
          exerciseName: entry.name,
          maxWeight: Math.max(existing.maxWeight, set.weight),
          bestEstimated1RM: Math.max(existing.bestEstimated1RM, est1RM),
          maxVolumeSet: Math.max(existing.maxVolumeSet, vol),
          achievedAt: improved ? workout.date : existing.achievedAt,
        });
      }
    }
  }

  return prs;
}

/**
 * Decide the next working weight for a progressive-overload slot.
 *
 * If every working set in the last session hit (or beat) the target reps,
 * add the configured increment; otherwise repeat the same weight. This is the
 * classic linear-progression rule used by beginner strength programs.
 */
export function nextWorkingWeight(
  lastWeight: number,
  lastSetsReps: number[],
  targetReps: number,
  incrementKg: number,
): number {
  if (lastSetsReps.length === 0) {
    return lastWeight;
  }
  const allHit = lastSetsReps.every((r) => r >= targetReps);
  return allHit ? lastWeight + incrementKg : lastWeight;
}

/** Convert kilograms to pounds (1 kg = 2.2046226218 lb). */
export function kgToLb(kg: number): number {
  return kg * 2.2046226218;
}

/** Convert pounds to kilograms. */
export function lbToKg(lb: number): number {
  return lb / 2.2046226218;
}

/** Round a weight to the nearest loadable plate increment (default 2.5). */
export function roundToPlate(weight: number, increment = 2.5): number {
  if (increment <= 0) {
    return weight;
  }
  return Math.round(weight / increment) * increment;
}
