import { obfuscate, deobfuscate } from './secret';

describe('secret (credential obfuscation)', () => {
  it('round-trips an arbitrary string', () => {
    const original = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super.secret';
    const stored = obfuscate(original)!;
    expect(stored).not.toBe(original); // not clear text on disk
    expect(deobfuscate(stored)).toBe(original);
  });

  it('marks obfuscated values with a version prefix', () => {
    expect(obfuscate('hello')!.startsWith('ff1:')).toBeTrue();
  });

  it('passes empty/undefined values through unchanged', () => {
    expect(obfuscate('')).toBe('');
    expect(obfuscate(undefined)).toBeUndefined();
    expect(deobfuscate(undefined)).toBeUndefined();
  });

  it('leaves legacy clear-text (unmarked) values untouched on decode', () => {
    // A value saved by an older build has no marker → returned as-is.
    expect(deobfuscate('plain-legacy-key')).toBe('plain-legacy-key');
  });

  it('handles unicode content', () => {
    const s = 'clé-secrète-🏋️';
    expect(deobfuscate(obfuscate(s)!)).toBe(s);
  });
});
