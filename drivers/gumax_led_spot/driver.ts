import Homey from 'homey';
import { decodeFrame, FRAME_BITS } from './protocol';

const SIGNAL_TX_ID  = 'gumax';
const SIGNAL_RX_ID  = 'gumax_rx';
const LEARN_TIMEOUT = 30_000;

interface LearnedDevice {
  name:  string;
  data:  { id: string };
  store: { remoteId: number };
}

function fmtPayload(payload: number[]): string {
  const bits = payload.join('');
  const hex  = parseInt(bits, 2).toString(16).toUpperCase().padStart(Math.ceil(payload.length / 4), '0');
  return `len=${payload.length} bits=[${bits}] hex=0x${hex}`;
}

class GumaxLedDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('Gumax LED driver initialized');

    // Enable RX permanently so devices can sniff physical remote presses.
    const signalRx = this.homey.rf.getSignal433(SIGNAL_RX_ID);
    signalRx.enableRX().catch((err: Error) => this.error('Failed to enable RX:', err.message));
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let learnedDevice: LearnedDevice | null = null;

    // RX is already enabled by onInit — just attach a listener for pairing.
    session.setHandler('learn', async (): Promise<void> => {
      const signal = this.homey.rf.getSignal433(SIGNAL_RX_ID);
      this.log(`[learn] listening on "${SIGNAL_RX_ID}"`);

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let rxCount = 0;

        const cleanup = () => signal.removeListener('payload', onPayload);

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          this.log(`[learn] TIMEOUT — received ${rxCount} payload event(s)`);
          reject(new Error(this.homey.__('pair.learn.timeout')));
        }, LEARN_TIMEOUT);

        const onPayload = (payload: number[], first: boolean) => {
          rxCount++;
          this.log(`[learn] #${rxCount} first=${first} ${fmtPayload(payload)}`);

          if (payload.length !== FRAME_BITS || !first || settled) return;

          const frame = decodeFrame(payload);
          if (!frame) return;

          settled = true;
          clearTimeout(timer);
          cleanup();

          this.log(`[learn] SUCCESS remoteId=0x${frame.remoteId.toString(16).padStart(5, '0')} cmd=0x${frame.command.toString(16)}`);

          learnedDevice = {
            name:  this.homey.__('pair.learn.device_name'),
            data:  { id: frame.remoteId.toString(16).padStart(5, '0') },
            store: { remoteId: frame.remoteId },
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

export = GumaxLedDriver;
