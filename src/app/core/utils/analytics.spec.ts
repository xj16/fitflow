import {
  exercisesInHistory,
  oneRepMaxSeries,
  volumeSeries,
  weeklyVolume,
} from './analytics';
import { Workout, WorkoutSet } from '../models/workout.model';

function set(weight: number, reps: number, done = true): WorkoutSet {
  return { id: `s-${Math.random()}`, weight, reps, done };
}

function workout(
  date: string,
  entries: Array<{ exerciseId: string; name: string; sets: WorkoutSet[] }>,
): Workout {
  return {
    id: `w-${date}`,
    date,
    title: 'Session',
    unit: 'kg',
    exercises: entries.map((e, i) => ({ id: `e-${date}-${i}`, ...e })),
    createdAt: date,
    updatedAt: date,
  };
}

describe('analytics', () => {
  describe('volumeSeries', () => {
    it('orders points oldest-first and sums working volume per session', () => {
      const workouts = [
        workout('2026-02-01T10:00:00Z', [
          { exerciseId: 'squat', name: 'Squat', sets: [set(100, 5)] },
        ]),
        workout('2026-01-01T10:00:00Z', [
          { exerciseId: 'squat', name: 'Squat', sets: [set(80, 5)] },
        ]),
      ];
      const series = volumeSeries(workouts);
      expect(series.length).toBe(2);
      // Oldest (Jan, 80*5=400) first, then Feb (100*5=500).
      expect(series[0].value).toBe(400);
      expect(series[1].value).toBe(500);
    });

    it('excludes warm-up and incomplete sets from volume', () => {
      const w = workout('2026-01-01T10:00:00Z', [
        {
          exerciseId: 'bench',
          name: 'Bench',
          sets: [
            { id: 'a', weight: 40, reps: 10, warmup: true, done: true },
            { id: 'b', weight: 60, reps: 5, done: false },
            { id: 'c', weight: 60, reps: 5, done: true },
          ],
        },
      ]);
      expect(volumeSeries([w])[0].value).toBe(300); // only the done working set
    });
  });

  describe('oneRepMaxSeries', () => {
    it('builds a progression for one exercise, skipping warm-up-only sessions', () => {
      const workouts = [
        workout('2026-01-01T10:00:00Z', [
          { exerciseId: 'dl', name: 'Deadlift', sets: [set(140, 3)] },
        ]),
        workout('2026-01-08T10:00:00Z', [
          {
            exerciseId: 'dl',
            name: 'Deadlift',
            sets: [{ id: 'wu', weight: 60, reps: 5, warmup: true, done: true }],
          },
        ]),
        workout('2026-01-15T10:00:00Z', [
          { exerciseId: 'dl', name: 'Deadlift', sets: [set(150, 3)] },
        ]),
      ];
      const series = oneRepMaxSeries(workouts, 'dl');
      // The warm-up-only session (best 1RM = 0) is skipped.
      expect(series.length).toBe(2);
      // Epley: 140*(1+3/30)=154, 150*(1+3/30)=165 → monotonically increasing.
      expect(series[0].value).toBeCloseTo(154, 1);
      expect(series[1].value).toBeCloseTo(165, 1);
    });

    it('returns an empty series for an unknown exercise', () => {
      const w = workout('2026-01-01T10:00:00Z', [
        { exerciseId: 'dl', name: 'Deadlift', sets: [set(140, 3)] },
      ]);
      expect(oneRepMaxSeries([w], 'nope')).toEqual([]);
    });
  });

  describe('exercisesInHistory', () => {
    it('counts distinct sessions per exercise and sorts by frequency', () => {
      const workouts = [
        workout('2026-01-01T10:00:00Z', [
          { exerciseId: 'squat', name: 'Squat', sets: [set(100, 5)] },
          { exerciseId: 'bench', name: 'Bench', sets: [set(60, 5)] },
        ]),
        workout('2026-01-03T10:00:00Z', [
          { exerciseId: 'squat', name: 'Squat', sets: [set(102, 5)] },
        ]),
      ];
      const result = exercisesInHistory(workouts);
      expect(result[0]).toEqual(
        jasmine.objectContaining({ exerciseId: 'squat', sessions: 2 }),
      );
      expect(result.find((e) => e.exerciseId === 'bench')?.sessions).toBe(1);
    });

    it('does not double-count an exercise appearing twice in one session', () => {
      const w = workout('2026-01-01T10:00:00Z', [
        { exerciseId: 'squat', name: 'Squat', sets: [set(100, 5)] },
        { exerciseId: 'squat', name: 'Squat', sets: [set(105, 3)] },
      ]);
      expect(exercisesInHistory([w])[0].sessions).toBe(1);
    });
  });

  describe('weeklyVolume', () => {
    it('returns exactly `weeks` buckets, oldest-first', () => {
      const buckets = weeklyVolume([], 8);
      expect(buckets.length).toBe(8);
    });

    it('buckets a recent workout into the current week', () => {
      const today = new Date();
      const w = workout(today.toISOString(), [
        { exerciseId: 'squat', name: 'Squat', sets: [set(100, 5)] },
      ]);
      const buckets = weeklyVolume([w], 8);
      // The last (most recent) bucket should hold this week's 500 kg volume.
      expect(buckets[buckets.length - 1].value).toBe(500);
    });

    it('excludes a workout older than the window', () => {
      const old = new Date();
      old.setDate(old.getDate() - 200);
      const w = workout(old.toISOString(), [
        { exerciseId: 'squat', name: 'Squat', sets: [set(100, 5)] },
      ]);
      const total = weeklyVolume([w], 8).reduce((s, b) => s + b.value, 0);
      expect(total).toBe(0);
    });
  });
});
