import Homey from 'homey';
import { decodeFrame, FRAME_BITS, CH_ALL } from './protocol';

const SIGNAL_RX_ID  = 'gumax_shutter_rx';
const LEARN_TIMEOUT = 30_000;

interface LearnedDevice {
  name:  string;
  data:  { id: string };
  store: { remoteId: number; channelMask: number };
}

function fmtPayload(payload: number[]): string {
  const hex = payload
    .join('')
    .match(/.{8}/g)!
    .map(b => parseInt(b, 2).toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
  return `len=${payload.length} bytes=[${hex}]`;
}

/** Human-readable channel label from a 16-bit mask (up to 16 channels). */
function channelLabel(channelMask: number): string {
  if (channelMask === CH_ALL) return 'Alle kanalen';
  const channels: number[] = [];
  for (let i = 0; i < 16; i++) {
    if (channelMask & (1 << i)) channels.push(i + 1);
  }
  if (channels.length === 1) return `Kanaal ${channels[0]}`;
  return `Kanalen ${channels.join(', ')}`;
}

class GumaxShadeDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('Gumax sunshade driver initialized');
    const signalRx = this.homey.rf.getSignal433(SIGNAL_RX_ID);
    signalRx.enableRX().catch((err: Error) => this.error('Failed to enable RX:', err.message));
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let learnedDevice: LearnedDevice | null = null;

    session.setHandler('learn', async (): Promise<void> => {
      const signal = this.homey.rf.getSignal433(SIGNAL_RX_ID);
      this.log(`[learn] listening on "${SIGNAL_RX_ID}"`);

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let rxCount = 0;

        const cleanup = (): void => { signal.removeListener('payload', onPayload); };

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          this.log(`[learn] TIMEOUT — received ${rxCount} payload event(s)`);
          reject(new Error(this.homey.__('pair.shade.timeout')));
        }, LEARN_TIMEOUT);

        const onPayload = (payload: number[], first: boolean): void => {
          rxCount++;
          this.log(`[learn] #${rxCount} first=${first} ${fmtPayload(payload)}`);

          if (payload.length !== FRAME_BITS || !first || settled) return;

          const frame = decodeFrame(payload);
          if (!frame) {
            this.log('[learn] checksum mismatch — ignoring');
            return;
          }

          settled = true;
          clearTimeout(timer);
          cleanup();

          const label = channelLabel(frame.channelMask);
          this.log(`[learn] SUCCESS remote=0x${frame.remoteId.toString(16).padStart(8, '0')} mask=0x${frame.channelMask.toString(16).padStart(4, '0')} (${label}) cmd=0x${frame.command.toString(16)}`);

          learnedDevice = {
            name:  `Gumax Zonwering — ${label}`,
            data:  { id: `${frame.remoteId.toString(16).padStart(8, '0')}-${frame.channelMask.toString(16).padStart(4, '0')}` },
            store: { remoteId: frame.remoteId, channelMask: frame.channelMask },
          };

          resolve();
        };

        signal.on('payload', onPayload);
      });
    });

    session.setHandler('list_devices', async (): Promise<LearnedDevice[]> => {
      if (!learnedDevice) return [];
      return [learnedDevice];
    });
  }
}

export = GumaxShadeDriver;
