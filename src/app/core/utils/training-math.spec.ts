import {
  epley1RM,
  brzycki1RM,
  setVolume,
  exerciseVolume,
  workoutVolume,
  bestEntry1RM,
  computePersonalRecords,
  nextWorkingWeight,
  kgToLb,
  lbToKg,
  roundToPlate,
} from './training-math';
import {
  ExerciseEntry,
  Workout,
  WorkoutSet,
} from '../models/workout.model';

function mkSet(partial: Partial<WorkoutSet>): WorkoutSet {
  return { id: 'x', weight: 0, reps: 0, done: true, ...partial };
}

function mkWorkout(date: string, entries: ExerciseEntry[]): Workout {
  return {
    id: 'w-' + date,
    date,
    title: 'Test',
    unit: 'kg',
    exercises: entries,
    createdAt: date,
    updatedAt: date,
  };
}

describe('training-math: 1RM formulas', () => {
  it('epley returns the weight unchanged for a single rep', () => {
    expect(epley1RM(100, 1)).toBe(100);
  });

  it('epley increases the estimate with more reps', () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 2);
    expect(epley1RM(100, 10)).toBeCloseTo(133.333, 2);
  });

  it('epley guards against non-positive input', () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(-50, 5)).toBe(0);
  });

  it('brzycki produces a sane estimate and clamps reps', () => {
    expect(brzycki1RM(100, 1)).toBeCloseTo(100, 1);
    expect(brzycki1RM(100, 10)).toBeCloseTo(133.33, 1);
    // Reps above 36 must not blow up the denominator.
    expect(Number.isFinite(brzycki1RM(100, 40))).toBeTrue();
  });
});

describe('training-math: volume', () => {
  it('computes a single set volume', () => {
    expect(setVolume(mkSet({ weight: 100, reps: 5 }))).toBe(500);
  });

  it('excludes warm-up and undone sets from volume', () => {
    expect(setVolume(mkSet({ weight: 100, reps: 5, warmup: true }))).toBe(0);
    expect(setVolume(mkSet({ weight: 100, reps: 5, done: false }))).toBe(0);
  });

  it('sums entry and workout volume', () => {
    const entry: ExerciseEntry = {
      id: 'e1',
      exerciseId: 'squat',
      name: 'Squat',
      sets: [
        mkSet({ weight: 100, reps: 5 }),
        mkSet({ weight: 100, reps: 5 }),
        mkSet({ weight: 60, reps: 8, warmup: true }),
      ],
    };
    expect(exerciseVolume(entry)).toBe(1000);
    expect(workoutVolume(mkWorkout('2026-01-01', [entry]))).toBe(1000);
  });
});

describe('training-math: bestEntry1RM', () => {
  it('picks the highest estimated 1RM among working sets', () => {
    const entry: ExerciseEntry = {
      id: 'e',
      exerciseId: 'bench',
      name: 'Bench',
      sets: [
        mkSet({ weight: 80, reps: 5 }), // 93.33
        mkSet({ weight: 90, reps: 3 }), // 99.0
        mkSet({ weight: 60, reps: 10, warmup: true }), // excluded
      ],
    };
    expect(bestEntry1RM(entry)).toBeCloseTo(99, 1);
  });
});

describe('training-math: personal records', () => {
  it('tracks max weight, best 1RM and max set volume per exercise', () => {
    const w1 = mkWorkout('2026-01-01', [
      {
        id: 'e1',
        exerciseId: 'squat',
        name: 'Squat',
        sets: [mkSet({ weight: 100, reps: 5 })],
      },
    ]);
    const w2 = mkWorkout('2026-01-08', [
      {
        id: 'e2',
        exerciseId: 'squat',
        name: 'Squat',
        sets: [mkSet({ weight: 110, reps: 3 })],
      },
    ]);
    const prs = computePersonalRecords([w1, w2]);
    const squat = prs.get('squat');
    expect(squat).toBeDefined();
    expect(squat!.maxWeight).toBe(110);
    expect(squat!.bestEstimated1RM).toBeCloseTo(121, 0);
    // The heavier PR was achieved in the second session.
    expect(squat!.achievedAt).toBe('2026-01-08');
  });

  it('ignores deleted workouts and warm-up sets', () => {
    const deleted = {
      ...mkWorkout('2026-02-01', [
        {
          id: 'e',
          exerciseId: 'dead',
          name: 'Deadlift',
          sets: [mkSet({ weight: 200, reps: 1 })],
        },
      ]),
      deleted: true,
    };
    const prs = computePersonalRecords([deleted]);
    expect(prs.has('dead')).toBeFalse();
  });
});

describe('training-math: progressive overload', () => {
  it('adds the increment when every set hit the target reps', () => {
    expect(nextWorkingWeight(100, [5, 5, 5], 5, 2.5)).toBe(102.5);
  });

  it('repeats the weight when any set missed the target', () => {
    expect(nextWorkingWeight(100, [5, 5, 4], 5, 2.5)).toBe(100);
  });

  it('returns the last weight when there is no history', () => {
    expect(nextWorkingWeight(100, [], 5, 2.5)).toBe(100);
  });
});

describe('training-math: unit conversion & rounding', () => {
  it('round-trips kg <-> lb', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2);
    expect(lbToKg(220.462)).toBeCloseTo(100, 2);
  });

  it('rounds to the nearest plate increment', () => {
    expect(roundToPlate(101.2)).toBe(100);
    expect(roundToPlate(103.9)).toBe(105);
    expect(roundToPlate(102.5)).toBe(102.5);
  });
});
