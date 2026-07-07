import { buildDemoHistory } from './demo-data';
import { buildSeedExercises } from './seed-exercises';
import { computePersonalRecords, bestEntry1RM } from '../utils/training-math';

describe('buildDemoHistory', () => {
  const exercises = buildSeedExercises();
  // Anchor "now" so future-date guards behave deterministically in the test.
  const now = new Date('2026-06-01T12:00:00Z');

  it('generates a populated multi-week history', () => {
    const { workouts, routines } = buildDemoHistory(exercises, 12, now);
    expect(workouts.length).toBeGreaterThan(20); // ~3/week over 12 weeks
    expect(routines.length).toBe(1);
    // Every workout has real exercises and no tombstones.
    for (const w of workouts) {
      expect(w.deleted).toBeFalsy();
      expect(w.exercises.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic — same inputs produce identical history', () => {
    const a = buildDemoHistory(exercises, 8, now);
    const b = buildDemoHistory(exercises, 8, now);
    const volA = a.workouts.map((w) => w.title + w.date).join('|');
    const volB = b.workouts.map((w) => w.title + w.date).join('|');
    expect(volA).toBe(volB);
  });

  it('never places a session in the future', () => {
    const { workouts } = buildDemoHistory(exercises, 12, now);
    for (const w of workouts) {
      expect(new Date(w.date).getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it('references seeded exercise ids so PRs compute', () => {
    const { workouts } = buildDemoHistory(exercises, 12, now);
    const prs = computePersonalRecords(workouts);
    expect(prs.size).toBeGreaterThan(0);
    const squat = exercises.find((e) => e.name === 'Back Squat')!;
    expect(prs.get(squat.id)).toBeDefined();
  });

  it('shows progressive overload — later 1RM beats earlier 1RM', () => {
    const { workouts } = buildDemoHistory(exercises, 12, now);
    const squat = exercises.find((e) => e.name === 'Back Squat')!;
    const squatSessions = workouts
      .filter((w) => w.exercises.some((e) => e.exerciseId === squat.id))
      .sort((a, b) => a.date.localeCompare(b.date));
    const first = squatSessions[0].exercises.find(
      (e) => e.exerciseId === squat.id,
    )!;
    const last = squatSessions[squatSessions.length - 1].exercises.find(
      (e) => e.exerciseId === squat.id,
    )!;
    expect(bestEntry1RM(last)).toBeGreaterThan(bestEntry1RM(first));
  });
});
