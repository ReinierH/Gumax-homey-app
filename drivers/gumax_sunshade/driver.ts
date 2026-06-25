import Homey from 'homey';
import { decodeFrame } from './aok';

const SIGNAL_ID     = 'aok';
const LEARN_TIMEOUT = 30_000;

interface LearnedDevice {
  name:  string;
  data:  { id: string };
  store: { remoteId: number; channel: number };
}

export default class GumaxShadeDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('Gumax sunshade driver initialized');

    this.homey.flow
      .getActionCard('shade_up')
      .registerRunListener(async ({ device }: { device: Homey.Device }) => {
        await (device as any).cmdUp();
      });

    this.homey.flow
      .getActionCard('shade_stop')
      .registerRunListener(async ({ device }: { device: Homey.Device }) => {
        await (device as any).cmdStop();
      });

    this.homey.flow
      .getActionCard('shade_down')
      .registerRunListener(async ({ device }: { device: Homey.Device }) => {
        await (device as any).cmdDown();
      });
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
          if (!frame) {
            this.log('Ignoring non-A-OK frame during learn');
            return;
          }

          settled = true;
          clearTimeout(timer);
          signal.removeListener('payload', onPayload);
          cleanup();

          this.log(`Learned: id=0x${frame.remoteId.toString(16)} ch=0x${frame.channel.toString(16)} cmd=0x${frame.command.toString(16)}`);

          learnedDevice = {
            name:  this.homey.__('pair.shade.device_name'),
            data:  { id: `${frame.remoteId.toString(16).padStart(6, '0')}-${frame.channel.toString(16).padStart(4, '0')}` },
            store: { remoteId: frame.remoteId, channel: frame.channel },
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
