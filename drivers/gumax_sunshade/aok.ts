// A-OK AC114/AC123 protocol for Gumax motorised sunshading
// Protocol reverse-engineered by Antti Kirjavainen and Jason von Nieda
//
// Frame layout (65 bits):
//   Bits  0– 7 : Start byte, always 0xA3
//   Bits  8–31 : Remote ID (24 bits, unique per remote)
//   Bits 32–47 : Channel / address bitmask (16 bits)
//   Bits 48–55 : Command byte (8 bits)
//   Bits 56–63 : Checksum = 8-bit sum of ID bytes + Address bytes + Command
//   Bit  64    : Trailing 1 (always)
//
// Bit encoding (PWM):
//   Bit 0 → SHORT HIGH (~270 µs) + LONG  LOW (~565 µs)  → word index 0
//   Bit 1 → LONG  HIGH (~565 µs) + SHORT LOW (~270 µs)  → word index 1
//
// SOF: HIGH 5300 µs → LOW 530 µs
// EOF / inter-command gap: 5030 µs
// Repetitions: 8

export const AOK_START_BYTE = 0xa3;
export const AOK_FRAME_BITS = 65;

export const AOK_CMD_UP      = 0x0b;  // 11
export const AOK_CMD_STOP    = 0x23;  // 35
export const AOK_CMD_DOWN    = 0x43;  // 67
export const AOK_CMD_PROGRAM = 0x53;  // 83

export interface AokFrame {
  remoteId: number;  // 24-bit remote identifier
  channel:  number;  // 16-bit channel / address bitmask
  command:  number;  // 8-bit command byte
}

function numberToBits(value: number, length: number): number[] {
  const bits: number[] = [];
  for (let i = length - 1; i >= 0; i--) bits.push((value >> i) & 1);
  return bits;
}

function bitsToNumber(bits: number[]): number {
  return bits.reduce((acc, b) => (acc << 1) | b, 0);
}

function calcChecksum(remoteId: number, channel: number, command: number): number {
  const id2   = (remoteId >> 16) & 0xff;
  const id1   = (remoteId >>  8) & 0xff;
  const id0   =  remoteId        & 0xff;
  const addr1 = (channel  >>  8) & 0xff;
  const addr0 =  channel         & 0xff;
  return (id2 + id1 + id0 + addr1 + addr0 + command) & 0xff;
}

/**
 * Build a 65-element word-index array for an A-OK command frame.
 * word 0 = bit-0 timing, word 1 = bit-1 timing (as defined in aok.json).
 */
export function buildFrame(remoteId: number, channel: number, command: number): number[] {
  const checksum = calcChecksum(remoteId, channel, command);
  return [
    ...numberToBits(AOK_START_BYTE, 8),
    ...numberToBits(remoteId, 24),
    ...numberToBits(channel,  16),
    ...numberToBits(command,   8),
    ...numberToBits(checksum,  8),
    1, // trailing bit
  ];
}

/**
 * Decode a received 65-element payload into an AokFrame.
 * Returns null if the frame structure or checksum is invalid.
 */
export function decodeFrame(payload: number[]): AokFrame | null {
  if (payload.length !== AOK_FRAME_BITS) return null;

  const startByte = bitsToNumber(payload.slice(0, 8));
  if (startByte !== AOK_START_BYTE) return null;
  if (payload[64] !== 1) return null;

  const remoteId = bitsToNumber(payload.slice(8,  32));
  const channel  = bitsToNumber(payload.slice(32, 48));
  const command  = bitsToNumber(payload.slice(48, 56));
  const checksum = bitsToNumber(payload.slice(56, 64));

  if (checksum !== calcChecksum(remoteId, channel, command)) return null;

  return { remoteId, channel, command };
}
