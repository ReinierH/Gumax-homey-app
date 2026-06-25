// Gumax ASY-3501-1 remote — LED lighting protocol
// Reverse engineered from 10 VCD captures via Homey built-in 433 MHz receiver.
// All captures decoded at 100% confidence with consistent 24-bit frames.
//
// Frame layout (24 bits):
//   Bits  0–19 : Remote ID (device-specific, 20 bits)
//   Bits 20–23 : Command nibble (4 bits)
//
// Bit encoding (PWM, period ~1480 µs):
//   Bit 1 → SHORT HIGH (~370 µs) + LONG  LOW (~1100 µs)  → word index 1
//   Bit 0 → LONG  HIGH (~1110 µs) + SHORT LOW (~370 µs)  → word index 0
//
// Packet structure:
//   [HIGH ~5400µs][LOW ~120µs][HIGH ~370µs][LOW ~9000µs][24 data bits][LOW ~9300µs] → repeat
//
// Known remote ID (from captures): 0x3D 0x67 0x9_ (bits 0–19 = 00111101 01100111 1001)

export const FRAME_BITS     = 24;
export const REMOTE_ID_BITS = 20;
export const CMD_BITS       = 4;

// Command nibbles (bits 20–23)
export const CMD_HIGHER  = 0x0;
export const CMD_ON      = 0x2;
export const CMD_LEVEL_1 = 0x3;  // dimmest
export const CMD_LEVEL_6 = 0x4;
export const CMD_LEVEL_5 = 0x5;
export const CMD_LEVEL_3 = 0x6;
export const CMD_LEVEL_4 = 0x7;
export const CMD_OFF     = 0x8;
export const CMD_LOWER   = 0x9;
export const CMD_LEVEL_2 = 0xD;  // non-sequential nibble

// Ordered dimmest → brightest for dim capability mapping
export const DIM_LEVELS = [
  CMD_LEVEL_1,
  CMD_LEVEL_2,
  CMD_LEVEL_3,
  CMD_LEVEL_4,
  CMD_LEVEL_5,
  CMD_LEVEL_6,
] as const;

export interface GumaxLedFrame {
  remoteId: number;  // 20-bit identifier (bits 0–19)
  command:  number;  // 4-bit command nibble (bits 20–23)
}

function numberToBits(value: number, length: number): number[] {
  const bits: number[] = [];
  for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  return bits;
}

function bitsToNumber(bits: number[]): number {
  return bits.reduce((acc, b) => (acc << 1) | b, 0);
}

export function buildFrame(remoteId: number, command: number): number[] {
  return [
    ...numberToBits(remoteId, REMOTE_ID_BITS),
    ...numberToBits(command,  CMD_BITS),
  ];
}

export function decodeFrame(payload: number[]): GumaxLedFrame | null {
  if (payload.length !== FRAME_BITS) return null;
  return {
    remoteId: bitsToNumber(payload.slice(0, REMOTE_ID_BITS)),
    command:  bitsToNumber(payload.slice(REMOTE_ID_BITS)),
  };
}

/** Map a Homey dim value (0.0–1.0) to a DIM_LEVELS index (0–5). */
export function dimToLevelIndex(dim: number): number {
  return Math.min(5, Math.floor(dim * 6));
}
