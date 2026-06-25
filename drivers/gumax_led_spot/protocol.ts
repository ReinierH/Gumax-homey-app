// Gumax ASY-3501-1 remote — LED lighting protocol
// Reverse engineered from VCD captures (Gumax_aan.vcd / Gumax_uit.vcd)
//
// Frame layout (24 bits):
//   Bits  0–19 : Remote ID (device-specific, 20 bits)
//   Bits 20–23 : Command nibble (4 bits)
//
// Bit encoding (PWM, period ~1480 µs):
//   Bit 0 → LONG  HIGH (~1110 µs) + SHORT LOW (~370 µs)   → word index 0
//   Bit 1 → SHORT HIGH (~370 µs)  + LONG  LOW (~1100 µs)  → word index 1
//
// SOF:  HIGH 5400 µs → LOW 120 µs → HIGH 370 µs → LOW 9000 µs
// EOF / inter-packet gap: LOW ~9300 µs
// Repetitions: 10
//
// Known commands (from VCD captures):
//   ON  (AAN) nibble = 0x2  (0010)   full frame: 0x3D 0x67 0x92
//   OFF (UIT) nibble = 0x8  (1000)   full frame: 0x3D 0x67 0x98
//
// The remote ID 0x3D67_9 belongs to one specific remote.
// Other remotes will have different IDs — use the learn flow.

export const FRAME_BITS     = 24;
export const REMOTE_ID_BITS = 20;
export const CMD_BITS       = 4;

export const CMD_ON  = 0x2;  // AAN (on)
export const CMD_OFF = 0x8;  // UIT (off)

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

/**
 * Build a 24-element word-index array for transmission.
 * word 0 = bit-0 timing, word 1 = bit-1 timing (as defined in gumax.json).
 */
export function buildFrame(remoteId: number, command: number): number[] {
  return [
    ...numberToBits(remoteId, REMOTE_ID_BITS),
    ...numberToBits(command,  CMD_BITS),
  ];
}

/**
 * Decode a received 24-element payload into a GumaxLedFrame.
 * Returns null if the length doesn't match.
 */
export function decodeFrame(payload: number[]): GumaxLedFrame | null {
  if (payload.length !== FRAME_BITS) return null;
  return {
    remoteId: bitsToNumber(payload.slice(0, REMOTE_ID_BITS)),
    command:  bitsToNumber(payload.slice(REMOTE_ID_BITS)),
  };
}
