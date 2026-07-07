/**
 * Lightweight at-rest obfuscation for locally-stored sync credentials.
 *
 * This is deliberately NOT cryptography — the Supabase anon key is a public
 * key and the device is the trust boundary, so there is no secret to protect
 * against a determined local attacker. The goal is only to keep credentials
 * from sitting as clear-text you could copy out of a casual IndexedDB dump or
 * an exported profile. We XOR against a fixed app key and base64-wrap the
 * result behind a version tag so we can round-trip and evolve it later.
 */

const PREFIX = 'ff1:'; // versioned marker so we know a value is obfuscated
const APP_KEY = 'fitflow-local-obfuscation-v1';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function xor(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ APP_KEY.charCodeAt(i % APP_KEY.length);
  }
  return out;
}

/** Obfuscate a plaintext secret for on-device storage. Empty in → empty out. */
export function obfuscate(plain: string | undefined): string | undefined {
  if (!plain) {
    return plain;
  }
  const bytes = new TextEncoder().encode(plain);
  return PREFIX + toBase64(xor(bytes));
}

/** Reverse `obfuscate`. Values without the marker are returned unchanged, so
 *  configs saved by older builds (clear-text) still load correctly. */
export function deobfuscate(stored: string | undefined): string | undefined {
  if (!stored || !stored.startsWith(PREFIX)) {
    return stored;
  }
  try {
    const bytes = xor(fromBase64(stored.slice(PREFIX.length)));
    return new TextDecoder().decode(bytes);
  } catch {
    return stored;
  }
}
