import Homey from 'homey';
import { formatPayload } from '../../lib/bits';
import { learnFrame } from '../../lib/learn';
import { decodeFrame } from './protocol';

const SIGNAL_RX_ID = 'gumax_rx';
const LEARN_TIMEOUT_MS = 30_000;

interface LearnedDevice {
  name: string;
  data: { id: string };
  store: { remoteId: number };
}

class GumaxLedSpotDriver extends Homey.Driver {
  override async onInit(): Promise<void> {
    this.log('Gumax LED spot driver initialized');

    // RX stays enabled for the lifetime of the app so paired devices can
    // mirror physical remote presses into their capability state.
    this.homey.rf
      .getSignal433(SIGNAL_RX_ID)
      .enableRX()
      .catch((err) => this.error('Failed to enable RX:', err));
  }

  override async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let learned: LearnedDevice | null = null;

    session.setHandler('learn', async (): Promise<void> => {
      this.log(`[learn] listening on "${SIGNAL_RX_ID}"`);

      const frame = await learnFrame({
        signal: this.homey.rf.getSignal433(SIGNAL_RX_ID),
        decode: decodeFrame,
        timeoutMs: LEARN_TIMEOUT_MS,
        timeoutMessage: this.homey.__('pair.learn.timeout'),
        onPayload: (payload, first) => this.log(`[learn] first=${first} ${formatPayload(payload)}`),
      });

      const id = frame.remoteId.toString(16).padStart(5, '0');
      this.log(`[learn] learned remote=0x${id} cmd=0x${frame.command.toString(16)}`);

      learned = {
        name: this.homey.__('pair.learn.device_name'),
        data: { id },
        store: { remoteId: frame.remoteId },
      };
    });

    session.setHandler('list_devices', async (): Promise<LearnedDevice[]> => (learned ? [learned] : []));
  }
}

export = GumaxLedSpotDriver;
