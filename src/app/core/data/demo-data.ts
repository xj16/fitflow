import {
  Exercise,
  ExerciseEntry,
  Routine,
  Workout,
  WorkoutSet,
} from '../models/workout.model';
import { uuid } from '../utils/id';

/**
 * Deterministic demo-data generator.
 *
 * Produces ~12 weeks of realistic 3-day/week progressive-overload history so
 * the Stats tab, PR cards, weekly-volume bars and per-exercise 1RM lines all
 * render fully populated on first load. This powers the one-tap "Load demo
 * data" button and the `?demo=1` deep link that seed the live portfolio demo.
 *
 * It is intentionally NOT random: a small seeded PRNG means the same history is
 * generated every time, so screenshots and the demo are reproducible, and so
 * the analytics tests can assert exact numbers.
 */

/** Tiny deterministic PRNG (mulberry32) so demo history is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 3-day upper/lower/full split with linear progression. */
interface Lift {
  name: string;
  start: number;
  inc: number;
  reps: number;
  sets: number;
}

const DAYS: Array<{ title: string; lifts: Lift[] }> = [
  {
    title: 'Push Day',
    lifts: [
      { name: 'Bench Press', start: 60, inc: 2.5, reps: 5, sets: 3 },
      { name: 'Overhead Press', start: 35, inc: 1.25, reps: 5, sets: 3 },
      { name: 'Incline Bench Press', start: 45, inc: 2.5, reps: 8, sets: 3 },
      { name: 'Tricep Pushdown', start: 25, inc: 1.25, reps: 12, sets: 3 },
    ],
  },
  {
    title: 'Pull Day',
    lifts: [
      { name: 'Deadlift', start: 100, inc: 5, reps: 5, sets: 1 },
      { name: 'Barbell Row', start: 55, inc: 2.5, reps: 8, sets: 3 },
      { name: 'Lat Pulldown', start: 45, inc: 2.5, reps: 10, sets: 3 },
      { name: 'Bicep Curl', start: 12, inc: 1, reps: 12, sets: 3 },
    ],
  },
  {
    title: 'Leg Day',
    lifts: [
      { name: 'Back Squat', start: 80, inc: 2.5, reps: 5, sets: 3 },
      { name: 'Romanian Deadlift', start: 60, inc: 2.5, reps: 8, sets: 3 },
      { name: 'Leg Press', start: 120, inc: 5, reps: 10, sets: 3 },
      { name: 'Calf Raise', start: 60, inc: 2.5, reps: 15, sets: 3 },
    ],
  },
];

/**
 * Build a full demo history. Requires the seeded exercise library so entries
 * reference real exercise ids (which drives PRs and the 1RM chart selector).
 * Returns workouts + one saved routine; deleted/tombstoned records are never
 * produced so the demo is clean.
 */
export function buildDemoHistory(
  exercises: Exercise[],
  weeks = 12,
  now: Date = new Date(),
): { workouts: Workout[]; routines: Routine[] } {
  const rand = mulberry32(0x1f2e3d4c);
  const byName = new Map(exercises.map((e) => [e.name, e]));
  const workouts: Workout[] = [];

  // Session cadence: Mon / Wed / Fri, oldest first.
  const sessionOffsets = [0, 2, 4]; // days after week start (Monday)

  for (let w = weeks - 1; w >= 0; w--) {
    DAYS.forEach((day, dayIdx) => {
      const date = new Date(now);
      // Go back `w` weeks, then to that week's Monday, then to the session day.
      date.setHours(18, 15, 0, 0);
      date.setDate(date.getDate() - w * 7);
      // Snap to Monday of that week (getDay: 0=Sun..6=Sat).
      const dow = date.getDay();
      const toMonday = (dow + 6) % 7;
      date.setDate(date.getDate() - toMonday + sessionOffsets[dayIdx]);
      // Skip any session that would land in the future.
      if (date.getTime() > now.getTime()) {
        return;
      }

      const weekIndex = weeks - 1 - w; // 0 = oldest
      const entries: ExerciseEntry[] = day.lifts.map((lift) => {
        const ex = byName.get(lift.name);
        const exerciseId = ex?.id ?? uuid();
        // Linear progression with an occasional stall (deload/plateau).
        const progressed = Math.max(0, weekIndex - (rand() < 0.15 ? 1 : 0));
        const workWeight = roundPlate(lift.start + progressed * lift.inc);

        const sets: WorkoutSet[] = [];
        // A warm-up set for compound barbell lifts.
        if (lift.start >= 40) {
          sets.push({
            id: uuid(),
            weight: roundPlate(workWeight * 0.5),
            reps: 8,
            warmup: true,
            done: true,
          });
        }
        for (let s = 0; s < lift.sets; s++) {
          // Occasionally miss the last rep on the top set for realism.
          const missed = s === lift.sets - 1 && rand() < 0.2 ? 1 : 0;
          sets.push({
            id: uuid(),
            weight: workWeight,
            reps: Math.max(1, lift.reps - missed),
            rpe: 7 + Math.round(rand() * 2),
            done: true,
          });
        }
        return {
          id: uuid(),
          exerciseId,
          name: lift.name,
          sets,
        };
      });

      const iso = date.toISOString();
      workouts.push({
        id: uuid(),
        date: iso,
        title: day.title,
        unit: 'kg',
        exercises: entries,
        durationSec: 3300 + Math.round(rand() * 1500),
        createdAt: iso,
        updatedAt: iso,
      });
    });
  }

  return { workouts, routines: [buildDemoRoutine(byName)] };
}

/** A saved 3-day routine matching the demo split, for the Routines tab. */
function buildDemoRoutine(byName: Map<string, Exercise>): Routine {
  const iso = new Date().toISOString();
  return {
    id: uuid(),
    name: 'PPL — Linear Progression',
    description: 'Push / Pull / Legs, 3× per week with automatic linear jumps.',
    days: DAYS.map((day) => ({
      id: uuid(),
      name: day.title,
      slots: day.lifts.map((lift) => ({
        id: uuid(),
        exerciseId: byName.get(lift.name)?.id ?? uuid(),
        name: lift.name,
        targetSets: lift.sets,
        targetReps: lift.reps,
        startWeight: lift.start,
        incrementKg: lift.inc,
      })),
    })),
    createdAt: iso,
    updatedAt: iso,
  };
}

/** Round to the nearest 2.5 kg loadable increment. */
function roundPlate(w: number): number {
  return Math.round(w / 2.5) * 2.5;
}
