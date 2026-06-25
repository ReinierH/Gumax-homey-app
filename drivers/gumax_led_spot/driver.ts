import Homey from 'homey';
import { decodeFrame, FRAME_BITS } from './protocol';

const SIGNAL_ID     = 'gumax_rx';
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
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let learnedDevice: LearnedDevice | null = null;

    session.setHandler('learn', async (): Promise<void> => {
      const signal = this.homey.rf.getSignal433(SIGNAL_ID);
      this.log(`[learn] enabling RX on "${SIGNAL_ID}"`);

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let rxCount = 0;

        const cleanup = () => signal.disableRX().catch((e: Error) => this.log('[learn] disableRX error:', e.message));

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          signal.removeListener('payload', onPayload);
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
          signal.removeListener('payload', onPayload);
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
        signal.enableRX()
          .then(() => this.log(`[learn] "${SIGNAL_ID}" RX enabled OK`))
          .catch((err: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeListener('payload', onPayload);
            this.log('[learn] enableRX FAILED:', err.message);
            reject(err);
          });
      });
    });

    session.setHandler('list_devices', async (): Promise<LearnedDevice[]> => {
      if (!learnedDevice) return [];
      return [learnedDevice];
    });
  }
}

export = GumaxLedDriver;
