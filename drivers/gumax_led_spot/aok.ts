// A-OK AC114/AC123 protocol implementation
// Protocol reverse-engineered by Antti Kirjavainen and Jason von Nieda
// Frame: [Start:8][ID:24][Address:16][Command:8][Checksum:8][1]

export const AOK_START_BYTE = 0xa3;
export const AOK_FRAME_BITS = 65;

export const AOK_CMD_UP = 0x0b;       // 11
export const AOK_CMD_STOP = 0x23;     // 35
export const AOK_CMD_DOWN = 0x43;     // 67
export const AOK_CMD_PROGRAM = 0x53;  // 83

export interface AokFrame {
  remoteId: number;  // 24-bit remote identifier
  channel: number;   // 16-bit channel / address bitmask
  command: number;   // 8-bit command byte
}

function numberToBits(value: number, length: number): number[] {
  const bits: number[] = [];
  for (let i = length - 1; i >= 0; i--) {
    bits.push((value >> i) & 1);
  }
  return bits;
}

function bitsToNumber(bits: number[]): number {
  let value = 0;
  for (const bit of bits) {
    value = (value << 1) | bit;
  }
  return value;
}

function calcChecksum(remoteId: number, channel: number, command: number): number {
  const id2 = (remoteId >> 16) & 0xff;
  const id1 = (remoteId >> 8) & 0xff;
  const id0 = remoteId & 0xff;
  const addr1 = (channel >> 8) & 0xff;
  const addr0 = channel & 0xff;
  return (id2 + id1 + id0 + addr1 + addr0 + command) & 0xff;
}

/**
 * Build a 65-element array of word indexes (0 or 1) for an A-OK command frame.
 * Index 0 → words[0] (short HIGH + long LOW = bit 0)
 * Index 1 → words[1] (long HIGH + short LOW = bit 1)
 */
export function buildFrame(remoteId: number, channel: number, command: number): number[] {
  const checksum = calcChecksum(remoteId, channel, command);
  return [
    ...numberToBits(AOK_START_BYTE, 8),
    ...numberToBits(remoteId, 24),
    ...numberToBits(channel, 16),
    ...numberToBits(command, 8),
    ...numberToBits(checksum, 8),
    1, // trailing bit (always 1)
  ];
}

/**
 * Decode a received payload (65 word indexes) into an AokFrame.
 * Returns null if the frame is invalid or the checksum doesn't match.
 */
export function decodeFrame(payload: number[]): AokFrame | null {
  if (payload.length !== AOK_FRAME_BITS) return null;

  const startByte = bitsToNumber(payload.slice(0, 8));
  if (startByte !== AOK_START_BYTE) return null;

  if (payload[64] !== 1) return null;

  const remoteId = bitsToNumber(payload.slice(8, 32));
  const channel = bitsToNumber(payload.slice(32, 48));
  const command = bitsToNumber(payload.slice(48, 56));
  const checksum = bitsToNumber(payload.slice(56, 64));

  if (checksum !== calcChecksum(remoteId, channel, command)) return null;

  return { remoteId, channel, command };
}
