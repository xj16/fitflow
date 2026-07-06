import { Workout } from '../models/workout.model';
import { ChartPoint } from '../../components/mini-chart/mini-chart.component';
import { bestEntry1RM, workoutVolume } from './training-math';

/** Short date label like "Jul 6" for chart axes. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Build a per-session total-volume series across the given workouts, oldest
 * first (so the chart reads left-to-right in time). Deleted workouts are
 * assumed already filtered out by the caller.
 */
export function volumeSeries(workouts: Workout[]): ChartPoint[] {
  return [...workouts]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({ label: shortDate(w.date), value: workoutVolume(w) }));
}

/**
 * Build an estimated-1RM progression series for a single exercise across all
 * sessions that included it. Sessions where the exercise was only warmed up
 * (best 1RM of 0) are skipped so the trend line reflects real working sets.
 */
export function oneRepMaxSeries(
  workouts: Workout[],
  exerciseId: string,
): ChartPoint[] {
  const series: ChartPoint[] = [];
  for (const w of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const entry of w.exercises) {
      if (entry.exerciseId !== exerciseId) {
        continue;
      }
      const best = bestEntry1RM(entry);
      if (best > 0) {
        series.push({ label: shortDate(w.date), value: best });
      }
    }
  }
  return series;
}

/** Distinct exercises that appear in the history, with their session counts. */
export function exercisesInHistory(
  workouts: Workout[],
): Array<{ exerciseId: string; name: string; sessions: number }> {
  const map = new Map<string, { name: string; sessions: number }>();
  for (const w of workouts) {
    const seen = new Set<string>();
    for (const entry of w.exercises) {
      if (seen.has(entry.exerciseId)) {
        continue;
      }
      seen.add(entry.exerciseId);
      const cur = map.get(entry.exerciseId);
      if (cur) {
        cur.sessions += 1;
      } else {
        map.set(entry.exerciseId, { name: entry.name, sessions: 1 });
      }
    }
  }
  return [...map.entries()]
    .map(([exerciseId, v]) => ({ exerciseId, ...v }))
    .sort((a, b) => b.sessions - a.sessions);
}

/** Weekly training volume for the last N ISO weeks, oldest first. */
export function weeklyVolume(workouts: Workout[], weeks = 8): ChartPoint[] {
  const now = new Date();
  const buckets: ChartPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(now.getDate() - i * 7 - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const vol = workouts
      .filter((w) => {
        const d = new Date(w.date);
        return d >= start && d < end;
      })
      .reduce((s, w) => s + workoutVolume(w), 0);
    buckets.push({ label: shortDate(start.toISOString()), value: vol });
  }
  return buckets;
}
