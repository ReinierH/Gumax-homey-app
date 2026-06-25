import Homey from 'homey';
import { decodeFrame } from './protocol';

const SIGNAL_ID     = 'gumax';
const LEARN_TIMEOUT = 30_000;

interface LearnedDevice {
  name:  string;
  data:  { id: string };
  store: { remoteId: number };
}

class GumaxLedDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('Gumax LED driver initialized');
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let learnedDevice: LearnedDevice | null = null;

    session.setHandler('learn', async (): Promise<void> => {
      const signal = this.homey.rf.getSignal433(SIGNAL_ID);

      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const cleanup = () => signal.disableRX().catch(() => {});

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          signal.removeListener('payload', onPayload);
          cleanup();
          reject(new Error(this.homey.__('pair.learn.timeout')));
        }, LEARN_TIMEOUT);

        const onPayload = (payload: number[], first: boolean) => {
          if (!first || settled) return;

          const frame = decodeFrame(payload);
          if (!frame) return; // unexpected length — ignore

          settled = true;
          clearTimeout(timer);
          signal.removeListener('payload', onPayload);
          cleanup();

          this.log(`Learned remote: id=0x${frame.remoteId.toString(16).padStart(5, '0')} cmd=0x${frame.command.toString(16)}`);

          learnedDevice = {
            name:  this.homey.__('pair.learn.device_name'),
            data:  { id: frame.remoteId.toString(16).padStart(5, '0') },
            store: { remoteId: frame.remoteId },
          };

          resolve();
        };

        signal.on('payload', onPayload);
        signal.enableRX().catch((err: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeListener('payload', onPayload);
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
