import { mergeCollections } from './merge';
import { Syncable } from './sync-types';

interface Rec extends Syncable {
  value: string;
}

function rec(id: string, updatedAt: string, value: string, deleted = false): Rec {
  return { id, updatedAt, value, deleted };
}

describe('mergeCollections (last-write-wins)', () => {
  it('pulls remote-only records', () => {
    const res = mergeCollections<Rec>([], [rec('a', '2026-01-01', 'remote')]);
    expect(res.merged.length).toBe(1);
    expect(res.pulled.length).toBe(1);
    expect(res.pushed.length).toBe(0);
    expect(res.merged[0].value).toBe('remote');
  });

  it('pushes local-only records', () => {
    const res = mergeCollections<Rec>([rec('a', '2026-01-01', 'local')], []);
    expect(res.merged.length).toBe(1);
    expect(res.pushed.length).toBe(1);
    expect(res.pulled.length).toBe(0);
  });

  it('keeps the newer copy when both sides have the record', () => {
    const local = [rec('a', '2026-01-02T00:00:00Z', 'local-newer')];
    const remote = [rec('a', '2026-01-01T00:00:00Z', 'remote-older')];
    const res = mergeCollections(local, remote);
    expect(res.merged[0].value).toBe('local-newer');
    expect(res.pushed.length).toBe(1);
    expect(res.pulled.length).toBe(0);
  });

  it('prefers remote when remote is newer', () => {
    const local = [rec('a', '2026-01-01T00:00:00Z', 'local-older')];
    const remote = [rec('a', '2026-01-02T00:00:00Z', 'remote-newer')];
    const res = mergeCollections(local, remote);
    expect(res.merged[0].value).toBe('remote-newer');
    expect(res.pulled.length).toBe(1);
    expect(res.pushed.length).toBe(0);
  });

  it('treats a delete tombstone like any other update', () => {
    const local = [rec('a', '2026-01-03T00:00:00Z', 'gone', true)];
    const remote = [rec('a', '2026-01-02T00:00:00Z', 'still-here', false)];
    const res = mergeCollections(local, remote);
    expect(res.merged[0].deleted).toBeTrue();
  });

  it('is idempotent — merging twice converges', () => {
    const local = [rec('a', '2026-01-02T00:00:00Z', 'x')];
    const remote = [rec('a', '2026-01-01T00:00:00Z', 'y')];
    const first = mergeCollections(local, remote);
    const second = mergeCollections(first.merged, first.merged);
    expect(second.merged).toEqual(first.merged);
    expect(second.pushed.length).toBe(0);
    expect(second.pulled.length).toBe(0);
  });

  it('does not flag identical records for push', () => {
    const same = rec('a', '2026-01-01T00:00:00Z', 'same');
    const res = mergeCollections([same], [{ ...same }]);
    expect(res.pushed.length).toBe(0);
    expect(res.pulled.length).toBe(0);
    expect(res.merged.length).toBe(1);
  });
});
