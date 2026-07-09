/**
 * Bit-array helpers for RF frame encoding and decoding.
 *
 * Homey's RF signals exchange frames as arrays of word indexes — for the
 * two-symbol PWM signals in this app that means plain 0/1 bit arrays, so
 * every protocol here encodes to and decodes from MSB-first bit arrays.
 */

/** Convert `value` to a `width`-bit array, MSB-first. */
export function bitsFromNumber(value: number, width: number): number[] {
  const bits = new Array<number>(width);
  for (let i = 0; i < width; i++) {
    bits[i] = (value >>> (width - 1 - i)) & 1;
  }
  return bits;
}

/** Interpret an MSB-first bit array as an unsigned integer (max 32 bits). */
export function numberFromBits(bits: readonly number[]): number {
  return bits.reduce((acc, bit) => ((acc << 1) | bit) >>> 0, 0);
}

/** Split an MSB-first bit array into bytes. Trailing bits beyond the last full byte are ignored. */
export function bytesFromBits(bits: readonly number[]): number[] {
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(numberFromBits(bits.slice(i, i + 8)));
  }
  return bytes;
}

/** Format a payload for logging, e.g. `len=64 [A3 E2 14 C1 01 00 43 FB]`. */
export function formatPayload(payload: readonly number[]): string {
  const fullBytes = Math.floor(payload.length / 8) * 8;
  const hex = bytesFromBits(payload)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
  const trailing = payload.slice(fullBytes).join('');
  const tail = trailing.length > 0 ? (hex.length > 0 ? ` +${trailing}` : trailing) : '';
  return `len=${payload.length} [${hex}${tail}]`;
}
