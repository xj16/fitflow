import { MergeResult, Syncable } from './sync-types';

/**
 * Last-write-wins three-way merge of a single collection.
 *
 * Because FitFlow is offline-first, the same record can be edited on multiple
 * devices before either syncs. We reconcile purely on `updatedAt`: whichever
 * copy was written most recently wins, and soft-delete tombstones participate
 * like any other update (a delete at time T beats an edit before T).
 *
 * This is deterministic and commutative, so running it repeatedly converges —
 * a key property for a sync loop that may retry.
 */
export function mergeCollections<T extends Syncable>(
  local: T[],
  remote: T[],
): MergeResult<T> {
  const byId = new Map<string, { local?: T; remote?: T }>();

  for (const item of local) {
    byId.set(item.id, { ...(byId.get(item.id) ?? {}), local: item });
  }
  for (const item of remote) {
    byId.set(item.id, { ...(byId.get(item.id) ?? {}), remote: item });
  }

  const merged: T[] = [];
  const pulled: T[] = [];
  const pushed: T[] = [];

  for (const { local: l, remote: r } of byId.values()) {
    if (l && !r) {
      // Local-only record → push it upstream.
      merged.push(l);
      pushed.push(l);
    } else if (!l && r) {
      // Remote-only record → pull it down.
      merged.push(r);
      pulled.push(r);
    } else if (l && r) {
      const localNewer = l.updatedAt >= r.updatedAt;
      if (localNewer) {
        merged.push(l);
        // Only mark as needing push if they actually differ.
        if (l.updatedAt !== r.updatedAt) {
          pushed.push(l);
        }
      } else {
        merged.push(r);
        pulled.push(r);
      }
    }
  }

  return { merged, pulled, pushed };
}
