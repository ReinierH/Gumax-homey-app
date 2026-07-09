// Gumax shutter — 433 MHz protocol
// Reverse engineered from 21 VCD captures (6 channels × open/close/stop + "all").
// All timings, frame layout and checksum verified bit-for-bit against every capture.
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
// Preamble (per frame): LOW ~4980 µs gap + HIGH ~5000 µs sync + LOW ~615 µs lead-in.
// The sync pulse is required — motors reject frames without it.

import { bitsFromNumber, bytesFromBits } from '../../lib/bits';

export const FRAME_BITS = 64;

/** Channel mask addressing every channel at once ("all" button on the remote). */
export const CHANNEL_ALL = 0xffff;

/** Number of channels addressable by the 16-bit channel mask. */
export const CHANNEL_COUNT = 16;

const CHECKSUM_MAGIC = 0x5d;

export const CMD = {
  OPEN: 0x0b,
  CLOSE: 0x43,
  /** First burst phase of a stop press. The motor ignores this code. */
  STOP_INITIAL: 0x23,
  /** Sustained phase of a stop press. This is what actually stops the motor. */
  STOP_SUSTAINED: 0x5a,
} as const;

/**
 * Burst variants the remote emits while a button is held, mapped to the
 * command that represents the action. Received via the sniffer only —
 * Homey never transmits these (except STOP_INITIAL, for burst fidelity).
 */
const HOLD_VARIANTS: Readonly<Record<number, number>> = {
  0x8b: CMD.OPEN, // OPEN | 0x80 repeat flag
  0x55: CMD.OPEN, // sustained hold phase
  0xc3: CMD.CLOSE, // CLOSE | 0x80 repeat flag
  [CMD.STOP_INITIAL]: CMD.STOP_SUSTAINED,
};

export interface GumaxShutterFrame {
  /** 32-bit remote address. */
  readonly remoteId: number;
  /** 16-bit channel bitmap. */
  readonly channelMask: number;
  /** 8-bit command byte; may be a hold variant. */
  readonly command: number;
}

function payloadBytes(remoteId: number, channelMask: number, command: number): number[] {
  return [
    (remoteId >>> 24) & 0xff,
    (remoteId >>> 16) & 0xff,
    (remoteId >>> 8) & 0xff,
    remoteId & 0xff,
    channelMask & 0xff, // B4 = low byte (little-endian mask)
    (channelMask >>> 8) & 0xff,
    command & 0xff,
  ];
}

function checksum(bytes: readonly number[]): number {
  return (bytes.reduce((sum, byte) => sum + byte, 0) + CHECKSUM_MAGIC) & 0xff;
}

export function buildFrame(remoteId: number, channelMask: number, command: number): number[] {
  const bytes = payloadBytes(remoteId, channelMask, command);
  bytes.push(checksum(bytes));
  return bytes.flatMap((byte) => bitsFromNumber(byte, 8));
}

export function decodeFrame(payload: number[]): GumaxShutterFrame | null {
  if (payload.length !== FRAME_BITS) return null;

  const bytes = bytesFromBits(payload);
  const data = bytes.slice(0, 7);
  if (bytes[7] !== checksum(data)) return null;

  const [b0, b1, b2, b3, maskLow, maskHigh, command] = data;
  return {
    remoteId: ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0,
    channelMask: maskLow | (maskHigh << 8),
    command,
  };
}

/** Normalize hold/repeat burst variants to the command representing the action. */
export function normalizeCommand(command: number): number {
  return HOLD_VARIANTS[command] ?? command;
}

/** True when two channel masks overlap. Handles "all channels" (0xFFFF) transparently. */
export function channelsOverlap(maskA: number, maskB: number): boolean {
  return (maskA & maskB) !== 0;
}
