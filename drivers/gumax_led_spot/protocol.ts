// Gumax ASY-3501-1 remote — LED lighting protocol
// Reverse engineered from 10 VCD captures via Homey's built-in 433 MHz receiver.
// All captures decoded at 100% confidence with consistent 24-bit frames.
//
// Frame layout (24 bits, MSB-first):
//   Bits  0–19 : Remote ID (device-specific, 20 bits)
//   Bits 20–23 : Command nibble (4 bits)
//
// Bit encoding (PWM, period ~1480 µs):
//   Bit 0 → LONG  HIGH (~1110 µs) + SHORT LOW (~370 µs)   → word index 0
//   Bit 1 → SHORT HIGH (~370 µs)  + LONG  LOW (~1100 µs)  → word index 1
//
// Packet structure:
//   [HIGH ~5400µs][LOW ~120µs][HIGH ~370µs][LOW ~9000µs][24 data bits][LOW ~9300µs] → repeat

import { bitsFromNumber, numberFromBits } from '../../lib/bits';

export const FRAME_BITS = 24;

const REMOTE_ID_BITS = 20;
const COMMAND_BITS = 4;

/** Command nibbles (bits 20–23). Level nibbles are not sequential on the wire. */
export const CMD = {
  HIGHER: 0x0,
  ON: 0x2,
  LEVEL_1: 0x3,
  LEVEL_6: 0x4,
  LEVEL_5: 0x5,
  LEVEL_3: 0x6,
  LEVEL_4: 0x7,
  OFF: 0x8,
  LOWER: 0x9,
  LEVEL_2: 0xd,
} as const;

/** Level commands ordered dimmest → brightest. */
const DIM_LEVELS: readonly number[] = [
  CMD.LEVEL_1,
  CMD.LEVEL_2,
  CMD.LEVEL_3,
  CMD.LEVEL_4,
  CMD.LEVEL_5,
  CMD.LEVEL_6,
];

/** Size of one brightness step as a Homey dim value. */
export const DIM_STEP = 1 / DIM_LEVELS.length;

export interface GumaxLedFrame {
  /** 20-bit remote identifier (bits 0–19). */
  readonly remoteId: number;
  /** 4-bit command nibble (bits 20–23). */
  readonly command: number;
}

export function buildFrame(remoteId: number, command: number): number[] {
  return [
    ...bitsFromNumber(remoteId, REMOTE_ID_BITS),
    ...bitsFromNumber(command, COMMAND_BITS),
  ];
}

export function decodeFrame(payload: number[]): GumaxLedFrame | null {
  if (payload.length !== FRAME_BITS) return null;
  return {
    remoteId: numberFromBits(payload.slice(0, REMOTE_ID_BITS)),
    command: numberFromBits(payload.slice(REMOTE_ID_BITS)),
  };
}

/**
 * Map a Homey dim value (0–1, exclusive of 0) to the nearest level command.
 *
 * Uses ceil so the mapping round-trips with {@link commandToDim}: a dim
 * value of exactly k/6 maps to level k, not k+1.
 */
export function dimToCommand(dim: number): number {
  const level = Math.min(DIM_LEVELS.length, Math.max(1, Math.ceil(dim * DIM_LEVELS.length)));
  return DIM_LEVELS[level - 1];
}

/** Map a received level command to its Homey dim value, or `null` for non-level commands. */
export function commandToDim(command: number): number | null {
  const index = DIM_LEVELS.indexOf(command);
  return index === -1 ? null : (index + 1) / DIM_LEVELS.length;
}
