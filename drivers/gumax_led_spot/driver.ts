import Homey from 'homey';
import { decodeFrame } from './aok';

const LEARN_TIMEOUT_MS = 30_000;
const SIGNAL_ID = 'aok';

interface LearnedDevice {
  name: string;
  data: { id: string };
  store: {
    remoteId: number;
    channel: number;
    onCode: number[];
    offCode: number[];
  };
}

export default class GumaxDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('Gumax LED driver initialized');

    this.homey.flow
      .getActionCard('turn_on')
      .registerRunListener(async ({ device }: { device: Homey.Device }) => {
        await (device as any).cmdOn();
      });

    this.homey.flow
      .getActionCard('turn_off')
      .registerRunListener(async ({ device }: { device: Homey.Device }) => {
        await (device as any).cmdOff();
      });
  }

  async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let learnedDevice: LearnedDevice | null = null;

    // Learn a single button press — returns decoded frame + raw payload
    const learnOne = (): Promise<{ remoteId: number; channel: number; payload: number[] }> => {
      const signal = this.homey.rf.getSignal433(SIGNAL_ID);

      return new Promise((resolve, reject) => {
        let settled = false;

        const cleanup = () => signal.disableRX().catch(() => {});

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          signal.removeListener('payload', onPayload);
          cleanup();
          reject(new Error(this.homey.__('pair.learn.timeout')));
        }, LEARN_TIMEOUT_MS);

        const onPayload = (payload: number[], first: boolean) => {
          if (!first || settled) return;

          const frame = decodeFrame(payload);
          if (!frame) {
            this.log('Ignoring non-A-OK frame during learn');
            return;
          }

          settled = true;
          clearTimeout(timer);
          signal.removeListener('payload', onPayload);
          cleanup();

          this.log(`Learned: id=0x${frame.remoteId.toString(16)} ch=0x${frame.channel.toString(16)} cmd=0x${frame.command.toString(16)}`);
          resolve({ remoteId: frame.remoteId, channel: frame.channel, payload: [...payload] });
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
    };

    session.setHandler('learn_on', async (): Promise<void> => {
      const { remoteId, channel, payload } = await learnOne();
      // Store partial device — off code learned next
      learnedDevice = {
        name: this.homey.__('pair.learn.device_name'),
        data: {
          id: `${remoteId.toString(16).padStart(6, '0')}-${channel.toString(16).padStart(4, '0')}`,
        },
        store: { remoteId, channel, onCode: payload, offCode: payload }, // offCode overwritten below
      };
    });

    session.setHandler('learn_off', async (): Promise<void> => {
      if (!learnedDevice) throw new Error('Learn ON first');
      const { payload } = await learnOne();
      learnedDevice.store.offCode = payload;
    });

    session.setHandler('skip_off', async (): Promise<void> => {
      if (!learnedDevice) throw new Error('Learn ON first');
      // Use ON code as OFF code (for toggle-style remotes)
      learnedDevice.store.offCode = learnedDevice.store.onCode;
    });

    session.setHandler('list_devices', async (): Promise<LearnedDevice[]> => {
      if (!learnedDevice) return [];
      return [learnedDevice];
    });
  }
}
