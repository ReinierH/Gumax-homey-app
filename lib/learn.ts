import type { Signal433 } from 'homey';

export interface LearnFrameOptions<TFrame> {
  /** Signal to listen on. RX must already be enabled by the caller. */
  signal: Signal433;
  /** Decode a raw payload; return `null` to keep listening. */
  decode: (payload: number[]) => TFrame | null;
  timeoutMs: number;
  /** Error message used when the timeout elapses (already localized). */
  timeoutMessage: string;
  /** Optional hook invoked for every received payload, e.g. for logging. */
  onPayload?: (payload: number[], first: boolean) => void;
}

/**
 * Resolve with the first successfully decoded frame received on `signal`,
 * or reject once `timeoutMs` elapses.
 *
 * Only payloads flagged `first` (the first repetition of a button press)
 * are decoded, so holding a remote button yields a single frame.
 */
export function learnFrame<TFrame>(options: LearnFrameOptions<TFrame>): Promise<TFrame> {
  const { signal, decode, timeoutMs, timeoutMessage, onPayload } = options;

  return new Promise<TFrame>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      signal.removeListener('payload', handlePayload);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    const handlePayload = (payload: number[], first: boolean): void => {
      onPayload?.(payload, first);
      if (!first) return;

      const frame = decode(payload);
      if (frame === null) return;

      cleanup();
      resolve(frame);
    };

    signal.on('payload', handlePayload);
  });
}
