// Gumax shutter — 433 MHz protocol
// Reverse engineered from 15 VCD captures (4 channels × open/close/stop + "alles").
// All timings, frame layout and checksum verified against every capture.
//
// Frame layout (64 bits = 8 bytes, MSB-first):
//   B0–B3 : Remote ID    (32-bit, unique per remote)
//   B4–B5 : Channel mask (16-bit LE bitmap — bit N-1 = channel N; 0xFFFF = all)
//   B6    : Command      (8-bit)
//   B7    : Checksum     (B0+B1+B2+B3+B4+B5+B6 + 0x5D) mod 256
//
// Bit encoding (PWM):
//   bit 0 → HIGH 280 µs + LOW 600 µs   (short high, long low)
//   bit 1 → HIGH 600 µs + LOW 280 µs   (long high, short low)
//
// No SOF/preamble. Inter-frame gap ~4980 µs LOW (EOF between repeats).

export const FRAME_BITS = 64;

// Channel masks (B4/B5 as 16-bit LE value)
export const CH_1   = 0x0001;
export const CH_2   = 0x0002;
export const CH_3   = 0x0004;
export const CH_4   = 0x0008;
export const CH_ALL = 0xFFFF;

// Primary command bytes
export const CMD_OPEN  = 0x0B;
export const CMD_CLOSE = 0x43;
export const CMD_STOP  = 0x23;

// Hold/repeat variants sent by the physical remote while button is held.
// Not sent by Homey, but received via sniffer and normalized to the primary.
const CMD_OPEN_HOLD    = 0x8B;  // CMD_OPEN  | 0x80
const CMD_OPEN_SUSTAIN = 0x55;  // sustained hold phase
const CMD_CLOSE_HOLD   = 0xC3;  // CMD_CLOSE | 0x80
const CMD_STOP_HOLD    = 0x5A;

export interface GumaxShutterFrame {
  remoteId:    number;  // 32-bit remote address
  channelMask: number;  // 16-bit channel bitmap
  command:     number;  // 8-bit command (may be a hold variant)
}

function numberToBits(value: number, length: number): number[] {
  const bits: number[] = [];
  for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  return bits;
}

function bitsToNumber(bits: number[]): number {
  return bits.reduce((acc, b) => (acc << 1) | b, 0);
}

function calcChecksum(b0: number, b1: number, b2: number, b3: number,
                      b4: number, b5: number, b6: number): number {
  return (b0 + b1 + b2 + b3 + b4 + b5 + b6 + 0x5D) & 0xFF;
}

export function buildFrame(remoteId: number, channelMask: number, command: number): number[] {
  const b0 = (remoteId >>> 24) & 0xFF;
  const b1 = (remoteId >>> 16) & 0xFF;
  const b2 = (remoteId >>>  8) & 0xFF;
  const b3 =  remoteId         & 0xFF;
  const b4 =  channelMask      & 0xFF;
  const b5 = (channelMask >>> 8) & 0xFF;
  const b6 =  command          & 0xFF;
  const b7 = calcChecksum(b0, b1, b2, b3, b4, b5, b6);

  const bits: number[] = [];
  for (const byte of [b0, b1, b2, b3, b4, b5, b6, b7]) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  return bits;
}

export function decodeFrame(payload: number[]): GumaxShutterFrame | null {
  if (payload.length !== FRAME_BITS) return null;

  const bytes: number[] = [];
  for (let i = 0; i < 8; i++) {
    bytes.push(bitsToNumber(payload.slice(i * 8, (i + 1) * 8)));
  }
  const [b0, b1, b2, b3, b4, b5, b6, b7] = bytes;

  if (b7 !== calcChecksum(b0, b1, b2, b3, b4, b5, b6)) return null;

  return {
    remoteId:    ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0,
    channelMask: b4 | (b5 << 8),
    command:     b6,
  };
}

/** Normalize hold/repeat variants to the corresponding primary command. */
export function normalizePrimary(command: number): number {
  if (command === CMD_OPEN_HOLD || command === CMD_OPEN_SUSTAIN) return CMD_OPEN;
  if (command === CMD_CLOSE_HOLD) return CMD_CLOSE;
  if (command === CMD_STOP_HOLD)  return CMD_STOP;
  return command;
}

/**
 * True when the received channel mask overlaps with the device's paired mask.
 * Handles "all channels" (0xFFFF) transparently.
 */
export function channelMatches(rxMask: number, deviceMask: number): boolean {
  return (rxMask & deviceMask) !== 0;
}
